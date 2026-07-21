package handler

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/chenin0931/oh-my-agent-team/server/internal/featureflags"
	"github.com/chenin0931/oh-my-agent-team/server/internal/service"
	"github.com/chenin0931/oh-my-agent-team/server/internal/util"
	"github.com/chenin0931/oh-my-agent-team/server/pkg/agent"
	db "github.com/chenin0931/oh-my-agent-team/server/pkg/db/generated"
)

const managedApprovalBodyLimit = 2 << 20

// RequireManagedActionApproval applies only to authenticated task-token
// traffic. Human requests and legacy turns pass through unchanged.
func (h *Handler) RequireManagedActionApproval(action, title string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("X-Actor-Source") != "task_token" ||
				!featureflags.AgentActionApprovalsEnabled(r.Context(), h.FeatureFlags) ||
				h.SessionService == nil {
				next.ServeHTTP(w, r)
				return
			}
			taskID, err := util.ParseUUID(r.Header.Get("X-Task-ID"))
			if err != nil {
				writeError(w, http.StatusForbidden, "managed action requires a valid task context")
				return
			}
			task, err := h.Queries.GetAgentTask(r.Context(), taskID)
			if err != nil || !task.AgentSessionID.Valid || !task.SessionThreadID.Valid {
				// Session V2 is additive. Legacy task tokens retain their existing
				// behavior until their daemon is upgraded and a managed turn begins.
				next.ServeHTTP(w, r)
				return
			}
			if runtime, runtimeErr := h.Queries.GetAgentRuntime(r.Context(), task.RuntimeID); runtimeErr != nil || agent.CheckManagedSessionCLIVersion(readRuntimeCLIVersion(runtime.Metadata)) != nil {
				next.ServeHTTP(w, r)
				return
			}
			session, err := h.Queries.GetAgentSession(r.Context(), task.AgentSessionID)
			if err != nil {
				writeError(w, http.StatusConflict, "managed session no longer exists")
				return
			}
			thread, err := h.Queries.GetAgentSessionThread(r.Context(), task.SessionThreadID)
			if err != nil || thread.AgentSessionID != session.ID || thread.AgentID != task.AgentID {
				writeError(w, http.StatusForbidden, "managed thread does not match this task")
				return
			}

			body, err := io.ReadAll(io.LimitReader(r.Body, managedApprovalBodyLimit+1))
			if err != nil || len(body) > managedApprovalBodyLimit {
				writeError(w, http.StatusRequestEntityTooLarge, "request body is too large")
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(body))
			resolvedAction := h.resolveManagedAction(r, task, action, body)
			if resolvedAction == "issue.cross_target" {
				writeJSON(w, http.StatusForbidden, map[string]any{"code": "managed_action_denied", "error": "an agent session may only mutate its own work item"})
				return
			}
			var policy map[string]service.PermissionDecision
			if json.Unmarshal(thread.PermissionPolicy, &policy) != nil {
				policy = service.DefaultSessionPermissionPolicy(session.Mode)
			}
			decision := service.PermissionDecisionForAction(policy, resolvedAction)
			switch decision {
			case service.PermissionAllow:
				next.ServeHTTP(w, r)
				return
			case service.PermissionDeny:
				writeJSON(w, http.StatusForbidden, map[string]any{
					"code":             "managed_action_denied",
					"error":            "this session role is not permitted to perform the requested action",
					"action_namespace": resolvedAction,
					"session_id":       uuidToString(session.ID),
				})
				return
			}

			details := managedApprovalDetails(r, task, body)
			fingerprint := service.ManagedOperationFingerprint(resolvedAction, details)
			if approvalHeader := strings.TrimSpace(r.Header.Get("X-Approval-ID")); approvalHeader != "" {
				approvalID, parseErr := util.ParseUUID(approvalHeader)
				if parseErr != nil {
					writeError(w, http.StatusBadRequest, "invalid X-Approval-ID")
					return
				}
				approval, consumeErr := h.Queries.ConsumeSessionApproval(r.Context(), db.ConsumeSessionApprovalParams{
					ID:                   approvalID,
					AgentSessionID:       session.ID,
					OperationFingerprint: fingerprint,
				})
				if consumeErr != nil {
					if errors.Is(consumeErr, pgx.ErrNoRows) {
						writeJSON(w, http.StatusConflict, map[string]any{"code": "approval_invalid", "error": "approval is expired, already used, or does not match this operation"})
						return
					}
					writeError(w, http.StatusInternalServerError, "failed to consume approval")
					return
				}
				_, _ = h.SessionService.AppendEvent(r.Context(), service.ManagedEventInput{
					SessionID:  session.ID,
					ThreadID:   thread.ID,
					ActorType:  "agent",
					ActorID:    task.AgentID,
					EventType:  "approval.consumed",
					Payload:    map[string]any{"approval_id": uuidToString(approval.ID), "action_namespace": resolvedAction},
					Visibility: "workspace",
				})
				_, _ = h.Queries.UpdateAgentSessionThreadStatus(r.Context(), db.UpdateAgentSessionThreadStatusParams{
					Status: service.SessionStatusRunning,
					ID:     thread.ID,
				})
				_, _ = h.SessionService.Transition(r.Context(), session.ID, service.SessionStatusRunning, "approval consumed", thread.ID, task.ID)
				r.Body = io.NopCloser(bytes.NewReader(body))
				next.ServeHTTP(w, r)
				return
			}

			approval, err := h.SessionService.RequestApproval(r.Context(), session, thread, resolvedAction, title, managedActionRisk(resolvedAction), details)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to request approval")
				return
			}
			writeJSON(w, http.StatusPreconditionRequired, map[string]any{
				"code":                  "approval_required",
				"error":                 "approval_required",
				"approval_id":           uuidToString(approval.ID),
				"agent_session_id":      uuidToString(session.ID),
				"session_thread_id":     uuidToString(thread.ID),
				"action_namespace":      resolvedAction,
				"operation_fingerprint": approval.OperationFingerprint,
				"title":                 approval.Title,
				"risk_level":            approval.RiskLevel,
				"expires_at":            timestampToString(approval.ExpiresAt),
			})
		})
	}
}

