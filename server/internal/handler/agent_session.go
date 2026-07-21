package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/chenin0931/oh-my-agent-team/server/internal/featureflags"
	"github.com/chenin0931/oh-my-agent-team/server/internal/service"
	"github.com/chenin0931/oh-my-agent-team/server/internal/util"
	db "github.com/chenin0931/oh-my-agent-team/server/pkg/db/generated"
)

type agentSessionResponse struct {
	ID             string                       `json:"id"`
	WorkspaceID    string                       `json:"workspace_id"`
	IssueID        string                       `json:"issue_id,omitempty"`
	IssueTitle     string                       `json:"issue_title,omitempty"`
	Goal           string                       `json:"goal"`
	Mode           string                       `json:"mode"`
	Status         string                       `json:"status"`
	EntryAgentID   string                       `json:"entry_agent_id,omitempty"`
	EntrySquadID   string                       `json:"entry_squad_id,omitempty"`
	StopReason     *string                      `json:"stop_reason,omitempty"`
	IterationCount int32                        `json:"iteration_count"`
	MaxIterations  int32                        `json:"max_iterations"`
	StartedAt      *string                      `json:"started_at,omitempty"`
	CompletedAt    *string                      `json:"completed_at,omitempty"`
	CreatedAt      string                       `json:"created_at"`
	UpdatedAt      string                       `json:"updated_at"`
	Threads        []agentSessionThreadResponse `json:"threads,omitempty"`
	Approvals      []sessionApprovalResponse    `json:"approvals,omitempty"`
	Outcome        *sessionOutcomeResponse      `json:"outcome,omitempty"`
	Tasks          []agentSessionTaskResponse   `json:"tasks,omitempty"`
}

type agentVersionSummaryResponse struct {
	ID            string  `json:"id"`
	VersionNumber int32   `json:"version_number"`
	ConfigHash    string  `json:"config_hash"`
	Model         *string `json:"model,omitempty"`
	ThinkingLevel *string `json:"thinking_level,omitempty"`
	SkillCount    int     `json:"skill_count"`
	CreatedAt     string  `json:"created_at"`
}

type agentSessionThreadResponse struct {
	ID                 string          `json:"id"`
	AgentID            string          `json:"agent_id"`
	AgentName          string          `json:"agent_name"`
	AgentVersionID     string          `json:"agent_version_id"`
	AgentVersionNumber int32           `json:"agent_version_number"`
	RuntimeID          string          `json:"runtime_id,omitempty"`
	RuntimeName        string          `json:"runtime_name,omitempty"`
	RuntimeProvider    string          `json:"runtime_provider,omitempty"`
	RuntimeStatus      string          `json:"runtime_status,omitempty"`
	ParentThreadID     string          `json:"parent_thread_id,omitempty"`
	Role               string          `json:"role"`
	Status             string          `json:"status"`
	HasProviderSession bool            `json:"has_provider_session"`
	PermissionPolicy   json.RawMessage `json:"permission_policy"`
	StopReason         *string         `json:"stop_reason,omitempty"`
	StartedAt          *string         `json:"started_at,omitempty"`
	CompletedAt        *string         `json:"completed_at,omitempty"`
	LastTurnAt         *string         `json:"last_turn_at,omitempty"`
	CreatedAt          string          `json:"created_at"`
}

type agentSessionEventResponse struct {
	ID             string          `json:"id"`
	Seq            int64           `json:"seq"`
	AgentSessionID string          `json:"agent_session_id"`
	ThreadID       string          `json:"thread_id,omitempty"`
	ActorType      string          `json:"actor_type"`
	ActorID        string          `json:"actor_id,omitempty"`
	EventType      string          `json:"event_type"`
	Payload        json.RawMessage `json:"payload"`
	SourceTaskID   string          `json:"source_task_id,omitempty"`
	CreatedAt      string          `json:"created_at"`
}

