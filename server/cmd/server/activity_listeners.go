package main

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/chenin0931/oh-my-agent-team/server/internal/events"
	"github.com/chenin0931/oh-my-agent-team/server/internal/handler"
	"github.com/chenin0931/oh-my-agent-team/server/internal/util"
	db "github.com/chenin0931/oh-my-agent-team/server/pkg/db/generated"
	"github.com/chenin0931/oh-my-agent-team/server/pkg/protocol"
)

// registerActivityListeners wires up event bus listeners that record activity
// entries in the activity_log table. Each listener creates one or more activity
// records depending on what changed, then publishes an activity:created event
// for WS broadcasting.
func registerActivityListeners(bus *events.Bus, queries *db.Queries) {
	ctx := context.Background()

	// issue:created — record "created" activity
	bus.Subscribe(protocol.EventIssueCreated, func(e events.Event) {
		payload, ok := e.Payload.(map[string]any)
		if !ok {
			return
		}
		issue, ok := payload["issue"].(handler.IssueResponse)
		if !ok {
			return
		}

		activity, err := queries.CreateActivity(ctx, db.CreateActivityParams{
			WorkspaceID: parseUUID(issue.WorkspaceID),
			IssueID:     parseUUID(issue.ID),
			ActorType:   util.StrToText(e.ActorType),
			ActorID:     optionalUUID(e.ActorID),
			Action:      "created",
			Details:     []byte("{}"),
		})
		if err != nil {
			slog.Error("activity: failed to record issue created",
				"issue_id", issue.ID, "error", err)
			return
		}

		publishActivityEvent(bus, e, activity)
	})

	// issue:updated — record specific changes as separate activities
	bus.Subscribe(protocol.EventIssueUpdated, func(e events.Event) {
		payload, ok := e.Payload.(map[string]any)
		if !ok {
			return
		}
		issue, ok := payload["issue"].(handler.IssueResponse)
		if !ok {
			return
		}

		statusChanged, _ := payload["status_changed"].(bool)
		priorityChanged, _ := payload["priority_changed"].(bool)
		assigneeChanged, _ := payload["assignee_changed"].(bool)
		descriptionChanged, _ := payload["description_changed"].(bool)

		if statusChanged {
			prevStatus, _ := payload["prev_status"].(string)
			details, _ := json.Marshal(map[string]string{
				"from": prevStatus,
				"to":   issue.Status,
			})
			activity, err := queries.CreateActivity(ctx, db.CreateActivityParams{
				WorkspaceID: parseUUID(issue.WorkspaceID),
				IssueID:     parseUUID(issue.ID),
				ActorType:   util.StrToText(e.ActorType),
				ActorID:     optionalUUID(e.ActorID),
				Action:      "status_changed",
				Details:     details,
			})
			if err != nil {
				slog.Error("activity: failed to record status change",
					"issue_id", issue.ID, "error", err)
			} else {
				publishActivityEvent(bus, e, activity)
			}
		}

		if priorityChanged {
			prevPriority, _ := payload["prev_priority"].(string)
			details, _ := json.Marshal(map[string]string{
				"from": prevPriority,
				"to":   issue.Priority,
			})
			activity, err := queries.CreateActivity(ctx, db.CreateActivityParams{
				WorkspaceID: parseUUID(issue.WorkspaceID),
				IssueID:     parseUUID(issue.ID),
				ActorType:   util.StrToText(e.ActorType),
				ActorID:     optionalUUID(e.ActorID),
				Action:      "priority_changed",
				Details:     details,
			})
			if err != nil {
				slog.Error("activity: failed to record priority change",
					"issue_id", issue.ID, "error", err)
			} else {
				publishActivityEvent(bus, e, activity)
			}
		}

		if assigneeChanged {
			prevAssigneeType, _ := payload["prev_assignee_type"].(*string)
			prevAssigneeID, _ := payload["prev_assignee_id"].(*string)

			detailsMap := map[string]string{}
			if prevAssigneeType != nil {
				detailsMap["from_type"] = *prevAssigneeType
			}
			if prevAssigneeID != nil {
				detailsMap["from_id"] = *prevAssigneeID
			}
			if issue.AssigneeType != nil {
				detailsMap["to_type"] = *issue.AssigneeType
			}
			if issue.AssigneeID != nil {
				detailsMap["to_id"] = *issue.AssigneeID
			}

			details, _ := json.Marshal(detailsMap)
			activity, err := queries.CreateActivity(ctx, db.CreateActivityParams{
				WorkspaceID: parseUUID(issue.WorkspaceID),
				IssueID:     parseUUID(issue.ID),
				ActorType:   util.StrToText(e.ActorType),
				ActorID:     optionalUUID(e.ActorID),
				Action:      "assignee_changed",
				Details:     details,
			})
			if err != nil {
				slog.Error("activity: failed to record assignee change",
					"issue_id", issue.ID, "error", err)
			} else {
				publishActivityEvent(bus, e, activity)
			}
		}

		if startDateChanged, _ := payload["start_date_changed"].(bool); startDateChanged {
			prevStartDate := ""
			if v, ok := payload["prev_start_date"].(*string); ok && v != nil {
				prevStartDate = *v
			}
			newStartDate := ""
			if issue.StartDate != nil {
				newStartDate = *issue.StartDate
			}
			details, _ := json.Marshal(map[string]string{
				"from": prevStartDate,
				"to":   newStartDate,
			})
			activity, err := queries.CreateActivity(ctx, db.CreateActivityParams{
				WorkspaceID: parseUUID(issue.WorkspaceID),
				IssueID:     parseUUID(issue.ID),
				ActorType:   util.StrToText(e.ActorType),
				ActorID:     optionalUUID(e.ActorID),
				Action:      "start_date_changed",
				Details:     details,
			})
			if err != nil {
				slog.Error("activity: failed to record start date change",
					"issue_id", issue.ID, "error", err)
			} else {
				publishActivityEvent(bus, e, activity)
			}
		}

		if dueDateChanged, _ := payload["due_date_changed"].(bool); dueDateChanged {
			prevDueDate := ""
			if v, ok := payload["prev_due_date"].(*string); ok && v != nil {
				prevDueDate = *v
			}
			newDueDate := ""
			if issue.DueDate != nil {
				newDueDate = *issue.DueDate
			}
			details, _ := json.Marshal(map[string]string{
				"from": prevDueDate,
				"to":   newDueDate,
			})
			activity, err := queries.CreateActivity(ctx, db.CreateActivityParams{
				WorkspaceID: parseUUID(issue.WorkspaceID),
				IssueID:     parseUUID(issue.ID),
				ActorType:   util.StrToText(e.ActorType),
				ActorID:     optionalUUID(e.ActorID),
				Action:      "due_date_changed",
				Details:     details,
			})
			if err != nil {
				slog.Error("activity: failed to record due date change",
					"issue_id", issue.ID, "error", err)
			} else {
				publishActivityEvent(bus, e, activity)
			}
		}

		if titleChanged, _ := payload["title_changed"].(bool); titleChanged {
			prevTitle, _ := payload["prev_title"].(string)
			details, _ := json.Marshal(map[string]string{
				"from": prevTitle,
				"to":   issue.Title,
			})
			activity, err := queries.CreateActivity(ctx, db.CreateActivityParams{
				WorkspaceID: parseUUID(issue.WorkspaceID),
				IssueID:     parseUUID(issue.ID),
				ActorType:   util.StrToText(e.ActorType),
				ActorID:     optionalUUID(e.ActorID),
				Action:      "title_changed",
				Details:     details,
			})
			if err != nil {
				slog.Error("activity: failed to record title change",
					"issue_id", issue.ID, "error", err)
			} else {
				publishActivityEvent(bus, e, activity)
			}
		}

		if descriptionChanged {
			activity, err := queries.CreateActivity(ctx, db.CreateActivityParams{
				WorkspaceID: parseUUID(issue.WorkspaceID),
				IssueID:     parseUUID(issue.ID),
				ActorType:   util.StrToText(e.ActorType),
				ActorID:     optionalUUID(e.ActorID),
				Action:      "description_updated",
				Details:     []byte("{}"),
			})
			if err != nil {
				slog.Error("activity: failed to record description change",
					"issue_id", issue.ID, "error", err)
			} else {
				publishActivityEvent(bus, e, activity)
			}
		}
	})

	// epic:* planning events are stored in the same activity table, but use
	// planning-specific actions and typed targets. They never create task
	// activity or flow through the executable issue protocol.
	bus.Subscribe(protocol.EventEpicCreated, func(e events.Event) {
		payload, ok := e.Payload.(map[string]any)
		if !ok {
			return
		}
		epic, ok := payload["epic"].(handler.EpicResponse)
		if !ok {
			return
		}
		recordEpicActivity(ctx, bus, queries, e, epic, "created", map[string]any{})
	})

	bus.Subscribe(protocol.EventEpicUpdated, func(e events.Event) {
		payload, ok := e.Payload.(map[string]any)
		if !ok {
			return
		}
		epic, ok := payload["epic"].(handler.EpicResponse)
		if !ok {
			return
		}
		type change struct {
			flag   string
			action string
			from   string
			to     string
		}
		changes := []change{
			{"lifecycle_changed", "lifecycle_changed", stringValue(payload["prev_lifecycle"]), epic.Lifecycle},
			{"health_changed", "health_changed", stringValue(payload["prev_health"]), stringPointerValue(epic.Health)},
			{"project_changed", "project_changed", stringValue(payload["prev_project_id"]), epic.ProjectID},
			{"title_changed", "title_changed", stringValue(payload["prev_title"]), epic.Title},
			{"priority_changed", "priority_changed", stringValue(payload["prev_priority"]), epic.Priority},
			{"start_date_changed", "start_date_changed", stringValue(payload["prev_start_date"]), stringPointerValue(epic.StartDate)},
			{"target_date_changed", "target_date_changed", stringValue(payload["prev_target_date"]), stringPointerValue(epic.TargetDate)},
		}
		for _, item := range changes {
			if changed, _ := payload[item.flag].(bool); changed {
				recordEpicActivity(ctx, bus, queries, e, epic, item.action, map[string]any{"from": item.from, "to": item.to})
			}
		}
		if changed, _ := payload["owner_changed"].(bool); changed {
			recordEpicActivity(ctx, bus, queries, e, epic, "owner_changed", map[string]any{
				"from_type": pointerStringValue(payload["prev_owner_type"]),
				"from_id":   pointerStringValue(payload["prev_owner_id"]),
				"to_type":   stringPointerValue(epic.OwnerType),
				"to_id":     stringPointerValue(epic.OwnerID),
			})
		}
		for _, item := range []struct{ flag, action string }{
			{"description_changed", "description_updated"},
			{"success_criteria_changed", "success_criteria_updated"},
			{"labels_changed", "labels_changed"},
			{"work_items_changed", "work_items_changed"},
		} {
			if changed, _ := payload[item.flag].(bool); changed {
				recordEpicActivity(ctx, bus, queries, e, epic, item.action, map[string]any{})
			}
		}
	})

	// task:completed — record "task_completed" activity
	bus.Subscribe(protocol.EventTaskCompleted, func(e events.Event) {
		handleTaskActivity(ctx, bus, queries, e, "task_completed")
	})

	// task:failed — record "task_failed" activity
	bus.Subscribe(protocol.EventTaskFailed, func(e events.Event) {
		handleTaskActivity(ctx, bus, queries, e, "task_failed")
	})
}

