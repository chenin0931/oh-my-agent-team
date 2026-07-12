---
name: ohmyagentteam-planning-epics
description: "Use when creating, reading, updating, or advising on a OhMyAgentTeam Epic, or when planning a Project into Epic and Issue layers. Covers the planning-only Epic lifecycle, the omat epic CLI, owner and Project constraints, attaching executable work, and the hard boundary that Epic containers never execute Agent work."
user-invocable: false
allowed-tools: Bash(ohmyagentteam *)
---

# Planning with OhMyAgentTeam Epics

An Epic is a Project-scoped planning container for one business outcome. It is
not an executable work item. The product hierarchy is:

```text
Project > Epic > Issue > Subtask
```

Use `ohmyagentteam-working-on-issues` for execution behavior after the plan has been
materialized as Issues and Subtasks.

## Hard boundary

- An Epic must belong to a Project and cannot contain another Epic.
- Its lifecycle is `planned`, `in_progress`, `paused`, `completed`, or
  `cancelled`; these are planning states, not Agent run states.
- Its owner is a member or Agent acting as planning owner. A Squad cannot own
  an Epic, and an Agent owner is never started automatically.
- Assigning an owner, changing lifecycle, commenting, or subscribing never
  starts execution.
- Executable work lives in an Issue or Subtask. `backlog` parks it; an active
  status such as `todo` may start its assigned Agent.

Never pass an Epic ID to `omat issue status`, `omat issue assign`,
`omat issue metadata`, `omat issue pull-requests`, or other execution
commands. Use the `omat epic` surface.

## CLI

```bash
omat epic list --project <project-id> --output json
omat epic get <epic-id> --output json
omat epic create --title "<outcome>" --project <project-id> \
  --description-file <path> --success-criteria-file <path> --output json
omat epic update <epic-id> --lifecycle in_progress --health on_track --output json
omat epic issues <epic-id> --output json
omat epic comment list <epic-id> --output json
omat epic comment add <epic-id> --content-file <path> --output json
```

`omat epic create` always creates `planned`. Use `--owner-id` only with a
member or Agent UUID. Health is optional: `on_track`, `at_risk`, or
`off_track`.

To create executable work inside an Epic, use its returned UUID:

```bash
omat issue create --type issue --epic-id <epic-uuid> \
  --title "<independently ownable result>" --status backlog --output json
```

Create a Subtask only when a step cannot be owned or delivered independently:

```bash
omat issue create --type subtask --parent <issue-uuid> \
  --title "<bounded step>" --status backlog --output json
```

## Planning and advisor behavior

Planning Quick Create should create an Epic only when two or more independently
ownable Issues share one outcome. A single deliverable stays an Issue. Without
a Project, do not create an Epic.

Normal Epic updates do not wake Agents. A human must explicitly mention an
Agent or request analysis. That creates one `epic_advisor` task. An Epic
advisor may read the Epic, its work items, and updates, then post at most one
planning comment. It may not update the Epic, create work, change Issue state,
delegate, or trigger another Agent. Squad mentions are invalid on Epic updates.

Use `[KEY](mention://epic/<epic-uuid>)` when linking an Epic in Markdown. The
link is navigational and has no execution side effect.

## Structural mutations

Deleting an Epic leaves its Issues in the same Project as ungrouped work.
Moving an Epic to another Project moves its Issues and Subtasks with it. Neither
operation changes child statuses or starts Agents.

## References

`references/planning-epics-source-map.md` maps these contracts to the current
CLI, API, service, permission, migration, and prompt sources.