type sessionApprovalResponse struct {
	ID                   string          `json:"id"`
	ThreadID             string          `json:"thread_id,omitempty"`
	ActionNamespace      string          `json:"action_namespace"`
	OperationFingerprint string          `json:"operation_fingerprint"`
	Title                string          `json:"title"`
	Details              json.RawMessage `json:"details"`
	RiskLevel            string          `json:"risk_level"`
	Status               string          `json:"status"`
	DecisionReason       *string         `json:"decision_reason,omitempty"`
	ExpiresAt            string          `json:"expires_at"`
	ResolvedAt           *string         `json:"resolved_at,omitempty"`
	CreatedAt            string          `json:"created_at"`
}

type sessionOutcomeResponse struct {
	ID               string                      `json:"id"`
	RubricMarkdown   string                      `json:"rubric_markdown"`
	Status           string                      `json:"status"`
	MaxIterations    int32                       `json:"max_iterations"`
	CurrentIteration int32                       `json:"current_iteration"`
	CompletedAt      *string                     `json:"completed_at,omitempty"`
	Evaluations      []outcomeEvaluationResponse `json:"evaluations"`
}

type outcomeEvaluationResponse struct {
	ID        string          `json:"id"`
	Attempt   int32           `json:"attempt"`
	Verdict   string          `json:"verdict"`
	Summary   string          `json:"summary"`
	Evidence  json.RawMessage `json:"evidence"`
	CreatedAt string          `json:"created_at"`
}

type agentSessionTaskResponse struct {
	ID          string  `json:"id"`
	ThreadID    string  `json:"thread_id,omitempty"`
	Status      string  `json:"status"`
	Attempt     int32   `json:"attempt"`
	MaxAttempts int32   `json:"max_attempts"`
	Error       *string `json:"error,omitempty"`
	CreatedAt   string  `json:"created_at"`
	StartedAt   *string `json:"started_at,omitempty"`
	CompletedAt *string `json:"completed_at,omitempty"`
}

func (h *Handler) ListIssueAgentSessions(w http.ResponseWriter, r *http.Request) {
	if !featureflags.AgentSessionsV2Enabled(r.Context(), h.FeatureFlags) {
		writeJSON(w, http.StatusOK, []agentSessionResponse{})
		return
	}
	issue, ok := h.loadExecutableIssueForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	sessions, err := h.Queries.ListAgentSessionsByIssue(r.Context(), issue.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list agent sessions")
		return
	}
	response := make([]agentSessionResponse, 0, len(sessions))
	for _, session := range sessions {
		response = append(response, h.agentSessionToResponse(r, session, false))
	}
	writeJSON(w, http.StatusOK, response)
}

type createIssueAgentSessionRequest struct {
	Message string `json:"message,omitempty"`
}

func (h *Handler) CreateIssueAgentSession(w http.ResponseWriter, r *http.Request) {
	if !featureflags.AgentSessionsV2Enabled(r.Context(), h.FeatureFlags) || h.SessionService == nil {
		writeError(w, http.StatusNotFound, "managed sessions are not enabled")
		return
	}
	issue, ok := h.loadExecutableIssueForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	userID, ok := parseUUIDOrBadRequest(w, requestUserID(r), "user id")
	if !ok {
		return
	}
	var req createIssueAgentSessionRequest
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}
	task, err := h.TaskService.EnqueueNewManagedSessionForIssue(r.Context(), issue, userID, strings.TrimSpace(req.Message))
	if errors.Is(err, service.ErrManagedSessionWaitingEnvironment) {
		writeJSON(w, http.StatusAccepted, map[string]any{"status": service.SessionStatusWaitingEnvironment})
		return
	}
	if err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"status": service.SessionStatusQueued, "task_id": uuidToString(task.ID), "agent_session_id": uuidToString(task.AgentSessionID)})
}

