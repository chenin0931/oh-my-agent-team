# Planning Epics source map

Re-confirm exact line numbers against the current tree before relying on them.

| Contract | Source |
| --- | --- |
| `omat epic list/get/create/update/issues/comment` command tree | `server/cmd/omat/cmd_epic.go` |
| `omat issue create` rejects Epic and resolves `--epic-id` through the Epic API | `server/cmd/omat/cmd_issue.go` |
| Dedicated `/api/epics` routes and shared collaboration-only subroutes | `server/cmd/server/router.go` |
| Epic DTO, lifecycle, health, owner validation, CRUD, move/delete, work-item attachment, and advisor action | `server/internal/handler/epic.go` |
| Legacy Issue execution endpoints reject an Epic with `epic_planning_container` | `server/internal/handler/handler.go` (`loadExecutableIssueForUser`) |
| Project > Epic > Issue > Subtask create validation and inherited Project/Epic IDs | `server/internal/service/issue.go` (`IssueService.Create`) |
| Agent execution and member-owned advisor fan-out skip Epic rows | `server/internal/service/issue.go`, `server/internal/service/task.go` |
| Explicit Epic advisor context and one-comment role | `server/internal/service/task.go` (`EpicAdvisorContextType`, `EnqueueEpicAdvisor`) |
| Advisor mutation guard | `server/internal/handler/advisor_permissions.go` |
| Plain Epic comment is inert; explicit Agent mention creates only an Epic advisor; Squad mention is rejected | `server/internal/handler/comment.go` (`triggerEpicAdvisorMentions`) |
| Planning lifecycle, health, owner/shape constraints, and partial indexes | `server/migrations/150_epic_planning_container.up.sql` |
| Typed Epic Inbox targets | `server/migrations/151_inbox_typed_targets.up.sql`, `server/cmd/server/notification_listeners.go` |
| Planning Quick Create uses `omat epic create`, then backlog Issues | `server/internal/daemon/prompt.go`, `server/internal/daemon/execenv/runtime_config_sections.go` |
| Planning CLI minimum version | `server/pkg/agent/version.go` (`MinPlanningQuickCreateCLIVersion`) |

Verification:

```bash
rg -n "epic_planning_container|EpicAdvisorContextType|omat epic create|MinPlanningQuickCreateCLIVersion" server
go test ./internal/service ./internal/handler ./cmd/omat ./pkg/agent
```
