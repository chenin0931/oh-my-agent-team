package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/chenin0931/oh-my-agent-team/server/internal/events"
	"github.com/chenin0931/oh-my-agent-team/server/internal/util"
	db "github.com/chenin0931/oh-my-agent-team/server/pkg/db/generated"
	"github.com/chenin0931/oh-my-agent-team/server/pkg/protocol"
	"github.com/chenin0931/oh-my-agent-team/server/pkg/redact"
)

const (
	SessionModeExecutor    = "executor"
	SessionModeAdvisor     = "advisor"
	SessionModeCoordinator = "coordinator"
	SessionModeReviewer    = "reviewer"
	SessionModePlanning    = "planning"

	SessionStatusQueued             = "queued"
	SessionStatusRunning            = "running"
	SessionStatusWaitingApproval    = "waiting_approval"
	SessionStatusWaitingInput       = "waiting_input"
	SessionStatusWaitingEnvironment = "waiting_environment"
	SessionStatusIdle               = "idle"
	SessionStatusCompleted          = "completed"
	SessionStatusFailed             = "failed"
	SessionStatusCancelled          = "cancelled"

	SessionEventRealtime = "session:event"
)

var ErrManagedSessionWaitingEnvironment = errors.New("managed session is waiting for an online execution environment")

const managedSquadSynthesisHandoffPrefix = "[managed-squad-synthesis]"

// ManagedTaskCompletion describes work that must happen after the task's own
// comment has been persisted. In particular, a Squad Session only resumes its
// coordinator after every delegated thread in the current wave has stopped.
type ManagedTaskCompletion struct {
	NeedsOutcomeReview bool
	ResumeCoordinator  bool
	SessionID          pgtype.UUID
	CoordinatorAgentID pgtype.UUID
	SquadID            pgtype.UUID
	OriginatorUserID   pgtype.UUID
	HandoffNote        string
}

type managedSquadCompletionDecision struct {
	deferFinalization bool
	resumeCoordinator bool
	waveKey           string
	completed         int
	failed            int
}

type ManagedSessionService struct {
	Queries   *db.Queries
	TxStarter TxStarter
	Bus       *events.Bus
}

func NewManagedSessionService(q *db.Queries, tx TxStarter, bus *events.Bus) *ManagedSessionService {
	return &ManagedSessionService{Queries: q, TxStarter: tx, Bus: bus}
}

type EnsureManagedSessionParams struct {
	Issue       db.Issue
	Agent       db.Agent
	Mode        string
	Role        string
	SquadID     pgtype.UUID
	CreatedBy   pgtype.UUID
	Goal        string
	ForceNew    bool
	AllowPool   bool
	MaxAttempts int32
}

type ManagedSessionPlacement struct {
	Session            db.AgentSession
	Thread             db.AgentSessionThread
	Runtime            db.AgentRuntime
	Created            bool
	WaitingEnvironment bool
}