func (h *Handler) ListAgentSessions(w http.ResponseWriter, r *http.Request) {
	if !featureflags.AgentSessionsV2Enabled(r.Context(), h.FeatureFlags) {
		writeJSON(w, http.StatusOK, []agentSessionResponse{})
		return
	}
	agent, ok := h.loadAgentForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	limit := int32(50)
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			writeError(w, http.StatusBadRequest, "limit must be between 1 and 100")
			return
		}
		limit = int32(parsed)
	}
	sessions, err := h.Queries.ListAgentSessionsByAgent(r.Context(), db.ListAgentSessionsByAgentParams{
		AgentID:      agent.ID,
		ResultLimit:  limit,
		ResultOffset: 0,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list agent sessions")
		return
	}
	response := make([]agentSessionResponse, 0, len(sessions))
	for _, session := range sessions {
		response = append(response, h.agentSessionToResponse(r, session, false))
	}
	writeJSON(w, http.StatusOK, response)
}

func (h *Handler) ListSquadAgentSessions(w http.ResponseWriter, r *http.Request) {
	if !featureflags.AgentSessionsV2Enabled(r.Context(), h.FeatureFlags) {
		writeJSON(w, http.StatusOK, []agentSessionResponse{})
		return
	}
	squad, _, ok := h.loadSquadInWorkspace(w, r)
	if !ok {
		return
	}
	sessions, err := h.Queries.ListAgentSessionsBySquad(r.Context(), db.ListAgentSessionsBySquadParams{
		SquadID:     squad.ID,
		ResultLimit: 50,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list squad sessions")
		return
	}
	response := make([]agentSessionResponse, 0, len(sessions))
	for _, session := range sessions {
		response = append(response, h.agentSessionToResponse(r, session, false))
	}
	writeJSON(w, http.StatusOK, response)
}

func (h *Handler) ListAgentVersions(w http.ResponseWriter, r *http.Request) {
	if !featureflags.AgentSessionsV2Enabled(r.Context(), h.FeatureFlags) {
		writeJSON(w, http.StatusOK, []agentVersionSummaryResponse{})
		return
	}
	agent, ok := h.loadAgentForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	versions, err := h.Queries.ListAgentVersions(r.Context(), agent.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list agent versions")
		return
	}
	response := make([]agentVersionSummaryResponse, 0, len(versions))
	for _, version := range versions {
		var skillIDs []string
		_ = json.Unmarshal(version.SkillIds, &skillIDs)
		response = append(response, agentVersionSummaryResponse{
			ID:            uuidToString(version.ID),
			VersionNumber: version.VersionNumber,
			ConfigHash:    version.ConfigHash,
			Model:         textToPtr(version.Model),
			ThinkingLevel: textToPtr(version.ThinkingLevel),
			SkillCount:    len(skillIDs),
			CreatedAt:     timestampToString(version.CreatedAt),
		})
	}
	writeJSON(w, http.StatusOK, response)
}

func (h *Handler) GetAgentSession(w http.ResponseWriter, r *http.Request) {
	session, ok := h.loadAgentSessionForUser(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, h.agentSessionToResponse(r, session, true))
}

func (h *Handler) ListAgentSessionEvents(w http.ResponseWriter, r *http.Request) {
	session, ok := h.loadAgentSessionForUser(w, r)
	if !ok {
		return
	}
	userID, err := util.ParseUUID(requestUserID(r))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	member, err := h.getWorkspaceMember(r.Context(), requestUserID(r), uuidToString(session.WorkspaceID))
	if err != nil {
		writeError(w, http.StatusForbidden, "session is not accessible")
		return
	}
	afterSeq := int64(0)
	if raw := strings.TrimSpace(r.URL.Query().Get("after_seq")); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed < 0 {
			writeError(w, http.StatusBadRequest, "invalid after_seq")
			return
		}
		afterSeq = parsed
	}
	limit := int32(200)
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 500 {
			writeError(w, http.StatusBadRequest, "limit must be between 1 and 500")
			return
		}
		limit = int32(parsed)
	}
	events, err := h.Queries.ListAgentSessionEventsAfter(r.Context(), db.ListAgentSessionEventsAfterParams{
		AgentSessionID: session.ID,
		AfterSeq:       afterSeq,
		ResultLimit:    limit,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list session events")
		return
	}
	response := make([]agentSessionEventResponse, 0, len(events))
	for _, event := range events {
		if !canViewManagedSessionEvent(event.Visibility, session, userID, member.Role) {
			continue
		}
		response = append(response, agentSessionEventToResponse(event))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"events": response,
		"next_seq": func() int64 {
			if len(events) == 0 {
				return afterSeq
			}
			return events[len(events)-1].Seq
		}(),
	})
}

