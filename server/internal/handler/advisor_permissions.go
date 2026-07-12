package handler

import (
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/chenin0931/oh-my-agent-team/server/internal/service"
	"github.com/chenin0931/oh-my-agent-team/server/internal/util"
	db "github.com/chenin0931/oh-my-agent-team/server/pkg/db/generated"
)

// AdvisorWriteBoundary is the defense-in-depth boundary for every authenticated
// API route. Advisor task tokens may read freely and may create one ordinary
// comment on their assigned target; every other write is rejected before it can
// reach an endpoint that was not designed with advisor tasks in mind.
func (h *Handler) AdvisorWriteBoundary(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		if r.Header.Get("X-Actor-Source") != "task_token" {
			next.ServeHTTP(w, r)
			return
		}
		task, advisorContext, ok := h.memberAssigneeAdvisorTaskFromRequest(r)
		if !ok {
			next.ServeHTTP(w, r)
			return
		}

		targetID := uuidToString(task.IssueID)
		collection := "issues"
		if advisorContext.TargetType == "epic" || advisorContext.Type == service.EpicAdvisorContextType {
			collection = "epics"
		}
		allowedPath := "/api/" + collection + "/" + targetID + "/comments"
		if r.Method == http.MethodPost && strings.TrimSuffix(r.URL.Path, "/") == allowedPath {
			next.ServeHTTP(w, r)
			return
		}

		writeError(w, http.StatusForbidden, "advisor tasks can only read their assigned target and add one comment")
	})
}

func (h *Handler) memberAssigneeAdvisorTaskFromRequest(r *http.Request) (db.AgentTaskQueue, service.MemberAssigneeAdvisorContext, bool) {
	if r.Header.Get("X-Actor-Source") != "task_token" {
		return db.AgentTaskQueue{}, service.MemberAssigneeAdvisorContext{}, false
	}
	taskID := r.Header.Get("X-Task-ID")
	if taskID == "" {
		return db.AgentTaskQueue{}, service.MemberAssigneeAdvisorContext{}, false
	}
	taskUUID, err := util.ParseUUID(taskID)
	if err != nil {
		return db.AgentTaskQueue{}, service.MemberAssigneeAdvisorContext{}, false
	}
	task, err := h.Queries.GetAgentTask(r.Context(), taskUUID)
	if err != nil {
		return db.AgentTaskQueue{}, service.MemberAssigneeAdvisorContext{}, false
	}
	ctx, ok := service.ParseMemberAssigneeAdvisorContext(task)
	return task, ctx, ok
}

func (h *Handler) rejectMemberAssigneeAdvisorMutation(w http.ResponseWriter, r *http.Request, issueID pgtype.UUID, allowComment bool) bool {
	task, _, ok := h.memberAssigneeAdvisorTaskFromRequest(r)
	if !ok {
		return false
	}
	if issueID.Valid && (!task.IssueID.Valid || task.IssueID != issueID) {
		writeError(w, http.StatusForbidden, "advisor tasks can only comment on their assigned issue")
		return true
	}
	if allowComment {
		return false
	}
	writeError(w, http.StatusForbidden, "advisor tasks can only read the issue and add comments")
	return true
}
