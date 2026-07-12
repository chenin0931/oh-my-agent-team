package handler

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/chenin0931/oh-my-agent-team/server/internal/logger"
	"github.com/chenin0931/oh-my-agent-team/server/internal/middleware"
	"github.com/chenin0931/oh-my-agent-team/server/internal/service"
	"github.com/chenin0931/oh-my-agent-team/server/internal/util"
	db "github.com/chenin0931/oh-my-agent-team/server/pkg/db/generated"
	"github.com/chenin0931/oh-my-agent-team/server/pkg/protocol"
)

var validEpicLifecycles = []string{"planned", "in_progress", "paused", "completed", "cancelled"}
var validEpicHealth = []string{"on_track", "at_risk", "off_track"}

// EpicResponse is intentionally planning-only. Epics share the issue table
// internally, but execution fields must never leak into this API contract.
type EpicResponse struct {
	ID                 string               `json:"id"`
	WorkspaceID        string               `json:"workspace_id"`
	ProjectID          string               `json:"project_id"`
	Number             int32                `json:"number"`
	Identifier         string               `json:"identifier"`
	Title              string               `json:"title"`
	Description        *string              `json:"description"`
	SuccessCriteria    *string              `json:"success_criteria"`
	Lifecycle          string               `json:"lifecycle"`
	Health             *string              `json:"health"`
	Priority           string               `json:"priority"`
	OwnerType          *string              `json:"owner_type"`
	OwnerID            *string              `json:"owner_id"`
	StartDate          *string              `json:"start_date"`
	TargetDate         *string              `json:"target_date"`
	CreatorType        string               `json:"creator_type"`
	CreatorID          string               `json:"creator_id"`
	TotalIssues        int64                `json:"total_issues"`
	DoneIssues         int64                `json:"done_issues"`
	BlockedIssues      int64                `json:"blocked_issues"`
	CompletionPercent  int                  `json:"completion_percent"`
	StatusDistribution map[string]int64     `json:"status_distribution"`
	CreatedAt          string               `json:"created_at"`
	UpdatedAt          string               `json:"updated_at"`
	Labels             *[]LabelResponse     `json:"labels,omitempty"`
	Attachments        []AttachmentResponse `json:"attachments,omitempty"`
}

func completionPercent(done, total int64) int {
	if total <= 0 {
		return 0
	}
	return int((done * 100) / total)
}

func epicToResponse(epic db.Issue, prefix string, total, done, blocked int64, distribution map[string]int64) EpicResponse {
	if distribution == nil {
		distribution = map[string]int64{}
	}
	return EpicResponse{
		ID:                 uuidToString(epic.ID),
		WorkspaceID:        uuidToString(epic.WorkspaceID),
		ProjectID:          uuidToString(epic.ProjectID),
		Number:             epic.Number,
		Identifier:         prefix + "-" + strconv.Itoa(int(epic.Number)),
		Title:              epic.Title,
		Description:        textToPtr(epic.Description),
		SuccessCriteria:    textToPtr(epic.AcceptanceCriteria),
		Lifecycle:          epic.Status,
		Health:             textToPtr(epic.EpicHealth),
		Priority:           epic.Priority,
		OwnerType:          textToPtr(epic.AssigneeType),
		OwnerID:            uuidToPtr(epic.AssigneeID),
		StartDate:          dateToPtr(epic.StartDate),
		TargetDate:         dateToPtr(epic.DueDate),
		CreatorType:        epic.CreatorType,
		CreatorID:          uuidToString(epic.CreatorID),
		TotalIssues:        total,
		DoneIssues:         done,
		BlockedIssues:      blocked,
		CompletionPercent:  completionPercent(done, total),
		StatusDistribution: distribution,
		CreatedAt:          timestampToString(epic.CreatedAt),
		UpdatedAt:          timestampToString(epic.UpdatedAt),
	}
}