func canViewManagedSessionEvent(visibility string, session db.AgentSession, userID pgtype.UUID, workspaceRole string) bool {
	switch visibility {
	case "workspace", "":
		return true
	case "owner", "participants":
		return (session.CreatedBy.Valid && session.CreatedBy == userID) || roleAllowed(workspaceRole, "owner", "admin")
	default:
		return false
	}
}

type postAgentSessionEventRequest struct {
	Type       string `json:"type"`
	Message    string `json:"message,omitempty"`
	Reason     string `json:"reason,omitempty"`
	Rubric     string `json:"rubric,omitempty"`
	ApprovalID string `json:"approval_id,omitempty"`
	Decision   string `json:"decision,omitempty"`
}

func (h *Handler) PostAgentSessionEvent(w http.ResponseWriter, r *http.Request) {
	session, ok := h.loadAgentSessionForUser(w, r)
	if !ok {
		return
	}
	userID, ok := parseUUIDOrBadRequest(w, requestUserID(r), "user id")
	if !ok {
		return
	}
	var req postAgentSessionEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Type = strings.TrimSpace(req.Type)
	switch req.Type {
	case "user.message":
		h.postAgentSessionMessage(w, r, session, userID, strings.TrimSpace(req.Message))
	case "user.interrupt":
		cancelled, err := h.SessionService.Interrupt(r.Context(), session, userID, strings.TrimSpace(req.Reason))
		if err != nil {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]any{"status": service.SessionStatusWaitingInput, "cancelled_turns": len(cancelled)})
	case "user.define_outcome":
		outcome, err := h.SessionService.DefineOutcome(r.Context(), session, userID, req.Rubric)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, sessionOutcomeResponseFromDB(outcome, nil))
	case "user.approval_decision":
		member, memberOK := h.workspaceMember(w, r, uuidToString(session.WorkspaceID))
		if !memberOK {
			return
		}
		if !canDecideManagedSessionApproval(session, userID, member.Role) {
			writeError(w, http.StatusForbidden, "only the session owner or a workspace admin can decide this approval")
			return
		}
		approvalID, valid := parseUUIDOrBadRequest(w, req.ApprovalID, "approval_id")
		if !valid {
			return
		}
		if _, err := h.Queries.GetSessionApprovalInSession(r.Context(), db.GetSessionApprovalInSessionParams{ID: approvalID, AgentSessionID: session.ID}); err != nil {
			writeError(w, http.StatusNotFound, "approval not found")
			return
		}
		approve := req.Decision == "approve"
		if !approve && req.Decision != "reject" {
			writeError(w, http.StatusBadRequest, "decision must be approve or reject")
			return
		}
		approval, err := h.SessionService.DecideApproval(r.Context(), session, approvalID, userID, approve, req.Reason)
		if err != nil {
			writeError(w, http.StatusConflict, "approval is no longer pending")
			return
		}
		writeJSON(w, http.StatusOK, sessionApprovalResponseFromDB(approval))
	default:
		writeError(w, http.StatusBadRequest, "unsupported session event type")
	}
}

func canDecideManagedSessionApproval(session db.AgentSession, userID pgtype.UUID, workspaceRole string) bool {
	return (session.CreatedBy.Valid && session.CreatedBy == userID) || roleAllowed(workspaceRole, "owner", "admin")
}

