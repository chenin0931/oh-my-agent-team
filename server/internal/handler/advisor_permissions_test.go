package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMemberAssigneeAdvisorCanOnlyCommentAndDoesNotTriggerMentionedAgent(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}

	ctx := context.Background()

	var advisorAgentID, runtimeID string
	if err := testPool.QueryRow(ctx, `
		SELECT a.id, a.runtime_id FROM agent a WHERE a.workspace_id = $1 LIMIT 1
	`, testWorkspaceID).Scan(&advisorAgentID, &runtimeID); err != nil {
		t.Fatalf("setup: get advisor agent: %v", err)
	}

	var mentionedAgentID string
	if err := testPool.QueryRow(ctx, `
		INSERT INTO agent (
			workspace_id, name, description, runtime_mode, runtime_config,
			runtime_id, visibility, max_concurrent_tasks, owner_id
		)
		VALUES ($1, 'Advisor Mention Target', '', 'cloud', '{}'::jsonb, $2, 'private', 1, $3)
		RETURNING id
	`, testWorkspaceID, runtimeID, testUserID).Scan(&mentionedAgentID); err != nil {
		t.Fatalf("setup: create mentioned agent: %v", err)
	}
	t.Cleanup(func() { testPool.Exec(ctx, `DELETE FROM agent WHERE id = $1`, mentionedAgentID) })

	var issueID string
	if err := testPool.QueryRow(ctx, `
		INSERT INTO issue (workspace_id, title, status, priority, creator_id, creator_type, number, position)
		VALUES (
			$1, 'advisor comment-only permission fixture', 'in_progress', 'none', $2, 'member',
			(SELECT COALESCE(MAX(number), 81400) + 1 FROM issue WHERE workspace_id = $1),
			0
		)
		RETURNING id
	`, testWorkspaceID, testUserID).Scan(&issueID); err != nil {
		t.Fatalf("setup: create issue: %v", err)
	}
	t.Cleanup(func() { testPool.Exec(ctx, `DELETE FROM issue WHERE id = $1`, issueID) })

	advisorContext := fmt.Sprintf(`{"type":"member_assignee_advisor","assignee_user_id":%q}`, testUserID)
	var taskID string
	if err := testPool.QueryRow(ctx, `
		INSERT INTO agent_task_queue (
			agent_id, runtime_id, issue_id, status, priority, started_at, context
		)
		VALUES ($1, $2, $3, 'running', 0, now(), $4::jsonb)
		RETURNING id
	`, advisorAgentID, runtimeID, issueID, advisorContext).Scan(&taskID); err != nil {
		t.Fatalf("setup: create advisor task: %v", err)
	}
	t.Cleanup(func() { testPool.Exec(ctx, `DELETE FROM agent_task_queue WHERE id = $1`, taskID) })

	w := httptest.NewRecorder()
	req := newRequest("PUT", "/api/issues/"+issueID, map[string]any{"status": "done"})
	req = withURLParam(req, "id", issueID)
	req.Header.Set("X-Actor-Source", "task_token")
	req.Header.Set("X-Agent-ID", advisorAgentID)
	req.Header.Set("X-Task-ID", taskID)
	testHandler.UpdateIssue(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("UpdateIssue from advisor: expected 403, got %d: %s", w.Code, w.Body.String())
	}

	nextCalls := 0
	boundary := testHandler.AdvisorWriteBoundary(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		nextCalls++
		w.WriteHeader(http.StatusNoContent)
	}))
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/issues/batch-update", map[string]any{"issue_ids": []string{issueID}})
	req.Header.Set("X-Actor-Source", "task_token")
	req.Header.Set("X-Agent-ID", advisorAgentID)
	req.Header.Set("X-Task-ID", taskID)
	boundary.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden || nextCalls != 0 {
		t.Fatalf("advisor write boundary: expected blocked 403, got %d with %d downstream calls", w.Code, nextCalls)
	}

	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/issues/"+issueID+"/comments", map[string]any{"content": "allowed"})
	req.Header.Set("X-Actor-Source", "task_token")
	req.Header.Set("X-Agent-ID", advisorAgentID)
	req.Header.Set("X-Task-ID", taskID)
	boundary.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent || nextCalls != 1 {
		t.Fatalf("advisor comment boundary: expected downstream 204, got %d with %d calls", w.Code, nextCalls)
	}

	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/issues/"+issueID+"/comments", map[string]any{
		"content": fmt.Sprintf("[@Advisor Mention Target](mention://agent/%s) this is advice only", mentionedAgentID),
	})
	req = withURLParam(req, "id", issueID)
	req.Header.Set("X-Actor-Source", "task_token")
	req.Header.Set("X-Agent-ID", advisorAgentID)
	req.Header.Set("X-Task-ID", taskID)
	testHandler.CreateComment(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("CreateComment from advisor: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var created CommentResponse
	if err := json.NewDecoder(w.Body).Decode(&created); err != nil {
		t.Fatalf("decode created comment: %v", err)
	}
	if created.AuthorType != "agent" || created.AuthorID != advisorAgentID {
		t.Fatalf("advisor comment author = %s/%s, want agent/%s", created.AuthorType, created.AuthorID, advisorAgentID)
	}

	var queuedForMentioned int
	if err := testPool.QueryRow(ctx, `
		SELECT count(*) FROM agent_task_queue
		WHERE issue_id = $1 AND agent_id = $2 AND status = 'queued'
	`, issueID, mentionedAgentID).Scan(&queuedForMentioned); err != nil {
		t.Fatalf("count mentioned agent tasks: %v", err)
	}
	if queuedForMentioned != 0 {
		t.Fatalf("advisor comment must not trigger mentioned agent, got %d queued tasks", queuedForMentioned)
	}

	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/issues/"+issueID+"/comments", map[string]any{
		"content": "a second advisor comment must be rejected",
	})
	req = withURLParam(req, "id", issueID)
	req.Header.Set("X-Actor-Source", "task_token")
	req.Header.Set("X-Agent-ID", advisorAgentID)
	req.Header.Set("X-Task-ID", taskID)
	testHandler.CreateComment(w, req)
	if w.Code != http.StatusConflict {
		t.Fatalf("second advisor comment: expected 409, got %d: %s", w.Code, w.Body.String())
	}
}