func epicListRowToIssue(row db.ListEpicsRow) db.Issue {
	return db.Issue{
		ID: row.ID, WorkspaceID: row.WorkspaceID, Title: row.Title,
		Description: row.Description, Status: row.Status, Priority: row.Priority,
		AssigneeType: row.AssigneeType, AssigneeID: row.AssigneeID,
		CreatorType: row.CreatorType, CreatorID: row.CreatorID,
		ParentIssueID: row.ParentIssueID, ContextRefs: row.ContextRefs,
		Position: row.Position, DueDate: row.DueDate, CreatedAt: row.CreatedAt,
		UpdatedAt: row.UpdatedAt, Number: row.Number, ProjectID: row.ProjectID,
		OriginType: row.OriginType, OriginID: row.OriginID,
		FirstExecutedAt: row.FirstExecutedAt, StartDate: row.StartDate,
		Metadata: row.Metadata, Stage: row.Stage, IssueType: row.IssueType,
		EpicID: row.EpicID, AcceptanceCriteria: row.AcceptanceCriteria,
		EpicHealth: row.EpicHealth,
	}
}

func (h *Handler) loadEpicForUser(w http.ResponseWriter, r *http.Request, id string) (db.Issue, bool) {
	item, ok := h.loadIssueForUser(w, r, id)
	if !ok {
		return db.Issue{}, false
	}
	if defaultIssueType(item.IssueType) != service.IssueTypeEpic {
		writeError(w, http.StatusNotFound, "epic not found")
		return db.Issue{}, false
	}
	return item, true
}

func (h *Handler) epicMetrics(ctxRequest *http.Request, epic db.Issue) (int64, int64, int64, map[string]int64) {
	distribution := map[string]int64{}
	rows, err := h.Queries.GetEpicStatusDistribution(ctxRequest.Context(), db.GetEpicStatusDistributionParams{
		WorkspaceID: epic.WorkspaceID,
		EpicID:      epic.ID,
	})
	if err != nil {
		return 0, 0, 0, distribution
	}
	var total, done, blocked int64
	for _, row := range rows {
		distribution[row.Status] = row.Count
		total += row.Count
		switch row.Status {
		case "done":
			done += row.Count
		case "blocked":
			blocked += row.Count
		}
	}
	return total, done, blocked, distribution
}