func (h *Handler) postAgentSessionMessage(w http.ResponseWriter, r *http.Request, session db.AgentSession, userID pgtype.UUID, message string) {
	if message == "" {
		writeError(w, http.StatusBadRequest, "message is required")
		return
	}
	if session.Status == service.SessionStatusCompleted || session.Status == service.SessionStatusFailed || session.Status == service.SessionStatusCancelled {
		writeError(w, http.StatusConflict, "session is closed; start a new session to continue")
		return
	}
	thread, err := h.Queries.GetPrimaryAgentSessionThread(r.Context(), session.ID)
	if err != nil {
		writeError(w, http.StatusConflict, "session has no active agent thread")
		return
	}
	if tasks, listErr := h.Queries.ListTasksByAgentSession(r.Context(), session.ID); listErr == nil && hasActiveManagedTurn(tasks) {
		_, _ = h.SessionService.Interrupt(r.Context(), session, userID, "redirected by user")
	}
	_, err = h.SessionService.AppendEvent(r.Context(), service.ManagedEventInput{
		SessionID:  session.ID,
		ThreadID:   thread.ID,
		ActorType:  "member",
		ActorID:    userID,
		EventType:  "user.message",
		Payload:    map[string]any{"message": message},
		Visibility: "workspace",
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to append session message")
		return
	}
	issue, err := h.Queries.GetIssue(r.Context(), session.IssueID)
	if err != nil {
		writeError(w, http.StatusConflict, "session work item no longer exists")
		return
	}
	var task db.AgentTaskQueue
	switch session.Mode {
	case service.SessionModeAdvisor:
		task, err = h.TaskService.EnqueueIssueAdvisor(r.Context(), issue, thread.AgentID, userID, message)
	case service.SessionModeCoordinator:
		task, err = h.TaskService.EnqueueTaskForSquadLeaderWithHandoffAs(r.Context(), issue, thread.AgentID, session.EntrySquadID, message, userID)
	default:
		if !issue.AssigneeID.Valid || issue.AssigneeType.String != "agent" || issue.AssigneeID != thread.AgentID {
			writeError(w, http.StatusConflict, "the session agent is no longer the work item assignee")
			return
		}
		task, err = h.TaskService.EnqueueTaskForIssueWithHandoffAs(r.Context(), issue, message, userID)
	}
	if errors.Is(err, service.ErrManagedSessionWaitingEnvironment) {
		writeJSON(w, http.StatusAccepted, map[string]any{"status": service.SessionStatusWaitingEnvironment})
		return
	}
	if err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"status": service.SessionStatusQueued, "task_id": uuidToString(task.ID)})
}

func hasActiveManagedTurn(tasks []db.AgentTaskQueue) bool {
	for _, task := range tasks {
		switch task.Status {
		case "queued", "dispatched", "running", "waiting_local_directory", "deferred":
			return true
		}
	}
	return false
}

func (h *Handler) loadAgentSessionForUser(w http.ResponseWriter, r *http.Request) (db.AgentSession, bool) {
	if !featureflags.AgentSessionsV2Enabled(r.Context(), h.FeatureFlags) || h.SessionService == nil {
		writeError(w, http.StatusNotFound, "agent session not found")
		return db.AgentSession{}, false
	}
	sessionID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "agent session id")
	if !ok {
		return db.AgentSession{}, false
	}
	workspaceID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace id")
	if !ok {
		return db.AgentSession{}, false
	}
	session, err := h.Queries.GetAgentSessionInWorkspace(r.Context(), db.GetAgentSessionInWorkspaceParams{ID: sessionID, WorkspaceID: workspaceID})
	if err != nil {
		writeError(w, http.StatusNotFound, "agent session not found")
		return db.AgentSession{}, false
	}
	return session, true
}

