package main

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/chenin0931/oh-my-agent-team/server/internal/events"
	"github.com/chenin0931/oh-my-agent-team/server/internal/service"
	"github.com/chenin0931/oh-my-agent-team/server/internal/util"
	db "github.com/chenin0931/oh-my-agent-team/server/pkg/db/generated"
)

// TestQuickCreateCompletion_SubscribesRequester locks in the fix for the
// quick-create requester not being subscribed to the issue: the agent runs
// the CLI and is recorded as the issue's creator, so the issue:created event
// only auto-subscribes the agent. The completion path must explicitly
// subscribe the human requester so they receive follow-up notifications. It
// also covers the multi-create path: a single quick-create task may now stamp
// more than one issue with its origin id, and each issue must be surfaced.
func TestQuickCreateCompletion_SubscribesRequester(t *testing.T) {
	ctx := context.Background()
	queries := db.New(testPool)
	bus := events.New()
	taskSvc := service.NewTaskService(queries, testPool, nil, bus)

	var agentID string
	if err := testPool.QueryRow(ctx,
		`SELECT id::text FROM agent WHERE workspace_id = $1 ORDER BY created_at ASC LIMIT 1`,
		testWorkspaceID,
	).Scan(&agentID); err != nil {
		t.Fatalf("load fixture agent: %v", err)
	}

	task, err := taskSvc.EnqueueQuickCreateTask(ctx,
		parseUUID(testWorkspaceID),
		parseUUID(testUserID),
		parseUUID(agentID),
		pgtype.UUID{},
		"please file a bug",
		pgtype.UUID{},
		pgtype.UUID{},
		nil,
	)
	if err != nil {
		t.Fatalf("EnqueueQuickCreateTask: %v", err)
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM agent_task_queue WHERE id = $1`, task.ID)
	})

	if _, err := testPool.Exec(ctx,
		`UPDATE agent_task_queue SET status = 'dispatched', dispatched_at = now() WHERE id = $1`,
		task.ID,
	); err != nil {
		t.Fatalf("dispatch task: %v", err)
	}
	if _, err := queries.StartAgentTask(ctx, task.ID); err != nil {
		t.Fatalf("StartAgentTask: %v", err)
	}

	number1, err := queries.IncrementIssueCounter(ctx, parseUUID(testWorkspaceID))
	if err != nil {
		t.Fatalf("IncrementIssueCounter: %v", err)
	}
	issue1, err := queries.CreateIssueWithOrigin(ctx, db.CreateIssueWithOriginParams{
		WorkspaceID: parseUUID(testWorkspaceID),
		Title:       "agent-filed bug",
		Status:      "todo",
		Priority:    "none",
		CreatorType: "agent",
		CreatorID:   parseUUID(agentID),
		Number:      number1,
		OriginType:  pgtype.Text{String: "quick_create", Valid: true},
		OriginID:    task.ID,
	})
	if err != nil {
		t.Fatalf("CreateIssueWithOrigin issue1: %v", err)
	}
	number2, err := queries.IncrementIssueCounter(ctx, parseUUID(testWorkspaceID))
	if err != nil {
		t.Fatalf("IncrementIssueCounter issue2: %v", err)
	}
	issue2, err := queries.CreateIssueWithOrigin(ctx, db.CreateIssueWithOriginParams{
		WorkspaceID: parseUUID(testWorkspaceID),
		Title:       "agent-filed follow-up",
		Status:      "todo",
		Priority:    "none",
		CreatorType: "agent",
		CreatorID:   parseUUID(agentID),
		Number:      number2,
		OriginType:  pgtype.Text{String: "quick_create", Valid: true},
		OriginID:    task.ID,
	})
	if err != nil {
		t.Fatalf("CreateIssueWithOrigin issue2: %v", err)
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM issue WHERE id IN ($1, $2)`, issue1.ID, issue2.ID)
	})

	if _, err := taskSvc.CompleteTask(ctx, task.ID, []byte(`{"output":"done"}`), "", ""); err != nil {
		t.Fatalf("CompleteTask: %v", err)
	}

	if !isSubscribed(t, queries, util.UUIDToString(issue1.ID), "member", testUserID) {
		t.Fatal("expected requester to be subscribed to first issue after quick-create completion")
	}
	if !isSubscribed(t, queries, util.UUIDToString(issue2.ID), "member", testUserID) {
		t.Fatal("expected requester to be subscribed to second issue after quick-create completion")
	}

	var details []byte
	if err := testPool.QueryRow(ctx, `
		SELECT details
		FROM inbox_item
		WHERE type = 'quick_create_done' AND recipient_id = $1 AND details->>'task_id' = $2
		ORDER BY created_at DESC
		LIMIT 1
	`, testUserID, util.UUIDToString(task.ID)).Scan(&details); err != nil {
		t.Fatalf("load quick-create inbox details: %v", err)
	}
	var payload struct {
		IssueCount int `json:"issue_count"`
		Issues     []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		} `json:"issues"`
	}
	if err := json.Unmarshal(details, &payload); err != nil {
		t.Fatalf("unmarshal quick-create inbox details: %v", err)
	}
	if payload.IssueCount != 2 || len(payload.Issues) != 2 {
		t.Fatalf("quick-create inbox details issue count = %d/%d, want 2/2; details=%s", payload.IssueCount, len(payload.Issues), string(details))
	}
}