func (h *Handler) ListEpics(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}

	limit := 50
	offset := 0
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if value, err := strconv.Atoi(raw); err == nil && value > 0 {
			limit = value
		}
	}
	if limit > 100 {
		limit = 100
	}
	if raw := r.URL.Query().Get("offset"); raw != "" {
		if value, err := strconv.Atoi(raw); err == nil && value >= 0 {
			offset = value
		}
	}

	var projectID pgtype.UUID
	if raw := r.URL.Query().Get("project_id"); raw != "" {
		projectID, ok = parseUUIDOrBadRequest(w, raw, "project_id")
		if !ok {
			return
		}
	}
	var ownerID pgtype.UUID
	if raw := r.URL.Query().Get("owner_id"); raw != "" {
		ownerID, ok = parseUUIDOrBadRequest(w, raw, "owner_id")
		if !ok {
			return
		}
	}
	var lifecycle pgtype.Text
	if raw := r.URL.Query().Get("lifecycle"); raw != "" {
		if !validateIssueEnum(w, "lifecycle", raw, validEpicLifecycles) {
			return
		}
		lifecycle = pgtype.Text{String: raw, Valid: true}
	}
	var search pgtype.Text
	if raw := strings.TrimSpace(r.URL.Query().Get("q")); raw != "" {
		search = pgtype.Text{String: raw, Valid: true}
	}

	params := db.ListEpicsParams{
		WorkspaceID: wsUUID, ProjectID: projectID, Lifecycle: lifecycle,
		OwnerID: ownerID, Search: search, RowLimit: int32(limit), RowOffset: int32(offset),
	}
	rows, err := h.Queries.ListEpics(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list epics")
		return
	}
	total, err := h.Queries.CountEpics(r.Context(), db.CountEpicsParams{
		WorkspaceID: wsUUID, ProjectID: projectID, Lifecycle: lifecycle, OwnerID: ownerID, Search: search,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to count epics")
		return
	}

	ids := make([]pgtype.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	labelsByID := h.labelsByIssue(r.Context(), wsUUID, ids)
	prefix := h.getIssuePrefix(r.Context(), wsUUID)
	epics := make([]EpicResponse, 0, len(rows))
	for _, row := range rows {
		distribution, distErr := h.Queries.GetEpicStatusDistribution(r.Context(), db.GetEpicStatusDistributionParams{WorkspaceID: wsUUID, EpicID: row.ID})
		dist := map[string]int64{}
		if distErr == nil {
			for _, item := range distribution {
				dist[item.Status] = item.Count
			}
		}
		resp := epicToResponse(epicListRowToIssue(row), prefix, row.TotalIssues, row.DoneIssues, row.BlockedIssues, dist)
		labels := labelsByID[resp.ID]
		if labels == nil {
			labels = []LabelResponse{}
		}
		resp.Labels = &labels
		epics = append(epics, resp)
	}
	w.Header().Set("X-Total-Count", strconv.FormatInt(total, 10))
	writeJSON(w, http.StatusOK, map[string]any{"epics": epics, "total": total})
}

func (h *Handler) SearchEpics(w http.ResponseWriter, r *http.Request) {
	if strings.TrimSpace(r.URL.Query().Get("q")) == "" {
		writeError(w, http.StatusBadRequest, "q parameter is required")
		return
	}
	h.ListEpics(w, r)
}

func (h *Handler) GetEpic(w http.ResponseWriter, r *http.Request) {
	epic, ok := h.loadEpicForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	total, done, blocked, distribution := h.epicMetrics(r, epic)
	resp := epicToResponse(epic, h.getIssuePrefix(r.Context(), epic.WorkspaceID), total, done, blocked, distribution)
	labels := h.labelsByIssue(r.Context(), epic.WorkspaceID, []pgtype.UUID{epic.ID})[resp.ID]
	if labels == nil {
		labels = []LabelResponse{}
	}
	resp.Labels = &labels
	attachments, err := h.Queries.ListAttachmentsByIssue(r.Context(), db.ListAttachmentsByIssueParams{
		IssueID: epic.ID, WorkspaceID: epic.WorkspaceID,
	})
	if err == nil {
		resp.Attachments = make([]AttachmentResponse, len(attachments))
		for i, attachment := range attachments {
			resp.Attachments[i] = h.attachmentToResponse(attachment)
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

type CreateEpicRequest struct {
	Title           string   `json:"title"`
	Description     *string  `json:"description"`
	SuccessCriteria *string  `json:"success_criteria"`
	Lifecycle       string   `json:"lifecycle,omitempty"`
	Health          *string  `json:"health"`
	Priority        string   `json:"priority,omitempty"`
	OwnerType       *string  `json:"owner_type"`
	OwnerID         *string  `json:"owner_id"`
	ProjectID       string   `json:"project_id"`
	StartDate       *string  `json:"start_date"`
	TargetDate      *string  `json:"target_date"`
	AttachmentIDs   []string `json:"attachment_ids,omitempty"`
	OriginType      *string  `json:"origin_type,omitempty"`
	OriginID        *string  `json:"origin_id,omitempty"`
	AllowDuplicate  bool     `json:"allow_duplicate,omitempty"`
}

func (h *Handler) validateEpicOwnerPair(w http.ResponseWriter, r *http.Request, workspaceID string, ownerType pgtype.Text, ownerID pgtype.UUID) bool {
	if ownerType.Valid && ownerType.String == "squad" {
		writeError(w, http.StatusBadRequest, "epic owner must be a member or agent; squads execute work items, not planning containers")
		return false
	}
	if status, message := h.validateAssigneePair(r.Context(), r, workspaceID, ownerType, ownerID); status != 0 {
		writeError(w, status, message)
		return false
	}
	return true
}

func parseEpicDate(w http.ResponseWriter, raw *string, field string) (pgtype.Date, bool) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return pgtype.Date{}, true
	}
	date, err := util.ParseCalendarDate(*raw)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid "+field+" format, expected YYYY-MM-DD")
		return pgtype.Date{}, false
	}
	return date, true
}

func (h *Handler) CreateEpic(w http.ResponseWriter, r *http.Request) {
	var req CreateEpicRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	if req.ProjectID == "" {
		writeError(w, http.StatusBadRequest, "project_id is required")
		return
	}
	if req.Lifecycle != "" && req.Lifecycle != "planned" {
		writeError(w, http.StatusBadRequest, "new epics must start in planned")
		return
	}

	workspaceID := h.resolveWorkspaceID(r)
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}
	projectID, ok := parseUUIDOrBadRequest(w, req.ProjectID, "project_id")
	if !ok {
		return
	}
	creatorID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	if h.rejectMemberAssigneeAdvisorMutation(w, r, pgtype.UUID{}, false) {
		return
	}

	priority := req.Priority
	if priority == "" {
		priority = "none"
	}
	if !validateIssueEnum(w, "priority", priority, validIssuePriorities) {
		return
	}
	var health pgtype.Text
	if req.Health != nil && strings.TrimSpace(*req.Health) != "" {
		if !validateIssueEnum(w, "health", *req.Health, validEpicHealth) {
			return
		}
		health = pgtype.Text{String: *req.Health, Valid: true}
	}

	var ownerType pgtype.Text
	var ownerID pgtype.UUID
	if req.OwnerType != nil {
		ownerType = pgtype.Text{String: *req.OwnerType, Valid: *req.OwnerType != ""}
	}
	if req.OwnerID != nil && *req.OwnerID != "" {
		ownerID, ok = parseUUIDOrBadRequest(w, *req.OwnerID, "owner_id")
		if !ok {
			return
		}
	}
	if !h.validateEpicOwnerPair(w, r, workspaceID, ownerType, ownerID) {
		return
	}

	startDate, ok := parseEpicDate(w, req.StartDate, "start_date")
	if !ok {
		return
	}
	targetDate, ok := parseEpicDate(w, req.TargetDate, "target_date")
	if !ok {
		return
	}
	attachmentIDs, ok := parseUUIDSliceOrBadRequest(w, req.AttachmentIDs, "attachment_ids")
	if !ok {
		return
	}

	var originType pgtype.Text
	var originID pgtype.UUID
	if req.OriginType != nil || req.OriginID != nil {
		if req.OriginType == nil || req.OriginID == nil || *req.OriginType != "quick_create" {
			writeError(w, http.StatusBadRequest, "unsupported epic origin")
			return
		}
		originID, ok = parseUUIDOrBadRequest(w, *req.OriginID, "origin_id")
		if !ok {
			return
		}
		originType = pgtype.Text{String: *req.OriginType, Valid: true}
	}

	creatorType, actualCreatorID := h.resolveActor(r, creatorID, workspaceID)
	prefix := h.getIssuePrefix(r.Context(), wsUUID)
	res, err := h.IssueService.Create(r.Context(), service.IssueCreateParams{
		WorkspaceID: wsUUID, IssueType: service.IssueTypeEpic,
		Title: req.Title, Description: ptrToText(req.Description),
		AcceptanceCriteria: ptrToText(req.SuccessCriteria), EpicHealth: health,
		Status: "planned", Priority: priority, AssigneeType: ownerType,
		AssigneeID: ownerID, CreatorType: creatorType, CreatorID: parseUUID(actualCreatorID),
		ProjectID: projectID, StartDate: startDate, DueDate: targetDate,
		OriginType: originType, OriginID: originID, AttachmentIDs: attachmentIDs,
		AllowDuplicate: req.AllowDuplicate,
	}, service.IssueCreateOpts{
		ActorID:  actualCreatorID,
		Platform: func() string { platform, _, _ := middleware.ClientMetadataFromContext(r.Context()); return platform }(),
		BroadcastPayload: func(item db.Issue, _ []db.Attachment) map[string]any {
			return map[string]any{"epic": epicToResponse(item, prefix, 0, 0, 0, nil)}
		},
	})
	if errors.Is(err, service.ErrProjectNotFound) {
		writeError(w, http.StatusBadRequest, "project not found in this workspace")
		return
	}
	if errors.Is(err, service.ErrActiveDuplicate) {
		duplicate := epicToResponse(*res.DuplicateIssue, prefix, 0, 0, 0, nil)
		writeJSON(w, http.StatusConflict, map[string]any{"code": "active_duplicate_epic", "epic": duplicate})
		return
	}
	if err != nil {
		slog.Warn("create epic failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create epic")
		return
	}
	resp := epicToResponse(res.Issue, prefix, 0, 0, 0, nil)
	if len(res.Attachments) > 0 {
		resp.Attachments = make([]AttachmentResponse, len(res.Attachments))
		for i, attachment := range res.Attachments {
			resp.Attachments[i] = h.attachmentToResponse(attachment)
		}
	}
	writeJSON(w, http.StatusCreated, resp)
}