func (h *Handler) agentSessionToResponse(r *http.Request, session db.AgentSession, detail bool) agentSessionResponse {
	response := agentSessionResponse{
		ID:             uuidToString(session.ID),
		WorkspaceID:    uuidToString(session.WorkspaceID),
		IssueID:        uuidToString(session.IssueID),
		Goal:           session.Goal,
		Mode:           session.Mode,
		Status:         session.Status,
		EntryAgentID:   uuidToString(session.EntryAgentID),
		EntrySquadID:   uuidToString(session.EntrySquadID),
		StopReason:     textToPtr(session.StopReason),
		IterationCount: session.IterationCount,
		MaxIterations:  session.MaxIterations,
		StartedAt:      timestampToPtr(session.StartedAt),
		CompletedAt:    timestampToPtr(session.CompletedAt),
		CreatedAt:      timestampToString(session.CreatedAt),
		UpdatedAt:      timestampToString(session.UpdatedAt),
	}
	if session.IssueID.Valid {
		if issue, err := h.Queries.GetIssue(r.Context(), session.IssueID); err == nil {
			response.IssueTitle = issue.Title
		}
	}
	threads, _ := h.Queries.ListAgentSessionThreads(r.Context(), session.ID)
	response.Threads = make([]agentSessionThreadResponse, 0, len(threads))
	for _, thread := range threads {
		response.Threads = append(response.Threads, h.agentSessionThreadToResponse(r, thread))
	}
	if !detail {
		return response
	}
	approvals, _ := h.Queries.ListSessionApprovals(r.Context(), session.ID)
	response.Approvals = make([]sessionApprovalResponse, 0, len(approvals))
	for _, approval := range approvals {
		response.Approvals = append(response.Approvals, sessionApprovalResponseFromDB(approval))
	}
	if outcome, err := h.Queries.GetSessionOutcome(r.Context(), session.ID); err == nil {
		evaluations, _ := h.Queries.ListOutcomeEvaluations(r.Context(), outcome.ID)
		out := sessionOutcomeResponseFromDB(outcome, evaluations)
		response.Outcome = &out
	}
	tasks, _ := h.Queries.ListTasksByAgentSession(r.Context(), session.ID)
	response.Tasks = make([]agentSessionTaskResponse, 0, len(tasks))
	for _, task := range tasks {
		response.Tasks = append(response.Tasks, agentSessionTaskResponse{
			ID:          uuidToString(task.ID),
			ThreadID:    uuidToString(task.SessionThreadID),
			Status:      task.Status,
			Attempt:     task.Attempt,
			MaxAttempts: task.MaxAttempts,
			Error:       textToPtr(task.Error),
			CreatedAt:   timestampToString(task.CreatedAt),
			StartedAt:   timestampToPtr(task.StartedAt),
			CompletedAt: timestampToPtr(task.CompletedAt),
		})
	}
	return response
}

func (h *Handler) agentSessionThreadToResponse(r *http.Request, thread db.AgentSessionThread) agentSessionThreadResponse {
	response := agentSessionThreadResponse{
		ID:                 uuidToString(thread.ID),
		AgentID:            uuidToString(thread.AgentID),
		AgentVersionID:     uuidToString(thread.AgentVersionID),
		RuntimeID:          uuidToString(thread.RuntimeID),
		ParentThreadID:     uuidToString(thread.ParentThreadID),
		Role:               thread.Role,
		Status:             thread.Status,
		HasProviderSession: thread.ProviderSessionID.Valid,
		PermissionPolicy:   json.RawMessage(thread.PermissionPolicy),
		StopReason:         textToPtr(thread.StopReason),
		StartedAt:          timestampToPtr(thread.StartedAt),
		CompletedAt:        timestampToPtr(thread.CompletedAt),
		LastTurnAt:         timestampToPtr(thread.LastTurnAt),
		CreatedAt:          timestampToString(thread.CreatedAt),
	}
	if version, err := h.Queries.GetAgentVersion(r.Context(), thread.AgentVersionID); err == nil {
		response.AgentName = version.Name
		response.AgentVersionNumber = version.VersionNumber
	}
	if thread.RuntimeID.Valid {
		if runtime, err := h.Queries.GetAgentRuntime(r.Context(), thread.RuntimeID); err == nil {
			response.RuntimeName = runtime.Name
			if runtime.CustomName.Valid {
				response.RuntimeName = runtime.CustomName.String
			}
			response.RuntimeProvider = runtime.Provider
			response.RuntimeStatus = runtime.Status
		}
	}
	return response
}