func (s *ManagedSessionService) Ensure(ctx context.Context, p EnsureManagedSessionParams) (ManagedSessionPlacement, error) {
	if s == nil || s.Queries == nil {
		return ManagedSessionPlacement{}, errors.New("managed session service is unavailable")
	}
	if !p.Issue.ID.Valid || !p.Agent.ID.Valid {
		return ManagedSessionPlacement{}, errors.New("managed session requires an issue and agent")
	}
	if p.Issue.IssueType == IssueTypeEpic {
		return ManagedSessionPlacement{}, errors.New("epic cannot create an execution session")
	}
	if p.Mode == "" {
		p.Mode = SessionModeExecutor
	}
	if p.Role == "" {
		p.Role = roleForSessionMode(p.Mode)
	}
	if p.MaxAttempts <= 0 {
		p.MaxAttempts = 3
	}
	if strings.TrimSpace(p.Goal) == "" {
		p.Goal = p.Issue.Title
	}

	if !p.ForceNew {
		if existing, err := s.findOpen(ctx, s.Queries, p); err == nil {
			return s.refreshPlacement(ctx, existing, p)
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return ManagedSessionPlacement{}, fmt.Errorf("load open managed session: %w", err)
		}
	}

	version, err := s.SnapshotAgent(ctx, p.Agent)
	if err != nil {
		return ManagedSessionPlacement{}, err
	}
	runtime, runtimeErr := s.selectRuntime(ctx, s.Queries, p.Agent, p.AllowPool)
	status := SessionStatusQueued
	var runtimeID pgtype.UUID
	if runtimeErr == nil {
		runtimeID = runtime.ID
	} else if errors.Is(runtimeErr, pgx.ErrNoRows) {
		status = SessionStatusWaitingEnvironment
	} else {
		return ManagedSessionPlacement{}, fmt.Errorf("select execution environment: %w", runtimeErr)
	}

	metadata, _ := json.Marshal(map[string]any{
		"protocol_version": "2",
		"permission_model": "namespace-v1",
	})
	policy, _ := json.Marshal(DefaultSessionPermissionPolicy(p.Mode))

	var createdSession db.AgentSession
	var createdThread db.AgentSessionThread
	var createdEvent db.AgentSessionEvent
	err = s.runInTx(ctx, func(q *db.Queries) error {
		var entryAgentID, entrySquadID pgtype.UUID
		if p.SquadID.Valid {
			entrySquadID = p.SquadID
		} else {
			entryAgentID = p.Agent.ID
		}
		var createErr error
		createdSession, createErr = q.CreateAgentSession(ctx, db.CreateAgentSessionParams{
			WorkspaceID:   p.Issue.WorkspaceID,
			IssueID:       p.Issue.ID,
			Goal:          strings.TrimSpace(p.Goal),
			Mode:          p.Mode,
			Status:        status,
			EntryAgentID:  entryAgentID,
			EntrySquadID:  entrySquadID,
			CreatedBy:     p.CreatedBy,
			MaxIterations: p.MaxAttempts,
			Metadata:      metadata,
		})
		if createErr != nil {
			return createErr
		}
		createdThread, createErr = q.CreateAgentSessionThread(ctx, db.CreateAgentSessionThreadParams{
			AgentSessionID:   createdSession.ID,
			AgentID:          p.Agent.ID,
			AgentVersionID:   version.ID,
			RuntimeID:        runtimeID,
			Role:             p.Role,
			Status:           status,
			PermissionPolicy: policy,
		})
		if createErr != nil {
			return createErr
		}
		createdEvent, createErr = appendManagedEvent(ctx, q, ManagedEventInput{
			SessionID:      createdSession.ID,
			ThreadID:       createdThread.ID,
			ActorType:      "system",
			EventType:      "session.status_" + status,
			Payload:        map[string]any{"status": status, "mode": p.Mode},
			Visibility:     "workspace",
			IdempotencyKey: "session-created",
		})
		if createErr != nil {
			return createErr
		}
		if strings.TrimSpace(p.Issue.AcceptanceCriteria.String) != "" && p.Issue.AcceptanceCriteria.Valid {
			_, createErr = q.UpsertSessionOutcome(ctx, db.UpsertSessionOutcomeParams{
				AgentSessionID: createdSession.ID,
				RubricMarkdown: p.Issue.AcceptanceCriteria.String,
				MaxIterations:  p.MaxAttempts,
				CreatedBy:      p.CreatedBy,
			})
		}
		return createErr
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && !p.ForceNew {
			if existing, loadErr := s.findOpen(ctx, s.Queries, p); loadErr == nil {
				return s.refreshPlacement(ctx, existing, p)
			}
		}
		return ManagedSessionPlacement{}, fmt.Errorf("create managed session: %w", err)
	}
	s.publishEvent(createdSession, createdEvent)
	if status == SessionStatusWaitingEnvironment {
		s.NotifyAction(ctx, createdSession, createdThread.AgentID, "session_waiting_environment", "Execution computer needed", "Connect or enable a compatible desktop agent to continue this Session.", "environment", map[string]any{"status": status})
	}
	return ManagedSessionPlacement{
		Session:            createdSession,
		Thread:             createdThread,
		Runtime:            runtime,
		Created:            true,
		WaitingEnvironment: status == SessionStatusWaitingEnvironment,
	}, nil
}

func (s *ManagedSessionService) findOpen(ctx context.Context, q *db.Queries, p EnsureManagedSessionParams) (db.AgentSession, error) {
	if p.SquadID.Valid {
		return q.GetOpenCoordinatorSessionForSquad(ctx, db.GetOpenCoordinatorSessionForSquadParams{
			IssueID: p.Issue.ID,
			SquadID: p.SquadID,
		})
	}
	if p.Mode == SessionModeAdvisor {
		return q.GetOpenAdvisorSessionForAgent(ctx, db.GetOpenAdvisorSessionForAgentParams{
			IssueID: p.Issue.ID,
			AgentID: p.Agent.ID,
		})
	}
	return q.GetOpenExecutorSessionForAgent(ctx, db.GetOpenExecutorSessionForAgentParams{
		IssueID: p.Issue.ID,
		AgentID: p.Agent.ID,
	})
}

func (s *ManagedSessionService) refreshPlacement(ctx context.Context, session db.AgentSession, p EnsureManagedSessionParams) (ManagedSessionPlacement, error) {
	thread, err := s.Queries.GetAgentSessionThreadForAgent(ctx, db.GetAgentSessionThreadForAgentParams{
		AgentSessionID: session.ID,
		AgentID:        p.Agent.ID,
		Role:           p.Role,
	})
	if err != nil {
		return ManagedSessionPlacement{}, fmt.Errorf("load managed thread: %w", err)
	}
	runtime, runtimeErr := s.selectRuntime(ctx, s.Queries, p.Agent, p.AllowPool)
	if runtimeErr == nil {
		if !thread.RuntimeID.Valid || thread.RuntimeID != runtime.ID || thread.Status == SessionStatusWaitingEnvironment {
			thread, err = s.Queries.UpdateAgentSessionThreadRuntime(ctx, db.UpdateAgentSessionThreadRuntimeParams{
				RuntimeID: runtime.ID,
				Status:    SessionStatusQueued,
				ID:        thread.ID,
			})
			if err != nil {
				return ManagedSessionPlacement{}, err
			}
			if session.Status == SessionStatusWaitingEnvironment {
				session, err = s.Transition(ctx, session.ID, SessionStatusQueued, "", thread.ID, pgtype.UUID{})
				if err != nil {
					return ManagedSessionPlacement{}, err
				}
			}
		}
		return ManagedSessionPlacement{Session: session, Thread: thread, Runtime: runtime}, nil
	}
	if !errors.Is(runtimeErr, pgx.ErrNoRows) {
		return ManagedSessionPlacement{}, runtimeErr
	}
	if session.Status != SessionStatusWaitingEnvironment {
		session, err = s.Transition(ctx, session.ID, SessionStatusWaitingEnvironment, "no online bound runtime", thread.ID, pgtype.UUID{})
		if err != nil {
			return ManagedSessionPlacement{}, err
		}
		s.NotifyAction(ctx, session, thread.AgentID, "session_waiting_environment", "Execution computer needed", "Connect or enable a compatible desktop agent to continue this Session.", "environment", map[string]any{"status": SessionStatusWaitingEnvironment})
	}
	_, _ = s.Queries.UpdateAgentSessionThreadRuntime(ctx, db.UpdateAgentSessionThreadRuntimeParams{
		RuntimeID: pgtype.UUID{},
		Status:    SessionStatusWaitingEnvironment,
		ID:        thread.ID,
	})
	return ManagedSessionPlacement{Session: session, Thread: thread, WaitingEnvironment: true}, nil
}

func (s *ManagedSessionService) selectRuntime(ctx context.Context, q *db.Queries, agent db.Agent, allowPool bool) (db.AgentRuntime, error) {
	if allowPool {
		return q.SelectManagedRuntimeForAgent(ctx, agent.ID)
	}
	if !agent.RuntimeID.Valid {
		return db.AgentRuntime{}, pgx.ErrNoRows
	}
	runtime, err := q.GetAgentRuntime(ctx, agent.RuntimeID)
	if err != nil || runtime.Status != "online" {
		return db.AgentRuntime{}, pgx.ErrNoRows
	}
	return runtime, nil
}

func (s *ManagedSessionService) SnapshotAgent(ctx context.Context, agent db.Agent) (db.AgentVersion, error) {
	skills, err := s.Queries.ListAgentSkills(ctx, agent.ID)
	if err != nil {
		return db.AgentVersion{}, fmt.Errorf("list agent skills for snapshot: %w", err)
	}
	skillIDs := make([]string, 0, len(skills))
	for _, skill := range skills {
		skillIDs = append(skillIDs, util.UUIDToString(skill.ID))
	}
	sort.Strings(skillIDs)

	var mcp map[string]any
	_ = json.Unmarshal(agent.McpConfig, &mcp)
	serverMap := mcp
	if nested, ok := mcp["mcpServers"].(map[string]any); ok {
		serverMap = nested
	}
	mcpNames := make([]string, 0, len(serverMap))
	for name := range serverMap {
		mcpNames = append(mcpNames, name)
	}
	sort.Strings(mcpNames)
	var customArgs any = []any{}
	_ = json.Unmarshal(agent.CustomArgs, &customArgs)
	toolConfig := map[string]any{
		"mcp_server_names":  mcpNames,
		"composio_toolkits": agent.ComposioToolkitAllowlist,
		"custom_args":       sanitizeManagedPayload(customArgs),
	}
	runtimeConfig := sanitizeJSONBytes(agent.RuntimeConfig, map[string]any{})
	config := map[string]any{
		"name":           agent.Name,
		"description":    agent.Description,
		"instructions":   agent.Instructions,
		"model":          textValue(agent.Model),
		"thinking_level": textValue(agent.ThinkingLevel),
		"skill_ids":      skillIDs,
		"tool_config":    toolConfig,
		"runtime_config": runtimeConfig,
	}
	canonical, _ := json.Marshal(config)
	sum := sha256.Sum256(canonical)
	skillJSON, _ := json.Marshal(skillIDs)
	toolJSON, _ := json.Marshal(toolConfig)
	runtimeJSON, _ := json.Marshal(runtimeConfig)

	version, err := s.Queries.CreateAgentVersion(ctx, db.CreateAgentVersionParams{
		AgentID:       agent.ID,
		WorkspaceID:   agent.WorkspaceID,
		AgentName:     agent.Name,
		Description:   agent.Description,
		Instructions:  agent.Instructions,
		Model:         agent.Model,
		ThinkingLevel: agent.ThinkingLevel,
		SkillIds:      skillJSON,
		ToolConfig:    toolJSON,
		RuntimeConfig: runtimeJSON,
		ConfigHash:    hex.EncodeToString(sum[:]),
	})
	if err == nil {
		return version, nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return s.Queries.GetAgentVersionByHash(ctx, db.GetAgentVersionByHashParams{
			AgentID:    agent.ID,
			ConfigHash: hex.EncodeToString(sum[:]),
		})
	}
	return db.AgentVersion{}, fmt.Errorf("snapshot agent: %w", err)
}

type ManagedEventInput struct {
	SessionID      pgtype.UUID
	ThreadID       pgtype.UUID
	ActorType      string
	ActorID        pgtype.UUID
	EventType      string
	Payload        any
	Visibility     string
	SourceTaskID   pgtype.UUID
	IdempotencyKey string
}

func (s *ManagedSessionService) AppendEvent(ctx context.Context, in ManagedEventInput) (db.AgentSessionEvent, error) {
	event, err := appendManagedEvent(ctx, s.Queries, in)
	if err != nil {
		return db.AgentSessionEvent{}, err
	}
	session, err := s.Queries.GetAgentSession(ctx, in.SessionID)
	if err == nil {
		s.publishEvent(session, event)
	}
	return event, nil
}

func appendManagedEvent(ctx context.Context, q *db.Queries, in ManagedEventInput) (db.AgentSessionEvent, error) {
	if in.ActorType == "" {
		in.ActorType = "system"
	}
	if in.Visibility == "" {
		in.Visibility = "workspace"
	}
	payload, err := json.Marshal(sanitizeManagedEventPayload(in.Payload))
	if err != nil {
		return db.AgentSessionEvent{}, fmt.Errorf("encode session event: %w", err)
	}
	return q.AppendAgentSessionEvent(ctx, db.AppendAgentSessionEventParams{
		AgentSessionID: in.SessionID,
		ThreadID:       in.ThreadID,
		ActorType:      in.ActorType,
		ActorID:        in.ActorID,
		EventType:      in.EventType,
		Payload:        payload,
		Visibility:     in.Visibility,
		SourceTaskID:   in.SourceTaskID,
		IdempotencyKey: pgtype.Text{String: in.IdempotencyKey, Valid: in.IdempotencyKey != ""},
	})
}

func (s *ManagedSessionService) publishEvent(session db.AgentSession, event db.AgentSessionEvent) {
	if s.Bus == nil || event.Visibility != "workspace" {
		return
	}
	s.Bus.Publish(events.Event{
		Type:        SessionEventRealtime,
		WorkspaceID: util.UUIDToString(session.WorkspaceID),
		Payload: map[string]any{
			"id":               util.UUIDToString(event.ID),
			"seq":              event.Seq,
			"agent_session_id": util.UUIDToString(event.AgentSessionID),
			"issue_id":         util.UUIDToString(session.IssueID),
			"entry_squad_id":   util.UUIDToString(session.EntrySquadID),
			"thread_id":        util.UUIDToString(event.ThreadID),
			"actor_type":       event.ActorType,
			"actor_id":         util.UUIDToString(event.ActorID),
			"event_type":       event.EventType,
			"payload":          json.RawMessage(event.Payload),
			"visibility":       event.Visibility,
			"source_task_id":   util.UUIDToString(event.SourceTaskID),
			"created_at":       event.CreatedAt.Time,
		},
	})
}

func (s *ManagedSessionService) Transition(ctx context.Context, sessionID pgtype.UUID, next, reason string, threadID, sourceTaskID pgtype.UUID) (db.AgentSession, error) {
	current, err := s.Queries.GetAgentSession(ctx, sessionID)
	if err != nil {
		return db.AgentSession{}, err
	}
	if current.Status == next {
		return current, nil
	}
	if !CanTransitionManagedSession(current.Status, next) {
		return db.AgentSession{}, fmt.Errorf("invalid managed session transition %s -> %s", current.Status, next)
	}
	updated, err := s.Queries.UpdateAgentSessionStatus(ctx, db.UpdateAgentSessionStatusParams{
		Status:     next,
		StopReason: pgtype.Text{String: reason, Valid: strings.TrimSpace(reason) != ""},
		ID:         sessionID,
	})
	if err != nil {
		return db.AgentSession{}, err
	}
	event, err := appendManagedEvent(ctx, s.Queries, ManagedEventInput{
		SessionID:      sessionID,
		ThreadID:       threadID,
		ActorType:      "system",
		EventType:      "session.status_" + next,
		Payload:        map[string]any{"from": current.Status, "status": next, "reason": reason},
		Visibility:     "workspace",
		SourceTaskID:   sourceTaskID,
		IdempotencyKey: fmt.Sprintf("status:%s:%s", next, util.UUIDToString(sourceTaskID)),
	})
	if err == nil {
		s.publishEvent(updated, event)
	}
	return updated, nil
}

func CanTransitionManagedSession(from, to string) bool {
	if from == to {
		return true
	}
	allowed := map[string]map[string]bool{
		SessionStatusQueued: {
			SessionStatusRunning: true, SessionStatusWaitingEnvironment: true,
			SessionStatusWaitingInput: true, SessionStatusCancelled: true, SessionStatusFailed: true,
		},
		SessionStatusRunning: {
			SessionStatusWaitingApproval: true, SessionStatusWaitingInput: true,
			SessionStatusWaitingEnvironment: true, SessionStatusIdle: true,
			SessionStatusCompleted: true, SessionStatusFailed: true, SessionStatusCancelled: true,
		},
		SessionStatusWaitingApproval: {
			SessionStatusQueued: true, SessionStatusRunning: true, SessionStatusWaitingInput: true,
			SessionStatusFailed: true, SessionStatusCancelled: true,
		},
		SessionStatusWaitingInput: {
			SessionStatusQueued: true, SessionStatusRunning: true, SessionStatusIdle: true,
			SessionStatusFailed: true, SessionStatusCancelled: true,
		},
		SessionStatusWaitingEnvironment: {
			SessionStatusQueued: true, SessionStatusRunning: true,
			SessionStatusFailed: true, SessionStatusCancelled: true,
		},
		SessionStatusIdle: {
			SessionStatusQueued: true, SessionStatusRunning: true,
			SessionStatusWaitingApproval: true, SessionStatusWaitingInput: true,
			SessionStatusCompleted: true, SessionStatusFailed: true, SessionStatusCancelled: true,
		},
	}
	return allowed[from][to]
}

func (s *ManagedSessionService) AttachTask(ctx context.Context, task db.AgentTaskQueue, placement ManagedSessionPlacement) (db.AgentTaskQueue, error) {
	linked, err := s.Queries.LinkTaskToManagedSession(ctx, db.LinkTaskToManagedSessionParams{
		AgentSessionID:  placement.Session.ID,
		SessionThreadID: placement.Thread.ID,
		TaskID:          task.ID,
	})
	if err != nil {
		return db.AgentTaskQueue{}, err
	}
	_, _ = s.Queries.UpdateAgentSessionThreadStatus(ctx, db.UpdateAgentSessionThreadStatusParams{
		Status: SessionStatusQueued,
		ID:     placement.Thread.ID,
	})
	if placement.Session.Status == SessionStatusIdle || placement.Session.Status == SessionStatusWaitingInput {
		_, _ = s.Transition(ctx, placement.Session.ID, SessionStatusQueued, "", placement.Thread.ID, linked.ID)
	}
	_, err = s.AppendEvent(ctx, ManagedEventInput{
		SessionID:      placement.Session.ID,
		ThreadID:       placement.Thread.ID,
		ActorType:      "system",
		EventType:      "session.thread_turn_queued",
		Payload:        map[string]any{"task_id": util.UUIDToString(linked.ID), "role": placement.Thread.Role},
		Visibility:     "workspace",
		SourceTaskID:   linked.ID,
		IdempotencyKey: "turn:queued:" + util.UUIDToString(linked.ID),
	})
	return linked, err
}

func (s *ManagedSessionService) OnTaskStarted(ctx context.Context, task db.AgentTaskQueue) {
	if !task.AgentSessionID.Valid || !task.SessionThreadID.Valid {
		return
	}
	_, _ = s.Queries.UpdateAgentSessionThreadStatus(ctx, db.UpdateAgentSessionThreadStatusParams{
		Status: SessionStatusRunning,
		ID:     task.SessionThreadID,
	})
	_, _ = s.Transition(ctx, task.AgentSessionID, SessionStatusRunning, "", task.SessionThreadID, task.ID)
}

func (s *ManagedSessionService) OnTaskCompleted(ctx context.Context, task db.AgentTaskQueue) ManagedTaskCompletion {
	if !task.AgentSessionID.Valid || !task.SessionThreadID.Valid {
		return ManagedTaskCompletion{}
	}
	thread, threadErr := s.Queries.GetAgentSessionThread(ctx, task.SessionThreadID)
	session, sessionErr := s.Queries.GetAgentSession(ctx, task.AgentSessionID)
	_, _ = s.Queries.PinAgentSessionThreadProviderContext(ctx, db.PinAgentSessionThreadProviderContextParams{
		ProviderSessionID: task.SessionID,
		WorkDir:           task.WorkDir,
		ID:                task.SessionThreadID,
	})
	_, _ = s.Queries.UpdateAgentSessionThreadStatus(ctx, db.UpdateAgentSessionThreadStatusParams{
		Status: SessionStatusIdle,
		ID:     task.SessionThreadID,
	})
	_, _ = s.AppendEvent(ctx, ManagedEventInput{
		SessionID:      task.AgentSessionID,
		ThreadID:       task.SessionThreadID,
		ActorType:      "agent",
		ActorID:        task.AgentID,
		EventType:      "agent.message",
		Payload:        managedTaskResultSummary(task.Result),
		Visibility:     "workspace",
		SourceTaskID:   task.ID,
		IdempotencyKey: "turn:completed:" + util.UUIDToString(task.ID),
	})
	if sessionErr == nil && IsManagedOutcomeReviewTask(task) {
		// The reviewer completion handler owns the Session transition after it
		// parses the verdict. Moving the Session or Issue here would race that
		// decision and can make a revision request impossible to resume.
		return ManagedTaskCompletion{}
	}
	if sessionErr == nil && session.Mode == SessionModeAdvisor {
		// Advisor Sessions are collaboration-only. Their successful comment
		// must never advance the executable work item's status.
		_, _ = s.Transition(ctx, task.AgentSessionID, SessionStatusCompleted, "advisor turn completed", task.SessionThreadID, task.ID)
		return ManagedTaskCompletion{}
	}

	if threadErr == nil && sessionErr == nil && session.Mode == SessionModeCoordinator {
		tasks, tasksErr := s.Queries.ListTasksByAgentSession(ctx, session.ID)
		threads, threadsErr := s.Queries.ListAgentSessionThreads(ctx, session.ID)
		if tasksErr == nil && threadsErr == nil {
			decision := decideManagedSquadCompletion(task, thread, tasks, threads)
			if decision.deferFinalization {
				if decision.resumeCoordinator {
					handoff := fmt.Sprintf(
						"%s Delegated Squad work has finished (%d completed, %d failed or cancelled). Read the delegated agents' latest comments and Session events, then produce one concise final synthesis for the work item. Do not delegate more work in this synthesis turn.",
						managedSquadSynthesisHandoffPrefix,
						decision.completed,
						decision.failed,
					)
					event, eventErr := appendManagedEvent(ctx, s.Queries, ManagedEventInput{
						SessionID:      session.ID,
						ThreadID:       thread.ID,
						ActorType:      "system",
						EventType:      "session.delegation_completed",
						Payload:        map[string]any{"completed": decision.completed, "failed": decision.failed},
						Visibility:     "workspace",
						SourceTaskID:   task.ID,
						IdempotencyKey: "squad-wave-complete:" + decision.waveKey,
					})
					// AppendAgentSessionEvent returns the existing row on an
					// idempotency conflict. Only the task that inserted the row
					// may enqueue the coordinator continuation.
					if eventErr == nil && event.SourceTaskID == task.ID {
						s.publishEvent(session, event)
						primary, primaryErr := s.Queries.GetPrimaryAgentSessionThread(ctx, session.ID)
						if primaryErr == nil {
							return ManagedTaskCompletion{
								ResumeCoordinator:  true,
								SessionID:          session.ID,
								CoordinatorAgentID: primary.AgentID,
								SquadID:            session.EntrySquadID,
								OriginatorUserID:   session.CreatedBy,
								HandoffNote:        handoff,
							}
						}
					}
				}
				return ManagedTaskCompletion{}
			}
		}
	}

	_, _ = s.Transition(ctx, task.AgentSessionID, SessionStatusIdle, "turn completed", task.SessionThreadID, task.ID)
	if outcome, err := s.Queries.GetSessionOutcome(ctx, task.AgentSessionID); errors.Is(err, pgx.ErrNoRows) {
		s.moveIssueToReview(ctx, task)
	} else if err == nil && (outcome.Status == "pending" || outcome.Status == "revision_requested") {
		_, _ = s.Queries.UpdateSessionOutcomeStatus(ctx, db.UpdateSessionOutcomeStatusParams{
			Status:             "evaluating",
			IncrementIteration: false,
			ID:                 outcome.ID,
		})
		_, _ = s.Transition(ctx, task.AgentSessionID, SessionStatusWaitingInput, "awaiting outcome review", task.SessionThreadID, task.ID)
		return ManagedTaskCompletion{NeedsOutcomeReview: true}
	}
	return ManagedTaskCompletion{}
}

func (s *ManagedSessionService) OnTaskFailed(ctx context.Context, task db.AgentTaskQueue, reason string) ManagedTaskCompletion {
	if !task.AgentSessionID.Valid || !task.SessionThreadID.Valid {
		return ManagedTaskCompletion{}
	}
	thread, threadErr := s.Queries.GetAgentSessionThread(ctx, task.SessionThreadID)
	session, sessionErr := s.Queries.GetAgentSession(ctx, task.AgentSessionID)
	_, _ = s.Queries.PinAgentSessionThreadProviderContext(ctx, db.PinAgentSessionThreadProviderContextParams{
		ProviderSessionID: task.SessionID,
		WorkDir:           task.WorkDir,
		ID:                task.SessionThreadID,
	})
	_, _ = s.Queries.UpdateAgentSessionThreadStatus(ctx, db.UpdateAgentSessionThreadStatusParams{
		Status:     SessionStatusFailed,
		StopReason: pgtype.Text{String: reason, Valid: reason != ""},
		ID:         task.SessionThreadID,
	})
	_, _ = s.AppendEvent(ctx, ManagedEventInput{
		SessionID:      task.AgentSessionID,
		ThreadID:       task.SessionThreadID,
		ActorType:      "system",
		EventType:      "session.thread_failed",
		Payload:        map[string]any{"reason": reason},
		Visibility:     "workspace",
		SourceTaskID:   task.ID,
		IdempotencyKey: "turn:failed:" + util.UUIDToString(task.ID),
	})
	if threadErr == nil && sessionErr == nil && session.Mode == SessionModeCoordinator {
		tasks, tasksErr := s.Queries.ListTasksByAgentSession(ctx, session.ID)
		threads, threadsErr := s.Queries.ListAgentSessionThreads(ctx, session.ID)
		if tasksErr == nil && threadsErr == nil {
			decision := decideManagedSquadCompletion(task, thread, tasks, threads)
			if decision.deferFinalization {
				if decision.resumeCoordinator {
					handoff := fmt.Sprintf(
						"%s Delegated Squad work has stopped (%d completed, %d failed or cancelled). Review the successful comments and failure events, then produce one concise final synthesis that clearly calls out missing evidence. Do not delegate more work in this synthesis turn.",
						managedSquadSynthesisHandoffPrefix,
						decision.completed,
						decision.failed,
					)
					event, eventErr := appendManagedEvent(ctx, s.Queries, ManagedEventInput{
						SessionID: session.ID, ThreadID: thread.ID, ActorType: "system",
						EventType:  "session.delegation_completed",
						Payload:    map[string]any{"completed": decision.completed, "failed": decision.failed},
						Visibility: "workspace", SourceTaskID: task.ID,
						IdempotencyKey: "squad-wave-complete:" + decision.waveKey,
					})
					if eventErr == nil && event.SourceTaskID == task.ID {
						s.publishEvent(session, event)
						primary, primaryErr := s.Queries.GetPrimaryAgentSessionThread(ctx, session.ID)
						if primaryErr == nil {
							return ManagedTaskCompletion{
								ResumeCoordinator: true, SessionID: session.ID,
								CoordinatorAgentID: primary.AgentID, SquadID: session.EntrySquadID,
								OriginatorUserID: session.CreatedBy, HandoffNote: handoff,
							}
						}
					}
				}
				return ManagedTaskCompletion{}
			}
		}
	}
	_, _ = s.Transition(ctx, task.AgentSessionID, SessionStatusFailed, reason, task.SessionThreadID, task.ID)
	return ManagedTaskCompletion{}
}

func decideManagedSquadCompletion(current db.AgentTaskQueue, currentThread db.AgentSessionThread, tasks []db.AgentTaskQueue, threads []db.AgentSessionThread) managedSquadCompletionDecision {
	childThreads := make(map[[16]byte]struct{})
	for _, thread := range threads {
		if thread.ParentThreadID.Valid {
			childThreads[thread.ID.Bytes] = struct{}{}
		}
	}
	_, currentIsChild := childThreads[currentThread.ID.Bytes]

	isActive := func(status string) bool {
		switch status {
		case "queued", "dispatched", "running", "waiting_local_directory", "deferred":
			return true
		default:
			return false
		}
	}
	for _, task := range tasks {
		if isActive(task.Status) {
			return managedSquadCompletionDecision{deferFinalization: currentIsChild || currentThread.Role == SessionModeCoordinator}
		}
	}

	wave := make([]db.AgentTaskQueue, 0)
	if currentIsChild {
		for _, task := range tasks {
			if _, child := childThreads[task.SessionThreadID.Bytes]; !child {
				continue
			}
			if current.TriggerCommentID.Valid {
				if task.TriggerCommentID == current.TriggerCommentID {
					wave = append(wave, task)
				}
			} else if task.ID == current.ID {
				wave = append(wave, task)
			}
		}
	} else if currentThread.Role == SessionModeCoordinator {
		for _, task := range tasks {
			if _, child := childThreads[task.SessionThreadID.Bytes]; !child || !task.CreatedAt.Valid {
				continue
			}
			if current.StartedAt.Valid && task.CreatedAt.Time.Before(current.StartedAt.Time) {
				continue
			}
			if current.CompletedAt.Valid && task.CreatedAt.Time.After(current.CompletedAt.Time) {
				continue
			}
			wave = append(wave, task)
		}
	}

	if len(wave) == 0 {
		return managedSquadCompletionDecision{}
	}
	decision := managedSquadCompletionDecision{deferFinalization: true}
	winner := wave[0]
	for _, task := range wave {
		if task.Status == "completed" {
			decision.completed++
		} else if task.Status == "failed" || task.Status == "cancelled" {
			decision.failed++
		}
		if managedTaskFinishedAfter(task, winner) {
			winner = task
		}
	}
	if currentIsChild && winner.ID != current.ID {
		return decision
	}
	decision.resumeCoordinator = true
	if currentIsChild && current.TriggerCommentID.Valid {
		decision.waveKey = util.UUIDToString(current.TriggerCommentID)
	} else {
		decision.waveKey = util.UUIDToString(current.ID)
	}
	return decision
}

func managedTaskFinishedAfter(left, right db.AgentTaskQueue) bool {
	if left.CompletedAt.Valid != right.CompletedAt.Valid {
		return left.CompletedAt.Valid
	}
	if left.CompletedAt.Valid && !left.CompletedAt.Time.Equal(right.CompletedAt.Time) {
		return left.CompletedAt.Time.After(right.CompletedAt.Time)
	}
	return util.UUIDToString(left.ID) > util.UUIDToString(right.ID)
}

func (s *ManagedSessionService) OnTaskCancelled(ctx context.Context, task db.AgentTaskQueue, reason string) {
	if !task.AgentSessionID.Valid || !task.SessionThreadID.Valid {
		return
	}
	if strings.TrimSpace(reason) == "" {
		reason = "turn cancelled"
	}
	_, _ = s.Queries.UpdateAgentSessionThreadStatus(ctx, db.UpdateAgentSessionThreadStatusParams{
		Status:     SessionStatusIdle,
		StopReason: pgtype.Text{String: reason, Valid: true},
		ID:         task.SessionThreadID,
	})
	session, err := s.Queries.GetAgentSession(ctx, task.AgentSessionID)
	if err == nil && session.Status != SessionStatusCancelled && session.Status != SessionStatusCompleted && session.Status != SessionStatusFailed {
		_, _ = s.Transition(ctx, task.AgentSessionID, SessionStatusWaitingInput, reason, task.SessionThreadID, task.ID)
	}
}

func (s *ManagedSessionService) Interrupt(ctx context.Context, session db.AgentSession, userID pgtype.UUID, reason string) ([]db.AgentTaskQueue, error) {
	if strings.TrimSpace(reason) == "" {
		reason = "interrupted by user"
	}
	cancelled, err := s.Queries.CancelActiveTasksByAgentSession(ctx, db.CancelActiveTasksByAgentSessionParams{
		CancelReason:   pgtype.Text{String: reason, Valid: true},
		AgentSessionID: session.ID,
	})
	if err != nil {
		return nil, err
	}
	_, _ = s.Queries.CancelPendingSessionApprovals(ctx, session.ID)
	thread, _ := s.Queries.GetPrimaryAgentSessionThread(ctx, session.ID)
	_, _ = s.Transition(ctx, session.ID, SessionStatusWaitingInput, reason, thread.ID, pgtype.UUID{})
	_, _ = s.AppendEvent(ctx, ManagedEventInput{
		SessionID:  session.ID,
		ThreadID:   thread.ID,
		ActorType:  "member",
		ActorID:    userID,
		EventType:  "user.interrupt",
		Payload:    map[string]any{"reason": reason},
		Visibility: "workspace",
	})
	return cancelled, nil
}

// CancelOpenForIssue terminates every non-terminal Session attached to an
// executable work item. It is used when the work item itself reaches a
// terminal state; pending approvals are invalidated with the Session.
func (s *ManagedSessionService) CancelOpenForIssue(ctx context.Context, issueID pgtype.UUID, reason string) ([]db.AgentTaskQueue, error) {
	if s == nil || s.Queries == nil || !issueID.Valid {
		return nil, nil
	}
	sessions, err := s.Queries.ListOpenAgentSessionsByIssue(ctx, issueID)
	if err != nil {
		return nil, err
	}
	var cancelled []db.AgentTaskQueue
	for _, session := range sessions {
		tasks, cancelErr := s.cancelSession(ctx, session, reason)
		if cancelErr != nil {
			return cancelled, cancelErr
		}
		cancelled = append(cancelled, tasks...)
	}
	return cancelled, nil
}

// CancelSupersededExecutorsForIssue stops only ownership-bearing Sessions
// whose entry actor no longer matches the work item's assignee. Advisor and
// reviewer Sessions are deliberately preserved so a handoff cannot erase
// independent collaboration or mention work.
func (s *ManagedSessionService) CancelSupersededExecutorsForIssue(ctx context.Context, issueID pgtype.UUID, assigneeType string, assigneeID pgtype.UUID, reason string) ([]db.AgentTaskQueue, error) {
	if s == nil || s.Queries == nil || !issueID.Valid {
		return nil, nil
	}
	sessions, err := s.Queries.ListOpenAgentSessionsByIssue(ctx, issueID)
	if err != nil {
		return nil, err
	}
	var cancelled []db.AgentTaskQueue
	for _, session := range sessions {
		if session.Mode != SessionModeExecutor && session.Mode != SessionModeCoordinator {
			continue
		}
		keep := managedSessionMatchesAssignee(session, assigneeType, assigneeID)
		if keep {
			continue
		}
		tasks, cancelErr := s.cancelSession(ctx, session, reason)
		if cancelErr != nil {
			return cancelled, cancelErr
		}
		cancelled = append(cancelled, tasks...)
	}
	return cancelled, nil
}

func managedSessionMatchesAssignee(session db.AgentSession, assigneeType string, assigneeID pgtype.UUID) bool {
	return assigneeID.Valid && ((assigneeType == "agent" && session.EntryAgentID == assigneeID) ||
		(assigneeType == "squad" && session.EntrySquadID == assigneeID))
}

func (s *ManagedSessionService) cancelSession(ctx context.Context, session db.AgentSession, reason string) ([]db.AgentTaskQueue, error) {
	if strings.TrimSpace(reason) == "" {
		reason = "session cancelled"
	}
	cancelled, err := s.Queries.CancelActiveTasksByAgentSession(ctx, db.CancelActiveTasksByAgentSessionParams{
		CancelReason:   pgtype.Text{String: reason, Valid: true},
		AgentSessionID: session.ID,
	})
	if err != nil {
		return nil, err
	}
	_, _ = s.Queries.CancelPendingSessionApprovals(ctx, session.ID)
	_, err = s.Queries.CancelOpenAgentSessionThreads(ctx, db.CancelOpenAgentSessionThreadsParams{
		StopReason:     pgtype.Text{String: reason, Valid: true},
		AgentSessionID: session.ID,
	})
	if err != nil {
		return cancelled, err
	}
	thread, _ := s.Queries.GetPrimaryAgentSessionThread(ctx, session.ID)
	if _, err = s.Transition(ctx, session.ID, SessionStatusCancelled, reason, thread.ID, pgtype.UUID{}); err != nil {
		return cancelled, err
	}
	return cancelled, nil
}

func (s *ManagedSessionService) DefineOutcome(ctx context.Context, session db.AgentSession, userID pgtype.UUID, rubric string) (db.SessionOutcome, error) {
	rubric = strings.TrimSpace(rubric)
	if rubric == "" {
		return db.SessionOutcome{}, errors.New("outcome rubric is required")
	}
	outcome, err := s.Queries.UpsertSessionOutcome(ctx, db.UpsertSessionOutcomeParams{
		AgentSessionID: session.ID,
		RubricMarkdown: rubric,
		MaxIterations:  session.MaxIterations,
		CreatedBy:      userID,
	})
	if err != nil {
		return db.SessionOutcome{}, err
	}
	_, _ = s.AppendEvent(ctx, ManagedEventInput{
		SessionID:  session.ID,
		ActorType:  "member",
		ActorID:    userID,
		EventType:  "user.define_outcome",
		Payload:    map[string]any{"rubric": rubric},
		Visibility: "workspace",
	})
	return outcome, nil
}

type PermissionDecision string

const (
	PermissionAllow PermissionDecision = "allow"
	PermissionAsk   PermissionDecision = "ask"
	PermissionDeny  PermissionDecision = "deny"
)

func DefaultSessionPermissionPolicy(mode string) map[string]PermissionDecision {
	base := map[string]PermissionDecision{
		"workspace.read":             PermissionAllow,
		"workspace.write":            PermissionAsk,
		"workspace.batch_write":      PermissionDeny,
		"workspace.batch_delete":     PermissionDeny,
		"filesystem.workdir.read":    PermissionAllow,
		"filesystem.workdir.write":   PermissionAllow,
		"issue.comment":              PermissionAllow,
		"issue.status.own":           PermissionAllow,
		"issue.status.review":        PermissionDeny,
		"issue.status.finalize":      PermissionDeny,
		"filesystem.outside_workdir": PermissionDeny,
		"credentials.read":           PermissionDeny,
		"external.write":             PermissionAsk,
		"publish":                    PermissionAsk,
		"invite":                     PermissionAsk,
		"delete":                     PermissionAsk,
		"billing":                    PermissionAsk,
		"issue.assignee":             PermissionAsk,
		"issue.create":               PermissionAsk,
	}
	if mode == SessionModeAdvisor || mode == SessionModeReviewer {
		for _, action := range []string{
			"workspace.write", "filesystem.workdir.write", "issue.status.own", "issue.status.review",
			"external.write", "publish", "invite", "delete", "billing",
			"issue.assignee", "issue.create",
		} {
			base[action] = PermissionDeny
		}
	}
	return base
}

func DefaultSquadWorkerPermissionPolicy() map[string]PermissionDecision {
	policy := DefaultSessionPermissionPolicy(SessionModeExecutor)
	policy["issue.status.own"] = PermissionDeny
	policy["issue.assignee"] = PermissionDeny
	policy["issue.create"] = PermissionDeny
	return policy
}

func PermissionDecisionForAction(policy map[string]PermissionDecision, action string) PermissionDecision {
	if decision, ok := policy[action]; ok {
		return decision
	}
	parts := strings.Split(action, ".")
	for len(parts) > 1 {
		parts = parts[:len(parts)-1]
		if decision, ok := policy[strings.Join(parts, ".")]; ok {
			return decision
		}
	}
	return PermissionDeny
}

func (s *ManagedSessionService) RequestApproval(ctx context.Context, session db.AgentSession, thread db.AgentSessionThread, action, title, risk string, details any) (db.SessionApproval, error) {
	safeDetails := sanitizeManagedPayload(details)
	detailsJSON, _ := json.Marshal(safeDetails)
	if risk == "" {
		risk = "high"
	}
	approval, err := s.Queries.CreateSessionApproval(ctx, db.CreateSessionApprovalParams{
		AgentSessionID:       session.ID,
		ThreadID:             thread.ID,
		ActionNamespace:      action,
		OperationFingerprint: ManagedOperationFingerprint(action, safeDetails),
		Title:                title,
		Details:              detailsJSON,
		RiskLevel:            risk,
		RequestedByAgentID:   thread.AgentID,
		ExpiresAt:            pgtype.Timestamptz{Time: time.Now().Add(30 * time.Minute), Valid: true},
	})
	if err != nil {
		return db.SessionApproval{}, err
	}
	_, _ = s.Transition(ctx, session.ID, SessionStatusWaitingApproval, title, thread.ID, pgtype.UUID{})
	_, _ = s.AppendEvent(ctx, ManagedEventInput{
		SessionID:  session.ID,
		ThreadID:   thread.ID,
		ActorType:  "agent",
		ActorID:    thread.AgentID,
		EventType:  "approval.requested",
		Payload:    map[string]any{"approval_id": util.UUIDToString(approval.ID), "title": title, "action_namespace": action, "risk_level": risk},
		Visibility: "workspace",
	})
	s.NotifyAction(ctx, session, thread.AgentID, "session_approval", title, "An Agent is waiting for your one-time approval.", "approval:"+util.UUIDToString(approval.ID), map[string]any{
		"approval_id": util.UUIDToString(approval.ID),
		"action":      action,
		"risk_level":  risk,
	})
	return approval, nil
}

func (s *ManagedSessionService) NotifyAction(ctx context.Context, session db.AgentSession, actorID pgtype.UUID, itemType, title, body, keySuffix string, extra map[string]any) {
	if s == nil || s.Queries == nil || !session.CreatedBy.Valid || !session.IssueID.Valid {
		return
	}
	details := map[string]any{
		"managed_key":      util.UUIDToString(session.ID) + ":" + keySuffix,
		"agent_session_id": util.UUIDToString(session.ID),
		"mode":             session.Mode,
		"status":           session.Status,
	}
	for key, value := range extra {
		details[key] = value
	}
	detailsJSON, _ := json.Marshal(details)
	item, err := s.Queries.CreateInboxItem(ctx, db.CreateInboxItemParams{
		WorkspaceID:   session.WorkspaceID,
		RecipientType: "member",
		RecipientID:   session.CreatedBy,
		Type:          itemType,
		Severity:      "action_required",
		IssueID:       session.IssueID,
		TargetType:    pgtype.Text{String: "issue", Valid: true},
		TargetID:      session.IssueID,
		Title:         title,
		Body:          pgtype.Text{String: body, Valid: strings.TrimSpace(body) != ""},
		ActorType:     pgtype.Text{String: "agent", Valid: actorID.Valid},
		ActorID:       actorID,
		Details:       detailsJSON,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return
		}
		return
	}
	if s.Bus == nil {
		return
	}
	s.Bus.Publish(events.Event{
		Type:        protocol.EventInboxNew,
		WorkspaceID: util.UUIDToString(session.WorkspaceID),
		ActorType:   "agent",
		ActorID:     util.UUIDToString(actorID),
		Payload: map[string]any{"item": map[string]any{
			"id": util.UUIDToString(item.ID), "workspace_id": util.UUIDToString(item.WorkspaceID),
			"recipient_type": item.RecipientType, "recipient_id": util.UUIDToString(item.RecipientID),
			"type": item.Type, "severity": item.Severity, "issue_id": util.UUIDToPtr(item.IssueID),
			"target_type": util.TextToPtr(item.TargetType), "target_id": util.UUIDToPtr(item.TargetID),
			"title": item.Title, "body": util.TextToPtr(item.Body), "read": item.Read, "archived": item.Archived,
			"created_at": util.TimestampToString(item.CreatedAt), "actor_type": util.TextToPtr(item.ActorType),
			"actor_id": util.UUIDToPtr(item.ActorID), "details": json.RawMessage(item.Details),
		}},
	})
}

func ManagedOperationFingerprint(action string, details any) string {
	canonical, _ := json.Marshal(map[string]any{"action": action, "details": sanitizeManagedPayload(details)})
	sum := sha256.Sum256(canonical)
	return hex.EncodeToString(sum[:])
}

func (s *ManagedSessionService) DecideApproval(ctx context.Context, session db.AgentSession, approvalID, userID pgtype.UUID, approve bool, reason string) (db.SessionApproval, error) {
	status := "rejected"
	if approve {
		status = "approved"
	}
	approval, err := s.Queries.DecideSessionApproval(ctx, db.DecideSessionApprovalParams{
		Status:           status,
		ResolvedByUserID: userID,
		DecisionReason:   pgtype.Text{String: strings.TrimSpace(reason), Valid: strings.TrimSpace(reason) != ""},
		ID:               approvalID,
	})
	if err != nil {
		return db.SessionApproval{}, err
	}
	eventType := "approval.rejected"
	if approve {
		eventType = "approval.approved"
	}
	_, _ = s.AppendEvent(ctx, ManagedEventInput{
		SessionID:  session.ID,
		ThreadID:   approval.ThreadID,
		ActorType:  "member",
		ActorID:    userID,
		EventType:  eventType,
		Payload:    map[string]any{"approval_id": util.UUIDToString(approval.ID), "reason": reason},
		Visibility: "workspace",
	})
	next := SessionStatusQueued
	if !approve {
		next = SessionStatusWaitingInput
	}
	_, _ = s.Transition(ctx, session.ID, next, reason, approval.ThreadID, pgtype.UUID{})
	return approval, nil
}

func (s *ManagedSessionService) moveIssueToReview(ctx context.Context, task db.AgentTaskQueue) {
	if !task.IssueID.Valid {
		return
	}
	issue, err := s.Queries.GetIssue(ctx, task.IssueID)
	if err != nil || issue.IssueType == IssueTypeEpic || issue.Status == "done" || issue.Status == "cancelled" {
		return
	}
	if issue.Status != "in_review" {
		_, _ = s.Queries.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{
			ID:          issue.ID,
			Status:      "in_review",
			WorkspaceID: issue.WorkspaceID,
		})
	}
}