func TestPlanningQuickCreateCompletionTargetsEpicAndReportsHierarchy(t *testing.T) {
	ctx := context.Background()
	queries := db.New(testPool)
	bus := events.New()
	taskSvc := service.NewTaskService(queries, testPool, nil, bus)

	var agentID string
	if err := testPool.QueryRow(ctx,
		`SELECT id::text FROM agent WHERE workspace_id = $1 ORDER BY created_at ASC LIMIT 1`,
		testWorkspaceID,
	).Scan(&agentID); err != nil {
		t.Fatalf("load fixture agent: %v", err)
	}

	var projectID string
	if err := testPool.QueryRow(ctx, `
		INSERT INTO project (workspace_id, title)
		VALUES ($1, 'Planning completion hierarchy')
		RETURNING id
	`, testWorkspaceID).Scan(&projectID); err != nil {
		t.Fatalf("create project: %v", err)
	}
	t.Cleanup(func() { testPool.Exec(context.Background(), `DELETE FROM project WHERE id = $1`, projectID) })

	task, err := taskSvc.EnqueueQuickCreateTaskWithOptions(ctx,
		parseUUID(testWorkspaceID),
		parseUUID(testUserID),
		parseUUID(agentID),
		pgtype.UUID{},
		"plan a multi-part launch",
		parseUUID(projectID),
		pgtype.UUID{},
		nil,
		service.QuickCreateTaskOptions{
			Mode:          service.QuickCreateModePlanning,
			DefaultStatus: service.QuickCreateDefaultStatusBacklog,
		},
	)
	if err != nil {
		t.Fatalf("EnqueueQuickCreateTaskWithOptions: %v", err)
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM inbox_item WHERE details->>'task_id' = $1`, util.UUIDToString(task.ID))
		testPool.Exec(context.Background(), `DELETE FROM agent_task_queue WHERE id = $1`, task.ID)
	})

	if _, err := testPool.Exec(ctx,
		`UPDATE agent_task_queue SET status = 'dispatched', dispatched_at = now() WHERE id = $1`,
		task.ID,
	); err != nil {
		t.Fatalf("dispatch task: %v", err)
	}
	if _, err := queries.StartAgentTask(ctx, task.ID); err != nil {
		t.Fatalf("StartAgentTask: %v", err)
	}

	create := func(title, issueType, status string, project, epic, parent pgtype.UUID) db.Issue {
		t.Helper()
		number, err := queries.IncrementIssueCounter(ctx, parseUUID(testWorkspaceID))
		if err != nil {
			t.Fatalf("IncrementIssueCounter for %s: %v", issueType, err)
		}
		item, err := queries.CreateIssueWithOrigin(ctx, db.CreateIssueWithOriginParams{
			WorkspaceID: parseUUID(testWorkspaceID), Title: title,
			IssueType: issueType, Status: status, Priority: "none",
			CreatorType: "agent", CreatorID: parseUUID(agentID), Number: number,
			ProjectID: project, EpicID: epic, ParentIssueID: parent,
			OriginType: pgtype.Text{String: "quick_create", Valid: true}, OriginID: task.ID,
		})
		if err != nil {
			t.Fatalf("CreateIssueWithOrigin %s: %v", issueType, err)
		}
		return item
	}

	projectUUID := parseUUID(projectID)
	epic := create("Launch outcome", "epic", "planned", projectUUID, pgtype.UUID{}, pgtype.UUID{})
	issue := create("Prepare launch", "issue", "backlog", projectUUID, epic.ID, pgtype.UUID{})
	subtask := create("Confirm launch copy", "subtask", "backlog", projectUUID, epic.ID, issue.ID)
	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM issue WHERE id IN ($1, $2, $3)`, subtask.ID, issue.ID, epic.ID)
	})

	if _, err := taskSvc.CompleteTask(ctx, task.ID, []byte(`{"output":"planned"}`), "", ""); err != nil {
		t.Fatalf("CompleteTask: %v", err)
	}

	var targetType, targetID, title string
	var details []byte
	if err := testPool.QueryRow(ctx, `
		SELECT target_type, target_id::text, title, details
		FROM inbox_item
		WHERE type = 'quick_create_done' AND recipient_id = $1 AND details->>'task_id' = $2
		ORDER BY created_at DESC LIMIT 1
	`, testUserID, util.UUIDToString(task.ID)).Scan(&targetType, &targetID, &title, &details); err != nil {
		t.Fatalf("load planning completion inbox: %v", err)
	}
	if targetType != "epic" || targetID != util.UUIDToString(epic.ID) {
		t.Fatalf("planning completion target = %s/%s, want epic/%s", targetType, targetID, util.UUIDToString(epic.ID))
	}
	if title != "Planned 1 epics, 1 issues, 1 subtasks" {
		t.Fatalf("planning completion title = %q", title)
	}
	var payload struct {
		EpicCount    int `json:"epic_count"`
		IssueCount   int `json:"issue_count"`
		SubtaskCount int `json:"subtask_count"`
		Epics        []struct {
			ID string `json:"id"`
		} `json:"epics"`
		Issues []struct {
			ID string `json:"id"`
		} `json:"issues"`
	}
	if err := json.Unmarshal(details, &payload); err != nil {
		t.Fatalf("unmarshal planning inbox details: %v", err)
	}
	if payload.EpicCount != 1 || payload.IssueCount != 1 || payload.SubtaskCount != 1 || len(payload.Epics) != 1 || len(payload.Issues) != 2 {
		t.Fatalf("planning hierarchy counts are wrong: %+v details=%s", payload, string(details))
	}
	for _, item := range []db.Issue{epic, issue, subtask} {
		if !isSubscribed(t, queries, util.UUIDToString(item.ID), "member", testUserID) {
			t.Fatalf("requester is not subscribed to planned %s %s", item.IssueType, util.UUIDToString(item.ID))
		}
	}
}