func agentSessionEventToResponse(event db.AgentSessionEvent) agentSessionEventResponse {
	return agentSessionEventResponse{
		ID:             uuidToString(event.ID),
		Seq:            event.Seq,
		AgentSessionID: uuidToString(event.AgentSessionID),
		ThreadID:       uuidToString(event.ThreadID),
		ActorType:      event.ActorType,
		ActorID:        uuidToString(event.ActorID),
		EventType:      event.EventType,
		Payload:        json.RawMessage(event.Payload),
		SourceTaskID:   uuidToString(event.SourceTaskID),
		CreatedAt:      timestampToString(event.CreatedAt),
	}
}

func sessionApprovalResponseFromDB(approval db.SessionApproval) sessionApprovalResponse {
	return sessionApprovalResponse{
		ID:                   uuidToString(approval.ID),
		ThreadID:             uuidToString(approval.ThreadID),
		ActionNamespace:      approval.ActionNamespace,
		OperationFingerprint: approval.OperationFingerprint,
		Title:                approval.Title,
		Details:              json.RawMessage(approval.Details),
		RiskLevel:            approval.RiskLevel,
		Status:               approval.Status,
		DecisionReason:       textToPtr(approval.DecisionReason),
		ExpiresAt:            timestampToString(approval.ExpiresAt),
		ResolvedAt:           timestampToPtr(approval.ResolvedAt),
		CreatedAt:            timestampToString(approval.CreatedAt),
	}
}

func sessionOutcomeResponseFromDB(outcome db.SessionOutcome, evaluations []db.OutcomeEvaluation) sessionOutcomeResponse {
	response := sessionOutcomeResponse{
		ID:               uuidToString(outcome.ID),
		RubricMarkdown:   outcome.RubricMarkdown,
		Status:           outcome.Status,
		MaxIterations:    outcome.MaxIterations,
		CurrentIteration: outcome.CurrentIteration,
		CompletedAt:      timestampToPtr(outcome.CompletedAt),
		Evaluations:      make([]outcomeEvaluationResponse, 0, len(evaluations)),
	}
	for _, evaluation := range evaluations {
		response.Evaluations = append(response.Evaluations, outcomeEvaluationResponse{
			ID:        uuidToString(evaluation.ID),
			Attempt:   evaluation.Attempt,
			Verdict:   evaluation.Verdict,
			Summary:   evaluation.Summary,
			Evidence:  json.RawMessage(evaluation.Evidence),
			CreatedAt: timestampToString(evaluation.CreatedAt),
		})
	}
	return response
}

type executionBindingRequest struct {
	RuntimeID string `json:"runtime_id"`
	Priority  int32  `json:"priority"`
	Enabled   *bool  `json:"enabled,omitempty"`
}

type executionBindingResponse struct {
	ID              string `json:"id"`
	RuntimeID       string `json:"runtime_id"`
	RuntimeName     string `json:"runtime_name"`
	Provider        string `json:"provider"`
	ProfileID       string `json:"profile_id,omitempty"`
	DaemonID        string `json:"daemon_id,omitempty"`
	Priority        int32  `json:"priority"`
	Enabled         bool   `json:"enabled"`
	Status          string `json:"status"`
	ActiveTaskCount int32  `json:"active_task_count"`
}

func (h *Handler) ListAgentExecutionBindings(w http.ResponseWriter, r *http.Request) {
	agent, ok := h.loadAgentForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	bindings, err := h.Queries.ListAgentRuntimeBindings(r.Context(), agent.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list execution bindings")
		return
	}
	writeJSON(w, http.StatusOK, executionBindingResponses(bindings))
}