type UpdateEpicRequest struct {
	Title           *string `json:"title"`
	Description     *string `json:"description"`
	SuccessCriteria *string `json:"success_criteria"`
	Lifecycle       *string `json:"lifecycle"`
	Health          *string `json:"health"`
	Priority        *string `json:"priority"`
	OwnerType       *string `json:"owner_type"`
	OwnerID         *string `json:"owner_id"`
	ProjectID       *string `json:"project_id"`
	StartDate       *string `json:"start_date"`
	TargetDate      *string `json:"target_date"`
}

func rawFieldPresent(fields map[string]json.RawMessage, name string) bool {
	_, ok := fields[name]
	return ok
}

func (h *Handler) UpdateEpic(w http.ResponseWriter, r *http.Request) {
	previous, ok := h.loadEpicForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	if h.rejectMemberAssigneeAdvisorMutation(w, r, previous.ID, false) {
		return
	}
	body, err := javaScriptSafeReadAll(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read request body")
		return
	}
	var req UpdateEpicRequest
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &req); err != nil || json.Unmarshal(body, &fields) != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	title := previous.Title
	if rawFieldPresent(fields, "title") {
		if req.Title == nil || strings.TrimSpace(*req.Title) == "" {
			writeError(w, http.StatusBadRequest, "title is required")
			return
		}
		title = strings.TrimSpace(*req.Title)
	}
	description := previous.Description
	if rawFieldPresent(fields, "description") {
		description = ptrToText(req.Description)
	}
	successCriteria := previous.AcceptanceCriteria
	if rawFieldPresent(fields, "success_criteria") {
		successCriteria = ptrToText(req.SuccessCriteria)
	}
	lifecycle := previous.Status
	if rawFieldPresent(fields, "lifecycle") {
		if req.Lifecycle == nil || !validateIssueEnum(w, "lifecycle", *req.Lifecycle, validEpicLifecycles) {
			return
		}
		lifecycle = *req.Lifecycle
	}
	health := previous.EpicHealth
	if rawFieldPresent(fields, "health") {
		health = pgtype.Text{}
		if req.Health != nil && strings.TrimSpace(*req.Health) != "" {
			if !validateIssueEnum(w, "health", *req.Health, validEpicHealth) {
				return
			}
			health = pgtype.Text{String: *req.Health, Valid: true}
		}
	}
	priority := previous.Priority
	if rawFieldPresent(fields, "priority") {
		if req.Priority == nil || !validateIssueEnum(w, "priority", *req.Priority, validIssuePriorities) {
			return
		}
		priority = *req.Priority
	}

	ownerType := previous.AssigneeType
	ownerID := previous.AssigneeID
	ownerTypeTouched := rawFieldPresent(fields, "owner_type")
	ownerIDTouched := rawFieldPresent(fields, "owner_id")
	if ownerTypeTouched != ownerIDTouched {
		writeError(w, http.StatusBadRequest, "owner_type and owner_id must be updated together")
		return
	}
	if ownerTypeTouched {
		ownerType = pgtype.Text{}
		ownerID = pgtype.UUID{}
		if req.OwnerType != nil || req.OwnerID != nil {
			if req.OwnerType == nil || req.OwnerID == nil || *req.OwnerType == "" || *req.OwnerID == "" {
				writeError(w, http.StatusBadRequest, "owner_type and owner_id must be provided together")
				return
			}
			ownerType = pgtype.Text{String: *req.OwnerType, Valid: true}
			ownerID, ok = parseUUIDOrBadRequest(w, *req.OwnerID, "owner_id")
			if !ok {
				return
			}
		}
		if !h.validateEpicOwnerPair(w, r, uuidToString(previous.WorkspaceID), ownerType, ownerID) {
			return
		}
	}

	projectID := previous.ProjectID
	if rawFieldPresent(fields, "project_id") {
		if req.ProjectID == nil || *req.ProjectID == "" {
			writeError(w, http.StatusBadRequest, "project_id is required")
			return
		}
		projectID, ok = parseUUIDOrBadRequest(w, *req.ProjectID, "project_id")
		if !ok {
			return
		}
		if _, err := h.Queries.GetProjectInWorkspace(r.Context(), db.GetProjectInWorkspaceParams{ID: projectID, WorkspaceID: previous.WorkspaceID}); err != nil {
			writeError(w, http.StatusBadRequest, "project not found in this workspace")
			return
		}
	}
	startDate := previous.StartDate
	if rawFieldPresent(fields, "start_date") {
		startDate, ok = parseEpicDate(w, req.StartDate, "start_date")
		if !ok {
			return
		}
	}
	targetDate := previous.DueDate
	if rawFieldPresent(fields, "target_date") {
		targetDate, ok = parseEpicDate(w, req.TargetDate, "target_date")
		if !ok {
			return
		}
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update epic")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)
	updated, err := qtx.UpdateEpic(r.Context(), db.UpdateEpicParams{
		Title: title, Description: description, SuccessCriteria: successCriteria,
		Lifecycle: lifecycle, Health: health, Priority: priority,
		OwnerType: ownerType, OwnerID: ownerID, ProjectID: projectID,
		StartDate: startDate, TargetDate: targetDate,
		ID: previous.ID, WorkspaceID: previous.WorkspaceID,
	})
	if err == nil && projectID != previous.ProjectID {
		err = qtx.MoveEpicWorkItemsToProject(r.Context(), db.MoveEpicWorkItemsToProjectParams{
			ProjectID: projectID, WorkspaceID: previous.WorkspaceID, EpicID: previous.ID,
		})
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		writeError(w, http.StatusInternalServerError, "failed to update epic")
		return
	}

	total, done, blocked, distribution := h.epicMetrics(r, updated)
	resp := epicToResponse(updated, h.getIssuePrefix(r.Context(), updated.WorkspaceID), total, done, blocked, distribution)
	userID := requestUserID(r)
	actorType, actorID := h.resolveActor(r, userID, uuidToString(updated.WorkspaceID))
	h.publish(protocol.EventEpicUpdated, uuidToString(updated.WorkspaceID), actorType, actorID, map[string]any{
		"epic":                     resp,
		"owner_changed":            previous.AssigneeType != updated.AssigneeType || previous.AssigneeID != updated.AssigneeID,
		"lifecycle_changed":        previous.Status != updated.Status,
		"project_changed":          previous.ProjectID != updated.ProjectID,
		"health_changed":           previous.EpicHealth != updated.EpicHealth,
		"title_changed":            previous.Title != updated.Title,
		"description_changed":      previous.Description != updated.Description,
		"success_criteria_changed": previous.AcceptanceCriteria != updated.AcceptanceCriteria,
		"priority_changed":         previous.Priority != updated.Priority,
		"start_date_changed":       previous.StartDate != updated.StartDate,
		"target_date_changed":      previous.DueDate != updated.DueDate,
		"prev_lifecycle":           previous.Status,
		"prev_health":              textToPtr(previous.EpicHealth),
		"prev_owner_type":          textToPtr(previous.AssigneeType),
		"prev_owner_id":            uuidToPtr(previous.AssigneeID),
		"prev_project_id":          uuidToString(previous.ProjectID),
		"prev_title":               previous.Title,
		"prev_priority":            previous.Priority,
		"prev_start_date":          dateToPtr(previous.StartDate),
		"prev_target_date":         dateToPtr(previous.DueDate),
	})
	if previous.ProjectID != updated.ProjectID {
		items, listErr := h.Queries.ListEpicWorkItems(r.Context(), db.ListEpicWorkItemsParams{
			WorkspaceID: updated.WorkspaceID,
			EpicID:      updated.ID,
		})
		if listErr != nil {
			slog.Warn("list moved epic work items for broadcast failed", "epic_id", uuidToString(updated.ID), "error", listErr)
		} else {
			h.publishEpicWorkItemUpdates(r, updated.WorkspaceID, items, actorType, actorID, false, true)
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

// javaScriptSafeReadAll keeps handler request-body reads bounded to the same
// practical size as JSON decoder use while preserving explicit null fields.
func javaScriptSafeReadAll(r *http.Request) ([]byte, error) {
	return io.ReadAll(io.LimitReader(r.Body, 2<<20))
}

func (h *Handler) DeleteEpic(w http.ResponseWriter, r *http.Request) {
	epic, ok := h.loadEpicForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	if h.rejectMemberAssigneeAdvisorMutation(w, r, epic.ID, false) {
		return
	}
	workItems, _ := h.Queries.ListEpicWorkItems(r.Context(), db.ListEpicWorkItemsParams{
		WorkspaceID: epic.WorkspaceID,
		EpicID:      epic.ID,
	})
	attachmentURLs, _ := h.Queries.ListAttachmentURLsByIssueOrComments(r.Context(), epic.ID)
	h.TaskService.CancelTasksForIssue(r.Context(), epic.ID)
	if err := h.Queries.DeleteEpic(r.Context(), db.DeleteEpicParams{EpicID: epic.ID, WorkspaceID: epic.WorkspaceID}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete epic")
		return
	}
	h.deleteS3Objects(r.Context(), attachmentURLs)
	userID := requestUserID(r)
	actorType, actorID := h.resolveActor(r, userID, uuidToString(epic.WorkspaceID))
	h.publishEpicWorkItemUpdates(r, epic.WorkspaceID, workItems, actorType, actorID, true, false)
	h.publish(protocol.EventEpicDeleted, uuidToString(epic.WorkspaceID), actorType, actorID, map[string]any{"epic_id": uuidToString(epic.ID)})
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) publishEpicWorkItemUpdates(
	r *http.Request,
	workspaceID pgtype.UUID,
	items []db.Issue,
	actorType, actorID string,
	epicChanged, projectChanged bool,
) {
	if len(items) == 0 {
		return
	}
	fresh := make([]db.Issue, 0, len(items))
	ids := make([]pgtype.UUID, 0, len(items))
	for _, item := range items {
		reloaded, err := h.Queries.GetIssueInWorkspace(r.Context(), db.GetIssueInWorkspaceParams{
			ID: item.ID, WorkspaceID: workspaceID,
		})
		if err != nil {
			continue
		}
		fresh = append(fresh, reloaded)
		ids = append(ids, reloaded.ID)
	}
	labelsByID := h.labelsByIssue(r.Context(), workspaceID, ids)
	prefix := h.getIssuePrefix(r.Context(), workspaceID)
	for _, item := range fresh {
		response := issueToResponse(item, prefix)
		labels := labelsByID[response.ID]
		if labels == nil {
			labels = []LabelResponse{}
		}
		response.Labels = &labels
		h.publish(protocol.EventIssueUpdated, uuidToString(workspaceID), actorType, actorID, map[string]any{
			"issue": response, "epic_changed": epicChanged, "project_changed": projectChanged,
		})
	}
}

func (h *Handler) ListEpicWorkItems(w http.ResponseWriter, r *http.Request) {
	epic, ok := h.loadEpicForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	items, err := h.Queries.ListEpicWorkItems(r.Context(), db.ListEpicWorkItemsParams{WorkspaceID: epic.WorkspaceID, EpicID: epic.ID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list epic work items")
		return
	}
	ids := make([]pgtype.UUID, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID)
	}
	labelsByID := h.labelsByIssue(r.Context(), epic.WorkspaceID, ids)
	prefix := h.getIssuePrefix(r.Context(), epic.WorkspaceID)
	response := make([]IssueResponse, 0, len(items))
	for _, item := range items {
		entry := issueToResponse(item, prefix)
		labels := labelsByID[entry.ID]
		if labels == nil {
			labels = []LabelResponse{}
		}
		entry.Labels = &labels
		response = append(response, entry)
	}
	writeJSON(w, http.StatusOK, map[string]any{"issues": response})
}

func (h *Handler) publishEpicWorkItemChange(r *http.Request, epic db.Issue, issueID pgtype.UUID) (IssueResponse, error) {
	updated, err := h.Queries.GetIssueInWorkspace(r.Context(), db.GetIssueInWorkspaceParams{
		ID: issueID, WorkspaceID: epic.WorkspaceID,
	})
	if err != nil {
		return IssueResponse{}, err
	}
	workspaceID := uuidToString(epic.WorkspaceID)
	actorType, actorID := h.resolveActor(r, requestUserID(r), workspaceID)
	prefix := h.getIssuePrefix(r.Context(), epic.WorkspaceID)
	publishIssue := func(item db.Issue) IssueResponse {
		response := issueToResponse(item, prefix)
		h.publish(protocol.EventIssueUpdated, workspaceID, actorType, actorID, map[string]any{
			"issue": response, "epic_changed": true, "project_changed": true,
		})
		return response
	}
	response := publishIssue(updated)
	if children, childErr := h.Queries.ListChildIssues(r.Context(), updated.ID); childErr == nil {
		for _, child := range children {
			publishIssue(child)
		}
	}
	total, done, blocked, distribution := h.epicMetrics(r, epic)
	h.publish(protocol.EventEpicUpdated, workspaceID, actorType, actorID, map[string]any{
		"epic":               epicToResponse(epic, prefix, total, done, blocked, distribution),
		"work_items_changed": true,
	})
	return response, nil
}

func (h *Handler) AttachEpicWorkItem(w http.ResponseWriter, r *http.Request) {
	epic, ok := h.loadEpicForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	if h.rejectMemberAssigneeAdvisorMutation(w, r, epic.ID, false) {
		return
	}
	item, ok := h.loadExecutableIssueForUser(w, r, chi.URLParam(r, "issueId"))
	if !ok {
		return
	}
	if defaultIssueType(item.IssueType) != service.IssueTypeIssue {
		writeError(w, http.StatusBadRequest, "only top-level issues can be attached to an epic")
		return
	}
	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to attach issue")
		return
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), `UPDATE issue SET epic_id = $1, project_id = $2, updated_at = now() WHERE id = $3 AND workspace_id = $4 AND issue_type = 'issue'`, epic.ID, epic.ProjectID, item.ID, epic.WorkspaceID); err == nil {
		_, err = tx.Exec(r.Context(), `UPDATE issue SET epic_id = $1, project_id = $2, updated_at = now() WHERE parent_issue_id = $3 AND workspace_id = $4 AND issue_type = 'subtask'`, epic.ID, epic.ProjectID, item.ID, epic.WorkspaceID)
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		writeError(w, http.StatusInternalServerError, "failed to attach issue")
		return
	}
	response, err := h.publishEpicWorkItemChange(r, epic, item.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload attached issue")
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (h *Handler) DetachEpicWorkItem(w http.ResponseWriter, r *http.Request) {
	epic, ok := h.loadEpicForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	if h.rejectMemberAssigneeAdvisorMutation(w, r, epic.ID, false) {
		return
	}
	item, ok := h.loadExecutableIssueForUser(w, r, chi.URLParam(r, "issueId"))
	if !ok {
		return
	}
	if defaultIssueType(item.IssueType) != service.IssueTypeIssue || item.EpicID != epic.ID {
		writeError(w, http.StatusBadRequest, "issue does not belong to this epic")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `UPDATE issue SET epic_id = NULL, updated_at = now() WHERE workspace_id = $1 AND (id = $2 OR parent_issue_id = $2)`, epic.WorkspaceID, item.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to detach issue")
		return
	}
	if _, err := h.publishEpicWorkItemChange(r, epic, item.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload detached issue")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type epicAdvisorRequest struct {
	AgentID string `json:"agent_id"`
	Prompt  string `json:"prompt,omitempty"`
}

func (h *Handler) RunEpicAdvisorAction(w http.ResponseWriter, r *http.Request) {
	epic, ok := h.loadEpicForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	actorType, _ := h.resolveActor(r, userID, uuidToString(epic.WorkspaceID))
	if actorType != "member" {
		writeError(w, http.StatusForbidden, "epic advisors must be started by a human member")
		return
	}
	var req epicAdvisorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	agentID, ok := h.resolveIssueAdvisorAgent(w, r, epic, req.AgentID, userID)
	if !ok {
		return
	}
	originatorID, err := util.ParseUUID(userID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "user not authenticated")
		return
	}
	instruction := strings.TrimSpace(req.Prompt)
	if instruction == "" {
		instruction = "Analyze this epic's goal, success criteria, child work items, progress, and risks. Leave one concrete planning recommendation."
	}
	task, err := h.TaskService.EnqueueEpicAdvisor(r.Context(), epic, agentID, originatorID, instruction)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{
		"action": "analyze", "queued": true, "collaboration_role": service.TaskCollaborationRoleAdvisor,
		"task": taskToResponse(task, uuidToString(epic.WorkspaceID)),
	})
}