func (s *ManagedSessionService) runInTx(ctx context.Context, fn func(*db.Queries) error) error {
	if s.TxStarter == nil {
		return fn(s.Queries)
	}
	tx, err := s.TxStarter.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(s.Queries.WithTx(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func roleForSessionMode(mode string) string {
	switch mode {
	case SessionModeCoordinator:
		return "coordinator"
	case SessionModeAdvisor:
		return "advisor"
	case SessionModeReviewer:
		return "reviewer"
	case SessionModePlanning:
		return "planner"
	default:
		return "executor"
	}
}

func textValue(value pgtype.Text) any {
	if !value.Valid {
		return nil
	}
	return value.String
}

func sanitizeJSONBytes(raw []byte, fallback any) any {
	if len(raw) == 0 {
		return fallback
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return fallback
	}
	return sanitizeManagedPayload(value)
}

func sanitizeManagedPayload(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case string:
		return redact.Text(typed)
	case []byte:
		return redact.Text(string(typed))
	case bool,
		int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64,
		float32, float64,
		json.Number:
		return typed
	case []any:
		out := make([]any, len(typed))
		for i, item := range typed {
			out[i] = sanitizeManagedPayload(item)
		}
		return out
	case []string:
		out := make([]string, len(typed))
		for i, item := range typed {
			out[i] = redact.Text(item)
		}
		return out
	case map[string]string:
		out := make(map[string]any, len(typed))
		for key, item := range typed {
			out[key] = sanitizeManagedMapValue(key, item)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, item := range typed {
			out[key] = sanitizeManagedMapValue(key, item)
		}
		return out
	default:
		encoded, err := json.Marshal(value)
		if err != nil {
			return fmt.Sprint(value)
		}
		var generic any
		if json.Unmarshal(encoded, &generic) == nil {
			return sanitizeManagedPayload(generic)
		}
		return value
	}
}

var managedAbsolutePathPattern = regexp.MustCompile(`(?i)(?:/(?:Users|home|private|var|tmp)/[^\s"'<>\x60]+|[a-z]:\\Users\\[^\s"'<>\x60]+)`)

// sanitizeManagedEventPayload adds a stricter collaboration boundary on top
// of the general secret scrubber. Task messages retain their full redacted
// trace for the runtime owner, while the shared Session timeline never carries
// machine-specific absolute paths.
func sanitizeManagedEventPayload(value any) any {
	return redactManagedEventPaths(sanitizeManagedPayload(value))
}

func redactManagedEventPaths(value any) any {
	switch typed := value.(type) {
	case string:
		return managedAbsolutePathPattern.ReplaceAllString(typed, "[PRIVATE PATH]")
	case []string:
		out := make([]string, len(typed))
		for i, item := range typed {
			out[i] = managedAbsolutePathPattern.ReplaceAllString(item, "[PRIVATE PATH]")
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for i, item := range typed {
			out[i] = redactManagedEventPaths(item)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, item := range typed {
			out[key] = redactManagedEventPaths(item)
		}
		return out
	default:
		return value
	}
}

func sanitizeManagedMapValue(key string, value any) any {
	normalized := strings.ToLower(strings.ReplaceAll(key, "-", "_"))
	for _, secretKey := range []string{"token", "secret", "password", "credential", "authorization", "api_key", "private_key"} {
		if strings.Contains(normalized, secretKey) {
			return "[REDACTED]"
		}
	}
	for _, privateKey := range []string{"work_dir", "absolute_path", "command_args", "raw_output", "raw_input"} {
		if normalized == privateKey {
			return "[PRIVATE]"
		}
	}
	return sanitizeManagedPayload(value)
}

func managedTaskResultSummary(result []byte) map[string]any {
	var payload map[string]any
	if json.Unmarshal(result, &payload) != nil {
		return map[string]any{"summary": "Agent turn completed"}
	}
	for _, key := range []string{"output", "comment", "message", "summary"} {
		if value, ok := payload[key].(string); ok && strings.TrimSpace(value) != "" {
			runes := []rune(strings.TrimSpace(value))
			if len(runes) > 2000 {
				runes = append(runes[:2000], '…')
			}
			return map[string]any{"summary": redact.Text(string(runes))}
		}
	}
	return map[string]any{"summary": "Agent turn completed"}
}
