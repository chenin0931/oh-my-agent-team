package service

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/chenin0931/oh-my-agent-team/server/pkg/db/generated"
)

func managedTestUUID(value byte) pgtype.UUID {
	var bytes [16]byte
	bytes[15] = value
	return pgtype.UUID{Bytes: bytes, Valid: true}
}

func TestManagedSessionStateMachine(t *testing.T) {
	tests := []struct {
		from, to string
		want     bool
	}{
		{SessionStatusQueued, SessionStatusRunning, true},
		{SessionStatusRunning, SessionStatusWaitingApproval, true},
		{SessionStatusWaitingApproval, SessionStatusQueued, true},
		{SessionStatusWaitingEnvironment, SessionStatusQueued, true},
		{SessionStatusCompleted, SessionStatusRunning, false},
		{SessionStatusCancelled, SessionStatusQueued, false},
	}
	for _, test := range tests {
		if got := CanTransitionManagedSession(test.from, test.to); got != test.want {
			t.Errorf("CanTransitionManagedSession(%q, %q) = %v, want %v", test.from, test.to, got, test.want)
		}
	}
}

func TestComposioToolkitsFromVersion(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want []string
		ok   bool
	}{
		{name: "frozen membership", raw: `{"composio_toolkits":["slack","github"]}`, want: []string{"slack", "github"}, ok: true},
		{name: "frozen empty membership", raw: `{"composio_toolkits":[]}`, want: []string{}, ok: true},
		{name: "old snapshot", raw: `{"mcp_server_names":[]}`, ok: false},
		{name: "invalid snapshot", raw: `{`, ok: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := composioToolkitsFromVersion([]byte(tt.raw))
			if ok != tt.ok {
				t.Fatalf("ok = %v, want %v", ok, tt.ok)
			}
			if stringSliceJSON(got) != stringSliceJSON(tt.want) {
				t.Fatalf("allowlist = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSanitizeManagedEventPayloadHidesMachinePathsAndSecrets(t *testing.T) {
	got := sanitizeManagedEventPayload(map[string]any{
		"message": "Wrote /Users/alice/work/acme/report.md using token=super-secret-value",
		"route":   "/api/issues/TES-1",
		"attempt": 1,
		"ratio":   0.75,
		"ready":   true,
		"nested":  []any{2, false},
	}).(map[string]any)
	message, _ := got["message"].(string)
	if message != "Wrote [PRIVATE PATH] using [REDACTED CREDENTIAL]" {
		t.Fatalf("message = %q", message)
	}
	if got["route"] != "/api/issues/TES-1" {
		t.Fatalf("API route should remain visible, got %v", got["route"])
	}
	if got["attempt"] != 1 || got["ratio"] != 0.75 || got["ready"] != true {
		t.Fatalf("JSON scalar values should remain unchanged, got %#v", got)
	}
	nested, ok := got["nested"].([]any)
	if !ok || len(nested) != 2 || nested[0] != 2 || nested[1] != false {
		t.Fatalf("nested scalar values should remain unchanged, got %#v", got["nested"])
	}
}

func stringSliceJSON(values []string) string {
	b, _ := json.Marshal(values)
	return string(b)
}

func TestManagedAdvisorAndReviewerPoliciesDenyMutation(t *testing.T) {
	for _, mode := range []string{SessionModeAdvisor, SessionModeReviewer} {
		policy := DefaultSessionPermissionPolicy(mode)
		if got := PermissionDecisionForAction(policy, "issue.comment"); got != PermissionAllow {
			t.Errorf("%s comment decision = %q", mode, got)
		}
		for _, action := range []string{"workspace.write", "issue.status.own", "issue.create", "external.write"} {
			if got := PermissionDecisionForAction(policy, action); got != PermissionDeny {
				t.Errorf("%s %s decision = %q, want deny", mode, action, got)
			}
		}
	}
}

func TestManagedExecutorPolicyKeepsHumanFinalizationAndBatchControl(t *testing.T) {
	policy := DefaultSessionPermissionPolicy(SessionModeExecutor)
	for action, want := range map[string]PermissionDecision{
		"issue.comment":          PermissionAllow,
		"issue.status.own":       PermissionAllow,
		"issue.status.review":    PermissionDeny,
		"workspace.write":        PermissionAsk,
		"issue.create":           PermissionAsk,
		"issue.status.finalize":  PermissionDeny,
		"workspace.batch_write":  PermissionDeny,
		"workspace.batch_delete": PermissionDeny,
	} {
		if got := PermissionDecisionForAction(policy, action); got != want {
			t.Errorf("%s decision = %q, want %q", action, got, want)
		}
	}
}

func TestParseManagedOutcomeReviewResult(t *testing.T) {
	tests := []struct {
		name        string
		output      string
		wantVerdict string
		wantErr     bool
	}{
		{
			name:        "fenced JSON",
			output:      "```json\n{\"verdict\":\"revision_requested\",\"summary\":\"Add evidence for the second criterion.\",\"evidence\":[\"Criterion two has no source\"]}\n```",
			wantVerdict: "revision_requested",
		},
		{
			name:        "provider progress message before JSON",
			output:      "I will inspect the evidence, then return JSON.{\"verdict\":\"passed\",\"summary\":\"All criteria have evidence.\",\"evidence\":[\"The issue comment contains the result.\"]}",
			wantVerdict: "passed",
		},
		{
			name:        "trailing provider text",
			output:      "{\"verdict\":\"passed\",\"summary\":\"Verified.\",\"evidence\":[]} Review complete.",
			wantVerdict: "passed",
		},
		{
			name:    "unsupported verdict",
			output:  "{\"verdict\":\"maybe\",\"summary\":\"Uncertain.\",\"evidence\":[]}",
			wantErr: true,
		},
		{
			name:    "empty output",
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, _ := json.Marshal(map[string]any{"task_id": "task-1", "output": tt.output})
			got, err := parseManagedOutcomeReviewResult(payload)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %#v", got)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got.Verdict != tt.wantVerdict || len(got.Evidence) != 1 && tt.name != "trailing provider text" {
				t.Fatalf("unexpected result: %#v", got)
			}
		})
	}
}

func TestOutcomeReviewRetryStatusPreservesIterationPhase(t *testing.T) {
	if got := outcomeReviewRetryStatus(0); got != "pending" {
		t.Fatalf("initial review retry status = %q, want pending", got)
	}
	if got := outcomeReviewRetryStatus(1); got != "revision_requested" {
		t.Fatalf("revision review retry status = %q, want revision_requested", got)
	}
}

func TestHasActiveOutcomeReviewTaskIgnoresExecutorTurns(t *testing.T) {
	reviewContext, _ := json.Marshal(ManagedOutcomeReviewContext{Type: ManagedOutcomeReviewContextType})
	sessionID := managedTestUUID(31)
	threadID := managedTestUUID(32)
	tasks := []db.AgentTaskQueue{
		{Status: "queued"},
		{Status: "completed", Context: reviewContext, AgentSessionID: sessionID, SessionThreadID: threadID},
	}
	if hasActiveOutcomeReviewTask(tasks) {
		t.Fatal("executor and completed reviewer tasks must not block a retry")
	}
	tasks = append(tasks, db.AgentTaskQueue{Status: "queued", Context: reviewContext, AgentSessionID: sessionID, SessionThreadID: threadID})
	if !hasActiveOutcomeReviewTask(tasks) {
		t.Fatal("queued reviewer task must block a duplicate retry")
	}
}

func TestManagedSessionCanResumeOnlyEligibleAssignee(t *testing.T) {
	agentID := pgtype.UUID{Bytes: [16]byte{1}, Valid: true}
	squadID := pgtype.UUID{Bytes: [16]byte{2}, Valid: true}
	issue := db.Issue{ID: pgtype.UUID{Bytes: [16]byte{3}, Valid: true}, IssueType: IssueTypeIssue, Status: "todo", AssigneeType: pgtype.Text{String: "agent", Valid: true}, AssigneeID: agentID}
	session := db.AgentSession{Mode: SessionModeExecutor}
	thread := db.AgentSessionThread{AgentID: agentID}
	if !managedSessionCanResume(issue, session, thread) {
		t.Fatal("expected assigned active issue to resume")
	}
	issue.Status = "backlog"
	if managedSessionCanResume(issue, session, thread) {
		t.Fatal("backlog issue must not resume")
	}
	issue.Status = "todo"
	issue.AssigneeType = pgtype.Text{String: "squad", Valid: true}
	issue.AssigneeID = squadID
	session.Mode = SessionModeCoordinator
	session.EntrySquadID = squadID
	if !managedSessionCanResume(issue, session, thread) {
		t.Fatal("assigned squad coordinator should resume")
	}
}

func TestManagedSessionMatchesAssignee(t *testing.T) {
	agentID := pgtype.UUID{Bytes: [16]byte{1}, Valid: true}
	squadID := pgtype.UUID{Bytes: [16]byte{2}, Valid: true}
	if !managedSessionMatchesAssignee(db.AgentSession{EntryAgentID: agentID}, "agent", agentID) {
		t.Fatal("same Agent should keep its executor Session")
	}
	if managedSessionMatchesAssignee(db.AgentSession{EntryAgentID: agentID}, "member", agentID) {
		t.Fatal("human handoff must close an Agent executor Session")
	}
	if !managedSessionMatchesAssignee(db.AgentSession{EntrySquadID: squadID}, "squad", squadID) {
		t.Fatal("same Squad should keep its coordinator Session")
	}
	if managedSessionMatchesAssignee(db.AgentSession{EntrySquadID: squadID}, "agent", agentID) {
		t.Fatal("Squad to Agent handoff must close the coordinator Session")
	}
}

func TestDecideManagedSquadCompletionWaitsForEveryThreadAndResumesOnce(t *testing.T) {
	base := time.Date(2026, 7, 18, 1, 0, 0, 0, time.UTC)
	rootID := managedTestUUID(10)
	childAID := managedTestUUID(11)
	childBID := managedTestUUID(12)
	triggerID := managedTestUUID(20)
	threads := []db.AgentSessionThread{
		{ID: rootID, Role: SessionModeCoordinator},
		{ID: childAID, ParentThreadID: rootID, Role: SessionModeExecutor},
		{ID: childBID, ParentThreadID: rootID, Role: SessionModeExecutor},
	}
	completed := func(id pgtype.UUID, threadID pgtype.UUID, offset time.Duration) db.AgentTaskQueue {
		return db.AgentTaskQueue{
			ID: id, SessionThreadID: threadID, TriggerCommentID: triggerID, Status: "completed",
			CreatedAt:   pgtype.Timestamptz{Time: base, Valid: true},
			CompletedAt: pgtype.Timestamptz{Time: base.Add(offset), Valid: true},
		}
	}

	childA := completed(managedTestUUID(1), childAID, time.Second)
	childB := completed(managedTestUUID(2), childBID, 2*time.Second)
	runningChild := childB
	runningChild.Status = "running"
	runningChild.CompletedAt = pgtype.Timestamptz{}

	decision := decideManagedSquadCompletion(childA, threads[1], []db.AgentTaskQueue{childA, runningChild}, threads)
	if !decision.deferFinalization || decision.resumeCoordinator {
		t.Fatalf("first child should wait for its sibling, got %#v", decision)
	}

	decision = decideManagedSquadCompletion(childB, threads[2], []db.AgentTaskQueue{childA, childB}, threads)
	if !decision.deferFinalization || !decision.resumeCoordinator || decision.completed != 2 || decision.failed != 0 {
		t.Fatalf("last child should resume the coordinator once, got %#v", decision)
	}

	decision = decideManagedSquadCompletion(childA, threads[1], []db.AgentTaskQueue{childA, childB}, threads)
	if !decision.deferFinalization || decision.resumeCoordinator {
		t.Fatalf("a delayed earlier callback must not enqueue a duplicate synthesis, got %#v", decision)
	}
}

func TestDecideManagedSquadCompletionHandlesFastChildrenBeforeLeaderStops(t *testing.T) {
	base := time.Date(2026, 7, 18, 1, 0, 0, 0, time.UTC)
	rootID := managedTestUUID(30)
	childID := managedTestUUID(31)
	threads := []db.AgentSessionThread{
		{ID: rootID, Role: SessionModeCoordinator},
		{ID: childID, ParentThreadID: rootID, Role: SessionModeExecutor},
	}
	leader := db.AgentTaskQueue{
		ID: managedTestUUID(3), SessionThreadID: rootID, Status: "completed",
		StartedAt:   pgtype.Timestamptz{Time: base, Valid: true},
		CompletedAt: pgtype.Timestamptz{Time: base.Add(5 * time.Second), Valid: true},
	}
	child := db.AgentTaskQueue{
		ID: managedTestUUID(4), SessionThreadID: childID, TriggerCommentID: managedTestUUID(32), Status: "completed",
		CreatedAt:   pgtype.Timestamptz{Time: base.Add(time.Second), Valid: true},
		CompletedAt: pgtype.Timestamptz{Time: base.Add(3 * time.Second), Valid: true},
	}
	decision := decideManagedSquadCompletion(leader, threads[0], []db.AgentTaskQueue{leader, child}, threads)
	if !decision.deferFinalization || !decision.resumeCoordinator || decision.completed != 1 {
		t.Fatalf("leader should schedule synthesis when fast children already stopped, got %#v", decision)
	}

	oldChild := child
	oldChild.CreatedAt = pgtype.Timestamptz{Time: base.Add(-time.Second), Valid: true}
	decision = decideManagedSquadCompletion(leader, threads[0], []db.AgentTaskQueue{oldChild, leader}, threads)
	if decision.deferFinalization || decision.resumeCoordinator {
		t.Fatalf("a synthesis turn with no new delegation should finalize normally, got %#v", decision)
	}
}

func TestDecideManagedSquadCompletionIncludesFailedWorkers(t *testing.T) {
	base := time.Date(2026, 7, 18, 1, 0, 0, 0, time.UTC)
	rootID := managedTestUUID(40)
	childAID := managedTestUUID(41)
	childBID := managedTestUUID(42)
	triggerID := managedTestUUID(43)
	threads := []db.AgentSessionThread{
		{ID: rootID, Role: SessionModeCoordinator},
		{ID: childAID, ParentThreadID: rootID, Role: SessionModeExecutor},
		{ID: childBID, ParentThreadID: rootID, Role: SessionModeExecutor},
	}
	success := db.AgentTaskQueue{
		ID: managedTestUUID(5), SessionThreadID: childAID, TriggerCommentID: triggerID, Status: "completed",
		CompletedAt: pgtype.Timestamptz{Time: base.Add(time.Second), Valid: true},
	}
	failure := db.AgentTaskQueue{
		ID: managedTestUUID(6), SessionThreadID: childBID, TriggerCommentID: triggerID, Status: "failed",
		CompletedAt: pgtype.Timestamptz{Time: base.Add(2 * time.Second), Valid: true},
	}
	decision := decideManagedSquadCompletion(failure, threads[2], []db.AgentTaskQueue{success, failure}, threads)
	if !decision.resumeCoordinator || decision.completed != 1 || decision.failed != 1 {
		t.Fatalf("failed workers should be summarized by the coordinator, got %#v", decision)
	}
}
