package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/chenin0931/oh-my-agent-team/server/internal/service"
)

func createHierarchyTestProject(t *testing.T) ProjectResponse {
	t.Helper()
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/projects?workspace_id="+testWorkspaceID, map[string]any{
		"title": fmt.Sprintf("Hierarchy project %d", time.Now().UnixNano()),
	})
	testHandler.CreateProject(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("create project: got %d: %s", w.Code, w.Body.String())
	}
	var project ProjectResponse
	if err := json.NewDecoder(w.Body).Decode(&project); err != nil {
		t.Fatalf("decode project: %v", err)
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM project WHERE id = $1`, project.ID)
	})
	return project
}

func createHierarchyTestIssue(t *testing.T, body map[string]any) IssueResponse {
	t.Helper()
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/issues?workspace_id="+testWorkspaceID, body)
	testHandler.CreateIssue(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("create issue: got %d: %s", w.Code, w.Body.String())
	}
	var issue IssueResponse
	if err := json.NewDecoder(w.Body).Decode(&issue); err != nil {
		t.Fatalf("decode issue: %v", err)
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM issue WHERE id = $1`, issue.ID)
	})
	return issue
}

func createHierarchyTestEpic(t *testing.T, body map[string]any) EpicResponse {
	t.Helper()
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/epics?workspace_id="+testWorkspaceID, body)
	testHandler.CreateEpic(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("create epic: got %d: %s", w.Code, w.Body.String())
	}
	var epic EpicResponse
	if err := json.NewDecoder(w.Body).Decode(&epic); err != nil {
		t.Fatalf("decode epic: %v", err)
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM issue WHERE id = $1`, epic.ID)
	})
	return epic
}

func TestIssueHierarchyEpicRequiresProjectAndNeverExecutes(t *testing.T) {
	w := httptest.NewRecorder()
	testHandler.CreateEpic(w, newRequest("POST", "/api/epics?workspace_id="+testWorkspaceID, map[string]any{
		"title": "Epic without project",
	}))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("epic without project: got %d: %s", w.Code, w.Body.String())
	}

	project := createHierarchyTestProject(t)
	agentID := createHandlerTestAgent(t, fmt.Sprintf("epic-owner-%d", time.Now().UnixNano()), nil)
	epic := createHierarchyTestEpic(t, map[string]any{
		"title":      "Enterprise rollout",
		"project_id": project.ID,
		"owner_type": "agent",
		"owner_id":   agentID,
	})

	var taskCount int
	if err := testPool.QueryRow(context.Background(), `SELECT count(*) FROM agent_task_queue WHERE issue_id = $1`, epic.ID).Scan(&taskCount); err != nil {
		t.Fatalf("count epic tasks: %v", err)
	}
	if taskCount != 0 {
		t.Fatalf("epic created %d agent tasks, want 0", taskCount)
	}

	for _, action := range []string{"continue", "summarize", "decompose"} {
		w := httptest.NewRecorder()
		req := withURLParam(newRequest("POST", "/api/issues/"+epic.ID+"/agent-actions?workspace_id="+testWorkspaceID, map[string]any{"action": action}), "id", epic.ID)
		testHandler.RunIssueAgentAction(w, req)
		if w.Code != http.StatusConflict {
			t.Fatalf("epic agent action %q: got %d: %s", action, w.Code, w.Body.String())
		}
	}
}

func TestIssueHierarchyInheritanceAndParentDeletePromotion(t *testing.T) {
	project := createHierarchyTestProject(t)
	epic := createHierarchyTestEpic(t, map[string]any{
		"title":      "Launch program",
		"project_id": project.ID,
	})
	issue := createHierarchyTestIssue(t, map[string]any{
		"title":      "Prepare launch brief",
		"issue_type": "issue",
		"epic_id":    epic.ID,
	})
	if issue.ProjectID == nil || *issue.ProjectID != project.ID {
		t.Fatalf("issue project = %v, want %s", issue.ProjectID, project.ID)
	}
	if issue.EpicID == nil || *issue.EpicID != epic.ID {
		t.Fatalf("issue epic = %v, want %s", issue.EpicID, epic.ID)
	}

	subtask := createHierarchyTestIssue(t, map[string]any{
		"title":           "Review launch copy",
		"parent_issue_id": issue.ID,
	})
	if subtask.IssueType != "subtask" {
		t.Fatalf("subtask type = %q, want subtask", subtask.IssueType)
	}
	if subtask.ProjectID == nil || *subtask.ProjectID != project.ID {
		t.Fatalf("subtask project = %v, want %s", subtask.ProjectID, project.ID)
	}
	if subtask.EpicID == nil || *subtask.EpicID != epic.ID {
		t.Fatalf("subtask epic = %v, want %s", subtask.EpicID, epic.ID)
	}

	w := httptest.NewRecorder()
	req := withURLParam(newRequest("DELETE", "/api/issues/"+issue.ID, nil), "id", issue.ID)
	testHandler.DeleteIssue(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("delete parent: got %d: %s", w.Code, w.Body.String())
	}

	var issueType string
	var parentID *string
	if err := testPool.QueryRow(context.Background(), `SELECT issue_type, parent_issue_id::text FROM issue WHERE id = $1`, subtask.ID).Scan(&issueType, &parentID); err != nil {
		t.Fatalf("load promoted subtask: %v", err)
	}
	if issueType != "issue" || parentID != nil {
		t.Fatalf("promoted child = type %q parent %v, want issue/null", issueType, parentID)
	}
}

func TestEpicPlanningAPIIsolatedFromExecutableIssues(t *testing.T) {
	project := createHierarchyTestProject(t)

	w := httptest.NewRecorder()
	testHandler.CreateIssue(w, newRequest("POST", "/api/issues?workspace_id="+testWorkspaceID, map[string]any{
		"title":      "Legacy Epic create path",
		"issue_type": "epic",
		"project_id": project.ID,
	}))
	if w.Code != http.StatusConflict {
		t.Fatalf("generic issue create for epic: got %d: %s", w.Code, w.Body.String())
	}

	epic := createHierarchyTestEpic(t, map[string]any{
		"title":            "Customer onboarding outcome",
		"project_id":       project.ID,
		"description":      "Reduce time to first value.",
		"success_criteria": "Median activation time is below one day.",
		"health":           "on_track",
	})
	if epic.Lifecycle != "planned" || epic.ProjectID != project.ID {
		t.Fatalf("created epic = lifecycle %q project %q", epic.Lifecycle, epic.ProjectID)
	}
	workItem := createHierarchyTestIssue(t, map[string]any{
		"title":      "Executable onboarding work",
		"project_id": project.ID,
	})

	w = httptest.NewRecorder()
	req := withURLParam(newRequest("PUT", "/api/issues/"+workItem.ID, map[string]any{"issue_type": "epic"}), "id", workItem.ID)
	testHandler.UpdateIssue(w, req)
	if w.Code != http.StatusConflict {
		t.Fatalf("convert issue to epic through generic update: got %d: %s", w.Code, w.Body.String())
	}

	w = httptest.NewRecorder()
	testHandler.BatchUpdateIssues(w, newRequest("POST", "/api/issues/batch-update?workspace_id="+testWorkspaceID, map[string]any{
		"issue_ids": []string{workItem.ID, epic.ID},
		"updates":   map[string]any{"status": "todo"},
	}))
	if w.Code != http.StatusConflict {
		t.Fatalf("batch update containing epic: got %d: %s", w.Code, w.Body.String())
	}
	var unchangedStatus string
	if err := testPool.QueryRow(context.Background(), `SELECT status FROM issue WHERE id = $1`, workItem.ID).Scan(&unchangedStatus); err != nil {
		t.Fatalf("load work item after rejected batch update: %v", err)
	}
	if unchangedStatus != "backlog" {
		t.Fatalf("rejected batch update partially changed work item to %q", unchangedStatus)
	}

	w = httptest.NewRecorder()
	testHandler.BatchDeleteIssues(w, newRequest("POST", "/api/issues/batch-delete?workspace_id="+testWorkspaceID, map[string]any{
		"issue_ids": []string{workItem.ID, epic.ID},
	}))
	if w.Code != http.StatusConflict {
		t.Fatalf("batch delete containing epic: got %d: %s", w.Code, w.Body.String())
	}
	var workItemStillExists bool
	if err := testPool.QueryRow(context.Background(), `SELECT EXISTS(SELECT 1 FROM issue WHERE id = $1)`, workItem.ID).Scan(&workItemStillExists); err != nil {
		t.Fatalf("check work item after rejected batch delete: %v", err)
	}
	if !workItemStillExists {
		t.Fatal("rejected batch delete removed an executable work item")
	}

	w = httptest.NewRecorder()
	testHandler.ListIssues(w, newRequest("GET", "/api/issues?workspace_id="+testWorkspaceID+"&limit=100", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("list executable issues: %d %s", w.Code, w.Body.String())
	}
	var issues struct {
		Issues []IssueResponse `json:"issues"`
	}
	if err := json.NewDecoder(w.Body).Decode(&issues); err != nil {
		t.Fatalf("decode issue list: %v", err)
	}
	for _, item := range issues.Issues {
		if item.ID == epic.ID || item.IssueType == "epic" {
			t.Fatalf("epic leaked through /api/issues: %+v", item)
		}
	}

	w = httptest.NewRecorder()
	req = withURLParam(newRequest("PUT", "/api/issues/"+epic.ID, map[string]any{"status": "todo"}), "id", epic.ID)
	testHandler.UpdateIssue(w, req)
	if w.Code != http.StatusConflict {
		t.Fatalf("generic issue update for epic: got %d: %s", w.Code, w.Body.String())
	}

	w = httptest.NewRecorder()
	req = withURLParam(newRequest("PUT", "/api/epics/"+epic.ID, map[string]any{
		"lifecycle": "in_progress",
		"health":    "at_risk",
	}), "id", epic.ID)
	testHandler.UpdateEpic(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("update epic: got %d: %s", w.Code, w.Body.String())
	}
	var taskCount int
	if err := testPool.QueryRow(context.Background(), `SELECT count(*) FROM agent_task_queue WHERE issue_id = $1`, epic.ID).Scan(&taskCount); err != nil {
		t.Fatalf("count epic tasks: %v", err)
	}
	if taskCount != 0 {
		t.Fatalf("epic planning update queued %d execution tasks", taskCount)
	}
}

func TestEpicProgressCountsOnlyDirectNonCancelledIssues(t *testing.T) {
	project := createHierarchyTestProject(t)
	epic := createHierarchyTestEpic(t, map[string]any{
		"title":      "Measured outcome",
		"project_id": project.ID,
	})
	done := createHierarchyTestIssue(t, map[string]any{
		"title": "Completed result", "epic_id": epic.ID, "status": "done",
	})
	createHierarchyTestIssue(t, map[string]any{
		"title": "Blocked result", "epic_id": epic.ID, "status": "blocked",
	})
	createHierarchyTestIssue(t, map[string]any{
		"title": "Cancelled result", "epic_id": epic.ID, "status": "cancelled",
	})
	createHierarchyTestIssue(t, map[string]any{
		"title": "Completed step", "parent_issue_id": done.ID, "status": "done",
	})

	w := httptest.NewRecorder()
	req := withURLParam(newRequest("GET", "/api/epics/"+epic.ID, nil), "id", epic.ID)
	testHandler.GetEpic(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("get epic metrics: got %d: %s", w.Code, w.Body.String())
	}
	var result EpicResponse
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("decode epic metrics: %v", err)
	}
	if result.TotalIssues != 2 || result.DoneIssues != 1 || result.BlockedIssues != 1 || result.CompletionPercent != 50 {
		t.Fatalf("epic metrics = total %d done %d blocked %d completion %d", result.TotalIssues, result.DoneIssues, result.BlockedIssues, result.CompletionPercent)
	}
}

func TestEpicDeleteKeepsAndDetachesWorkItems(t *testing.T) {
	project := createHierarchyTestProject(t)
	epic := createHierarchyTestEpic(t, map[string]any{
		"title":      "Retention program",
		"project_id": project.ID,
	})
	issue := createHierarchyTestIssue(t, map[string]any{
		"title":      "Interview retained customers",
		"project_id": project.ID,
		"epic_id":    epic.ID,
	})

	w := httptest.NewRecorder()
	req := withURLParam(newRequest("DELETE", "/api/epics/"+epic.ID, nil), "id", epic.ID)
	testHandler.DeleteEpic(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("delete epic: got %d: %s", w.Code, w.Body.String())
	}

	var projectID, epicID *string
	if err := testPool.QueryRow(context.Background(), `SELECT project_id::text, epic_id::text FROM issue WHERE id = $1`, issue.ID).Scan(&projectID, &epicID); err != nil {
		t.Fatalf("load detached issue: %v", err)
	}
	if projectID == nil || *projectID != project.ID || epicID != nil {
		t.Fatalf("work item after epic delete = project %v epic %v", projectID, epicID)
	}
}

func TestEpicMoveSynchronizesIssueAndSubtaskProject(t *testing.T) {
	source := createHierarchyTestProject(t)
	destination := createHierarchyTestProject(t)
	epic := createHierarchyTestEpic(t, map[string]any{
		"title":      "Moveable launch plan",
		"project_id": source.ID,
	})
	issue := createHierarchyTestIssue(t, map[string]any{
		"title":   "Launch workstream",
		"epic_id": epic.ID,
	})
	subtask := createHierarchyTestIssue(t, map[string]any{
		"title":           "Confirm launch checklist",
		"parent_issue_id": issue.ID,
	})

	w := httptest.NewRecorder()
	req := withURLParam(newRequest("PUT", "/api/epics/"+epic.ID, map[string]any{
		"project_id": destination.ID,
	}), "id", epic.ID)
	testHandler.UpdateEpic(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("move epic: got %d: %s", w.Code, w.Body.String())
	}

	for _, itemID := range []string{issue.ID, subtask.ID} {
		var projectID, epicID *string
		if err := testPool.QueryRow(context.Background(), `
			SELECT project_id::text, epic_id::text FROM issue WHERE id = $1
		`, itemID).Scan(&projectID, &epicID); err != nil {
			t.Fatalf("load moved work item %s: %v", itemID, err)
		}
		if projectID == nil || *projectID != destination.ID || epicID == nil || *epicID != epic.ID {
			t.Fatalf("moved work item %s = project %v epic %v", itemID, projectID, epicID)
		}
	}
}

func TestProjectDeleteRemovesEpicAndPreservesExecutableWork(t *testing.T) {
	project := createHierarchyTestProject(t)
	epic := createHierarchyTestEpic(t, map[string]any{
		"title":      "Project deletion plan",
		"project_id": project.ID,
	})
	issue := createHierarchyTestIssue(t, map[string]any{
		"title":   "Preserved deliverable",
		"epic_id": epic.ID,
	})
	subtask := createHierarchyTestIssue(t, map[string]any{
		"title":           "Preserved step",
		"parent_issue_id": issue.ID,
	})

	w := httptest.NewRecorder()
	req := withURLParam(newRequest("DELETE", "/api/projects/"+project.ID, nil), "id", project.ID)
	testHandler.DeleteProject(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("delete project: got %d: %s", w.Code, w.Body.String())
	}

	var epicCount int
	if err := testPool.QueryRow(context.Background(), `SELECT count(*) FROM issue WHERE id = $1`, epic.ID).Scan(&epicCount); err != nil {
		t.Fatalf("count deleted epic: %v", err)
	}
	if epicCount != 0 {
		t.Fatalf("deleted project left %d epic rows", epicCount)
	}
	for _, itemID := range []string{issue.ID, subtask.ID} {
		var projectID, epicID *string
		if err := testPool.QueryRow(context.Background(), `
			SELECT project_id::text, epic_id::text FROM issue WHERE id = $1
		`, itemID).Scan(&projectID, &epicID); err != nil {
			t.Fatalf("load preserved work item %s: %v", itemID, err)
		}
		if projectID != nil || epicID != nil {
			t.Fatalf("preserved work item %s = project %v epic %v, want nil/nil", itemID, projectID, epicID)
		}
	}
}

func TestEpicExplicitAdvisorQueuesCommentOnlyTask(t *testing.T) {
	project := createHierarchyTestProject(t)
	agentID := createHandlerTestAgent(t, fmt.Sprintf("epic-advisor-%d", time.Now().UnixNano()), nil)
	epic := createHierarchyTestEpic(t, map[string]any{
		"title":      "International launch",
		"project_id": project.ID,
	})

	w := httptest.NewRecorder()
	req := withURLParam(newRequest("POST", "/api/epics/"+epic.ID+"/advisor", map[string]any{
		"agent_id": agentID,
		"prompt":   "Identify launch dependencies and decision risks.",
	}), "id", epic.ID)
	testHandler.RunEpicAdvisorAction(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("run epic advisor: got %d: %s", w.Code, w.Body.String())
	}

	var taskID, contextType, targetType string
	if err := testPool.QueryRow(context.Background(), `
		SELECT id::text, context->>'type', context->>'target_type'
		FROM agent_task_queue
		WHERE issue_id = $1 AND agent_id = $2
		ORDER BY created_at DESC LIMIT 1
	`, epic.ID, agentID).Scan(&taskID, &contextType, &targetType); err != nil {
		t.Fatalf("load epic advisor task: %v", err)
	}
	if contextType != "epic_advisor" || targetType != "epic" {
		t.Fatalf("epic advisor context = %q / %q", contextType, targetType)
	}
	task, err := testHandler.Queries.GetAgentTask(context.Background(), parseUUID(taskID))
	if err != nil {
		t.Fatalf("get epic advisor task: %v", err)
	}
	if role := service.TaskCollaborationRole(task); role != service.TaskCollaborationRoleAdvisor {
		t.Fatalf("epic advisor task role = %q", role)
	}

	postAdvisorComment := func(content string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		req := withURLParam(newRequest("POST", "/api/epics/"+epic.ID+"/comments", map[string]any{
			"content": content,
		}), "id", epic.ID)
		req.Header.Set("X-Actor-Source", "task_token")
		req.Header.Set("X-Agent-ID", agentID)
		req.Header.Set("X-Task-ID", taskID)
		testHandler.CreateComment(w, req)
		return w
	}
	if response := postAdvisorComment("Flag the unresolved launch-owner decision."); response.Code != http.StatusCreated {
		t.Fatalf("epic advisor comment: got %d: %s", response.Code, response.Body.String())
	}
	if response := postAdvisorComment("A second recommendation should be rejected."); response.Code != http.StatusConflict {
		t.Fatalf("second epic advisor comment: got %d: %s", response.Code, response.Body.String())
	}

	w = httptest.NewRecorder()
	req = withURLParam(newRequest("PUT", "/api/epics/"+epic.ID, map[string]any{"health": "off_track"}), "id", epic.ID)
	req.Header.Set("X-Actor-Source", "task_token")
	req.Header.Set("X-Agent-ID", agentID)
	req.Header.Set("X-Task-ID", taskID)
	testHandler.UpdateEpic(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("epic advisor mutation: got %d: %s", w.Code, w.Body.String())
	}
}

func TestEpicCommentOnlyExplicitAgentMentionQueuesAdvisor(t *testing.T) {
	project := createHierarchyTestProject(t)
	agentID := createHandlerTestAgent(t, fmt.Sprintf("epic-mention-advisor-%d", time.Now().UnixNano()), nil)
	epic := createHierarchyTestEpic(t, map[string]any{
		"title":      "Pricing launch plan",
		"project_id": project.ID,
		"owner_type": "agent",
		"owner_id":   agentID,
	})

	postComment := func(content string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		req := withURLParam(newRequest("POST", "/api/epics/"+epic.ID+"/comments", map[string]any{"content": content}), "id", epic.ID)
		testHandler.CreateComment(w, req)
		return w
	}

	plain := postComment("Document the decision assumptions before review.")
	if plain.Code != http.StatusCreated {
		t.Fatalf("plain epic comment: got %d: %s", plain.Code, plain.Body.String())
	}
	var count int
	if err := testPool.QueryRow(context.Background(), `SELECT count(*) FROM agent_task_queue WHERE issue_id = $1`, epic.ID).Scan(&count); err != nil {
		t.Fatalf("count plain-comment tasks: %v", err)
	}
	if count != 0 {
		t.Fatalf("plain epic comment queued %d tasks", count)
	}

	mentioned := postComment(fmt.Sprintf("[@Planning advisor](mention://agent/%s) identify the primary pricing risk.", agentID))
	if mentioned.Code != http.StatusCreated {
		t.Fatalf("mentioned epic comment: got %d: %s", mentioned.Code, mentioned.Body.String())
	}
	var contextType string
	if err := testPool.QueryRow(context.Background(), `
		SELECT context->>'type' FROM agent_task_queue
		WHERE issue_id = $1 AND agent_id = $2
		ORDER BY created_at DESC LIMIT 1
	`, epic.ID, agentID).Scan(&contextType); err != nil {
		t.Fatalf("load mentioned advisor task: %v", err)
	}
	if contextType != "epic_advisor" {
		t.Fatalf("mentioned task type = %q", contextType)
	}
}

func TestLegacyIssueOperationsRejectEpicPlanningContainer(t *testing.T) {
	project := createHierarchyTestProject(t)
	epic := createHierarchyTestEpic(t, map[string]any{
		"title":      "Planning boundary",
		"project_id": project.ID,
	})

	tests := []struct {
		name   string
		method string
		path   string
		body   any
		run    func(http.ResponseWriter, *http.Request)
	}{
		{"comments", "POST", "/api/issues/" + epic.ID + "/comments", map[string]any{"content": "legacy path"}, testHandler.CreateComment},
		{"children", "GET", "/api/issues/" + epic.ID + "/children", nil, testHandler.ListChildIssues},
		{"metadata", "GET", "/api/issues/" + epic.ID + "/metadata", nil, testHandler.ListIssueMetadata},
		{"active task", "GET", "/api/issues/" + epic.ID + "/active-task", nil, testHandler.GetActiveTaskForIssue},
		{"task runs", "GET", "/api/issues/" + epic.ID + "/task-runs", nil, testHandler.ListTasksByIssue},
		{"usage", "GET", "/api/issues/" + epic.ID + "/usage", nil, testHandler.GetIssueUsage},
		{"rerun", "POST", "/api/issues/" + epic.ID + "/rerun", nil, testHandler.RerunIssue},
		{"pull requests", "GET", "/api/issues/" + epic.ID + "/pull-requests", nil, testHandler.ListPullRequestsForIssue},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req := withURLParam(newRequest(test.method, test.path, test.body), "id", epic.ID)
			test.run(w, req)
			if w.Code != http.StatusConflict {
				t.Fatalf("got %d: %s", w.Code, w.Body.String())
			}
			var response map[string]any
			if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if response["code"] != "epic_planning_container" {
				t.Fatalf("code = %v", response["code"])
			}
		})
	}
}

func TestIssueAgentActionSummarizeCreatesCommentOnlyAdvisorTask(t *testing.T) {
	agentID := createHandlerTestAgent(t, fmt.Sprintf("manual-advisor-%d", time.Now().UnixNano()), nil)
	issue := createHierarchyTestIssue(t, map[string]any{
		"title":         "Prepare launch decision",
		"status":        "backlog",
		"assignee_type": "agent",
		"assignee_id":   agentID,
	})
	w := httptest.NewRecorder()
	req := withURLParam(newRequest("POST", "/api/issues/"+issue.ID+"/agent-actions?workspace_id="+testWorkspaceID, map[string]any{
		"action": "summarize",
		"prompt": "Summarize the commercial risks.",
	}), "id", issue.ID)
	testHandler.RunIssueAgentAction(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("summarize action: got %d: %s", w.Code, w.Body.String())
	}

	var contextType, instruction string
	if err := testPool.QueryRow(context.Background(), `
		SELECT context->>'type', context->>'instruction'
		FROM agent_task_queue
		WHERE issue_id = $1 AND agent_id = $2
		ORDER BY created_at DESC LIMIT 1
	`, issue.ID, agentID).Scan(&contextType, &instruction); err != nil {
		t.Fatalf("load advisor task: %v", err)
	}
	if contextType != "manual_issue_advisor" || instruction != "Summarize the commercial risks." {
		t.Fatalf("advisor context = %q / %q", contextType, instruction)
	}
}