func (h *Handler) resolveManagedAction(r *http.Request, task db.AgentTaskQueue, action string, body []byte) string {
	if strings.HasPrefix(r.URL.Path, "/api/issues/") && chi.URLParam(r, "id") != "" {
		workspaceID := h.resolveWorkspaceID(r)
		issue, ok := h.resolveIssueByIdentifier(r.Context(), chi.URLParam(r, "id"), workspaceID)
		if !ok {
			if parsed, err := util.ParseUUID(chi.URLParam(r, "id")); err == nil {
				issue, _ = h.Queries.GetIssue(r.Context(), parsed)
			}
		}
		if issue.ID.Valid && task.IssueID.Valid && issue.ID != task.IssueID {
			return "issue.cross_target"
		}
	}
	if action != "issue.update" {
		return action
	}
	var fields map[string]json.RawMessage
	_ = json.Unmarshal(body, &fields)
	if _, exists := fields["assignee_id"]; exists {
		return "issue.assignee"
	}
	if _, exists := fields["assignee_type"]; exists {
		return "issue.assignee"
	}
	if _, exists := fields["status"]; exists {
		var status string
		_ = json.Unmarshal(fields["status"], &status)
		if status == "done" || status == "cancelled" {
			return "issue.status.finalize"
		}
		if status == "in_review" {
			// Managed Execution advances to review only after the Session's
			// outcome gate has passed (or its no-rubric turn has completed).
			// Agents may report progress, but cannot bypass that gate.
			return "issue.status.review"
		}
		return "issue.status.own"
	}
	return "workspace.write"
}

func managedApprovalDetails(r *http.Request, task db.AgentTaskQueue, body []byte) map[string]any {
	sum := sha256.Sum256(body)
	return map[string]any{
		"method":         r.Method,
		"path":           r.URL.Path,
		"query":          r.URL.RawQuery,
		"body_sha256":    hex.EncodeToString(sum[:]),
		"source_task_id": uuidToString(task.ID),
		"issue_id":       uuidToString(task.IssueID),
	}
}

func managedActionRisk(action string) string {
	switch action {
	case "delete", "billing", "publish", "invite":
		return "critical"
	case "issue.assignee", "issue.create", "external.write":
		return "high"
	default:
		return "medium"
	}
}