// TestQuickCreateFailure_DoesNotSubscribeRequester confirms the failure path
// (agent finished without producing an issue) does not invent a subscriber
// row — there is nothing to subscribe to.
func TestQuickCreateFailure_DoesNotSubscribeRequester(t *testing.T) {
	ctx := context.Background()
	queries := db.New(testPool)
	bus := events.New()
	taskSvc := service.NewTaskService(queries, testPool, nil, bus)

	var agentID string
	if err := testPool.QueryRow(ctx,
		`SELECT id::text FROM agent WHERE workspace_id = $1 ORDER BY created_at ASC LIMIT 1`,
		testWorkspaceID,
	).Scan(&agentID); err != nil {
		t.Fatalf("load fixture agent: %v", err)
	}

	task, err := taskSvc.EnqueueQuickCreateTask(ctx,
		parseUUID(testWorkspaceID),
		parseUUID(testUserID),
		parseUUID(agentID),
		pgtype.UUID{},
		"another bug",
		pgtype.UUID{},
		pgtype.UUID{},
		nil,
	)
	if err != nil {
		t.Fatalf("EnqueueQuickCreateTask: %v", err)
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM agent_task_queue WHERE id = $1`, task.ID)
	})

	if _, err := testPool.Exec(ctx,
		`UPDATE agent_task_queue SET status = 'dispatched', dispatched_at = now() WHERE id = $1`,
		task.ID,
	); err != nil {
		t.Fatalf("dispatch task: %v", err)
	}
	if _, err := queries.StartAgentTask(ctx, task.ID); err != nil {
		t.Fatalf("StartAgentTask: %v", err)
	}

	// No issue with origin_type=quick_create + this task id exists. Completion
	// hits the failure branch and writes a failure inbox; no subscriber row.
	if _, err := taskSvc.CompleteTask(ctx, task.ID, []byte(`{"output":"done"}`), "", ""); err != nil {
		t.Fatalf("CompleteTask: %v", err)
	}

	var leaked int
	if err := testPool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM issue_subscriber s
		JOIN issue i ON i.id = s.issue_id
		WHERE s.user_type = 'member' AND s.user_id = $1
		  AND i.origin_type = 'quick_create' AND i.origin_id = $2
	`, testUserID, task.ID).Scan(&leaked); err != nil {
		t.Fatalf("count leaked subscribers: %v", err)
	}
	if leaked != 0 {
		t.Fatalf("expected no subscriber rows for failed quick-create, got %d", leaked)
	}
}
