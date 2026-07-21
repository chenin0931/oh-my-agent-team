package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/chenin0931/oh-my-agent-team/server/internal/util"
	db "github.com/chenin0931/oh-my-agent-team/server/pkg/db/generated"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type issueAgentActionRequest struct {
	Action  string `json:"action"`
	AgentID string `json:"agent_id,omitempty"`
	Prompt  string `json:"prompt,omitempty"`
}

// RunIssueAgentAction is the single human-facing entry point for explicit
// collaboration actions. Continue/decompose use the issue executor path;
// summarize always creates a comment-only advisor task.
func (h *Handler) RunIssueAgentAction(w http.ResponseWriter, r *http.Request) {
	issue, ok := h.loadExecutableIssueForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	workspaceID := uuidToString(issue.WorkspaceID)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	actorType, _ := h.resolveActor(r, userID, workspaceID)
	if actorType != "member" {
		writeError(w, http.StatusForbidden, "agent actions must be started by a human member")
		return
	}

	var req issueAgentActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Action = strings.ToLower(strings.TrimSpace(req.Action))
	if req.Action != "continue" && req.Action != "summarize" && req.Action != "decompose" {
		writeError(w, http.StatusBadRequest, "action must be continue, summarize, or decompose")
		return
	}
	if req.Action == "decompose" {
		member, ok := h.workspaceMember(w, r, workspaceID)
		if !ok {
			return
		}
		if !roleAllowed(member.Role, "owner", "admin") {
			writeError(w, http.StatusForbidden, "only workspace owners and admins can decompose issues")
			return
		}
	}

	originatorID, err := util.ParseUUID(userID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "user not authenticated")
		return
	}

	if req.Action == "summarize" {
		agentID, ok := h.resolveIssueAdvisorAgent(w, r, issue, req.AgentID, userID)
		if !ok {
			return
		}
		instruction := strings.TrimSpace(req.Prompt)
		if instruction == "" {
			instruction = "Summarize the current issue context, progress, risks, and the next decision or action for the human owner."
		}
		task, err := h.TaskService.EnqueueIssueAdvisor(r.Context(), issue, agentID, originatorID, instruction)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]any{
			"action": "summarize",
			"queued": true,
			"task":   taskToResponse(task, workspaceID),
		})
		return
	}

	if !issue.AssigneeType.Valid || !issue.AssigneeID.Valid || (issue.AssigneeType.String != "agent" && issue.AssigneeType.String != "squad") {
		writeError(w, http.StatusBadRequest, "continue and decompose require an agent or squad executor")
		return
	}
	if req.Action == "continue" && !issueAgentActionStatusActive(issue.Status) {
		writeError(w, http.StatusBadRequest, "continue requires an active issue status")
		return
	}

	note := strings.TrimSpace(req.Prompt)
	if note == "" {
		if req.Action == "decompose" {
			note = "Decompose this issue into independently actionable, one-level Subtasks. Create each Subtask in backlog and do not change this issue's status."
		} else {
			note = "Continue working on this issue from the latest activity and leave a clear progress update."
		}
	}

	if issue.AssigneeType.String == "squad" {
		queued := h.enqueueSquadLeaderTask(r.Context(), issue, pgtype.UUID{}, "member", userID, note)
		if !queued {
			writeError(w, http.StatusConflict, "the squad already has an active run or cannot be invoked")
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]any{"action": req.Action, "queued": true})
		return
	}

	agent, err := h.Queries.GetAgentInWorkspace(r.Context(), db.GetAgentInWorkspaceParams{ID: issue.AssigneeID, WorkspaceID: issue.WorkspaceID})
	if err != nil || !h.canInvokeAgent(r.Context(), agent, "member", userID, userID, workspaceID) {
		writeError(w, http.StatusForbidden, "the assigned agent cannot be invoked")
		return
	}
	hasPending, err := h.Queries.HasPendingTaskForIssueAndAgent(r.Context(), db.HasPendingTaskForIssueAndAgentParams{
		IssueID: issue.ID,
		AgentID: issue.AssigneeID,
		HeadSha: h.TaskService.ResolveIssueReviewSHAParam(r.Context(), issue.ID),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check active agent runs")
		return
	}
	if hasPending {
		writeError(w, http.StatusConflict, "the assigned agent already has an active run")
		return
	}
	originator, _ := util.ParseUUID(userID)
	task, err := h.TaskService.EnqueueTaskForIssueWithHandoffAs(r.Context(), issue, note, originator)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{
		"action": req.Action,
		"queued": true,
		"task":   taskToResponse(task, workspaceID),
	})
}

func (h *Handler) resolveIssueAdvisorAgent(w http.ResponseWriter, r *http.Request, issue db.Issue, requestedAgentID, userID string) (pgtype.UUID, bool) {
	var agentID pgtype.UUID
	var err error
	if requestedAgentID != "" {
		agentID, err = util.ParseUUID(requestedAgentID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid agent_id")
			return pgtype.UUID{}, false
		}
	} else {
		switch {
		case issue.AssigneeType.Valid && issue.AssigneeType.String == "agent" && issue.AssigneeID.Valid:
			agentID = issue.AssigneeID
		case issue.AssigneeType.Valid && issue.AssigneeType.String == "squad" && issue.AssigneeID.Valid:
			squad, squadErr := h.Queries.GetSquadInWorkspace(r.Context(), db.GetSquadInWorkspaceParams{ID: issue.AssigneeID, WorkspaceID: issue.WorkspaceID})
			if squadErr == nil {
				agentID = squad.LeaderID
			}
		case issue.AssigneeType.Valid && issue.AssigneeType.String == "member" && issue.AssigneeID.Valid:
			agents, listErr := h.Queries.ListReadyAgentsOwnedByUserInWorkspace(r.Context(), db.ListReadyAgentsOwnedByUserInWorkspaceParams{WorkspaceID: issue.WorkspaceID, OwnerID: issue.AssigneeID})
			if listErr == nil && len(agents) > 0 {
				agentID = agents[0].ID
			}
		}
	}
	if !agentID.Valid {
		writeError(w, http.StatusBadRequest, "select an advisor agent")
		return pgtype.UUID{}, false
	}
	agent, err := h.Queries.GetAgentInWorkspace(r.Context(), db.GetAgentInWorkspaceParams{ID: agentID, WorkspaceID: issue.WorkspaceID})
	if err != nil || !h.canInvokeAgent(r.Context(), agent, "member", userID, userID, uuidToString(issue.WorkspaceID)) {
		writeError(w, http.StatusForbidden, "the advisor agent cannot be invoked")
		return pgtype.UUID{}, false
	}
	return agentID, true
}

func issueAgentActionStatusActive(status string) bool {
	switch status {
	case "todo", "in_progress", "in_review", "blocked":
		return true
	default:
		return false
	}
}