func (h *Handler) UpsertAgentExecutionBinding(w http.ResponseWriter, r *http.Request) {
	agent, ok := h.loadAgentForUser(w, r, chi.URLParam(r, "id"))
	if !ok || !h.canManageAgent(w, r, agent) {
		return
	}
	var req executionBindingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	runtimeID, ok := parseUUIDOrBadRequest(w, req.RuntimeID, "runtime_id")
	if !ok {
		return
	}
	runtime, err := h.Queries.GetAgentRuntimeForWorkspace(r.Context(), db.GetAgentRuntimeForWorkspaceParams{ID: runtimeID, WorkspaceID: agent.WorkspaceID})
	if err != nil {
		writeError(w, http.StatusBadRequest, "runtime is not available in this workspace")
		return
	}
	member, ok := h.workspaceMember(w, r, uuidToString(agent.WorkspaceID))
	if !ok {
		return
	}
	if !canUseRuntimeForAgent(member, runtime) {
		writeError(w, http.StatusForbidden, "this execution environment is not available to you")
		return
	}
	if agent.RuntimeID.Valid {
		preferred, err := h.Queries.GetAgentRuntime(r.Context(), agent.RuntimeID)
		if err == nil && !runtimeBindingCompatible(preferred, runtime) {
			writeJSON(w, http.StatusConflict, map[string]any{
				"code":  "incompatible_runtime_binding",
				"error": "runtime provider or custom profile does not match the agent's primary runtime",
			})
			return
		}
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	if req.Priority < 0 || req.Priority > 1000 {
		writeError(w, http.StatusBadRequest, "priority must be between 0 and 1000")
		return
	}
	createdBy, ok := parseUUIDOrBadRequest(w, requestUserID(r), "user id")
	if !ok {
		return
	}
	_, err = h.Queries.UpsertAgentRuntimeBinding(r.Context(), db.UpsertAgentRuntimeBindingParams{
		AgentID:   agent.ID,
		RuntimeID: runtime.ID,
		Priority:  req.Priority,
		Enabled:   enabled,
		CreatedBy: createdBy,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save execution binding")
		return
	}
	bindings, _ := h.Queries.ListAgentRuntimeBindings(r.Context(), agent.ID)
	if runtime.Status == "online" && h.TaskService != nil {
		resumeCtx, cancelResume := context.WithTimeout(context.WithoutCancel(r.Context()), 10*time.Second)
		go func() {
			defer cancelResume()
			h.TaskService.ResumeWaitingSessionsForRuntime(resumeCtx, runtime.ID)
		}()
	}
	writeJSON(w, http.StatusOK, executionBindingResponses(bindings))
}

func (h *Handler) DeleteAgentExecutionBinding(w http.ResponseWriter, r *http.Request) {
	agent, ok := h.loadAgentForUser(w, r, chi.URLParam(r, "id"))
	if !ok || !h.canManageAgent(w, r, agent) {
		return
	}
	runtimeID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "runtimeId"), "runtime id")
	if !ok {
		return
	}
	if agent.RuntimeID == runtimeID {
		writeError(w, http.StatusConflict, "the primary execution environment cannot be removed")
		return
	}
	count, err := h.Queries.DeleteAgentRuntimeBinding(r.Context(), db.DeleteAgentRuntimeBindingParams{AgentID: agent.ID, RuntimeID: runtimeID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete execution binding")
		return
	}
	if count == 0 {
		writeError(w, http.StatusNotFound, "execution binding not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func runtimeBindingCompatible(primary, candidate db.AgentRuntime) bool {
	if primary.Provider != candidate.Provider {
		return false
	}
	if primary.ProfileID.Valid || candidate.ProfileID.Valid {
		return primary.ProfileID.Valid && candidate.ProfileID.Valid && primary.ProfileID == candidate.ProfileID
	}
	return true
}

func executionBindingResponses(rows []db.ListAgentRuntimeBindingsRow) []executionBindingResponse {
	response := make([]executionBindingResponse, 0, len(rows))
	for _, row := range rows {
		name := row.RuntimeName
		if row.RuntimeCustomName.Valid {
			name = row.RuntimeCustomName.String
		}
		response = append(response, executionBindingResponse{
			ID:              uuidToString(row.ID),
			RuntimeID:       uuidToString(row.RuntimeID),
			RuntimeName:     name,
			Provider:        row.Provider,
			ProfileID:       uuidToString(row.ProfileID),
			DaemonID:        row.DaemonID.String,
			Priority:        row.Priority,
			Enabled:         row.Enabled,
			Status:          row.RuntimeStatus,
			ActiveTaskCount: row.ActiveTaskCount,
		})
	}
	return response
}