// handleTaskActivity records an activity for task:completed or task:failed events.
func handleTaskActivity(ctx context.Context, bus *events.Bus, queries *db.Queries, e events.Event, action string) {
	payload, ok := e.Payload.(map[string]any)
	if !ok {
		return
	}
	agentID, _ := payload["agent_id"].(string)
	issueID, _ := payload["issue_id"].(string)
	if issueID == "" {
		return
	}

	// Look up issue to get workspace_id
	issue, err := queries.GetIssue(ctx, parseUUID(issueID))
	if err != nil {
		slog.Error("activity: failed to get issue for task event",
			"issue_id", issueID, "action", action, "error", err)
		return
	}

	activity, err := queries.CreateActivity(ctx, db.CreateActivityParams{
		WorkspaceID: issue.WorkspaceID,
		IssueID:     parseUUID(issueID),
		ActorType:   util.StrToText("agent"),
		ActorID:     parseUUID(agentID),
		Action:      action,
		Details:     []byte("{}"),
	})
	if err != nil {
		slog.Error("activity: failed to record task activity",
			"issue_id", issueID, "action", action, "error", err)
		return
	}

	publishActivityEvent(bus, e, activity)
}

// publishActivityEvent sends an activity:created event for WS broadcasting.
// Payload matches frontend ActivityCreatedPayload: { issue_id, entry: TimelineEntry }
func publishActivityEvent(bus *events.Bus, original events.Event, activity db.ActivityLog) {
	actorType := ""
	if activity.ActorType.Valid {
		actorType = activity.ActorType.String
	}
	action := activity.Action
	targetType := "issue"
	if original.Type == protocol.EventEpicCreated || original.Type == protocol.EventEpicUpdated {
		targetType = "epic"
	}
	targetID := util.UUIDToString(activity.IssueID)
	bus.Publish(events.Event{
		Type:        protocol.EventActivityCreated,
		WorkspaceID: original.WorkspaceID,
		ActorType:   original.ActorType,
		ActorID:     original.ActorID,
		Payload: map[string]any{
			"issue_id":    targetID,
			"target_type": targetType,
			"target_id":   targetID,
			"entry": map[string]any{
				"type":       "activity",
				"id":         util.UUIDToString(activity.ID),
				"actor_type": actorType,
				"actor_id":   util.UUIDToString(activity.ActorID),
				"action":     action,
				"details":    json.RawMessage(activity.Details),
				"created_at": util.TimestampToString(activity.CreatedAt),
			},
		},
	})
}

func recordEpicActivity(ctx context.Context, bus *events.Bus, queries *db.Queries, event events.Event, epic handler.EpicResponse, action string, details map[string]any) {
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		return
	}
	activity, err := queries.CreateActivity(ctx, db.CreateActivityParams{
		WorkspaceID: parseUUID(epic.WorkspaceID),
		IssueID:     parseUUID(epic.ID),
		ActorType:   util.StrToText(event.ActorType),
		ActorID:     optionalUUID(event.ActorID),
		Action:      action,
		Details:     detailsJSON,
	})
	if err != nil {
		slog.Error("activity: failed to record epic planning change", "epic_id", epic.ID, "action", action, "error", err)
		return
	}
	publishActivityEvent(bus, event, activity)
}

func stringValue(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return pointerStringValue(value)
}

func pointerStringValue(value any) string {
	if text, ok := value.(*string); ok && text != nil {
		return *text
	}
	return ""
}

func stringPointerValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
