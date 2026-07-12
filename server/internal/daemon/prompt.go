package daemon

import (
	"fmt"
	"strings"

	"github.com/chenin0931/oh-my-agent-team/server/internal/daemon/execenv"
)

// BuildPrompt constructs the task prompt for an agent CLI.
// Keep this minimal — detailed instructions live in CLAUDE.md / AGENTS.md
// injected by execenv.InjectRuntimeConfig. The provider string is threaded
// through to comment-triggered tasks' per-turn reply template; that template
// is provider-agnostic AND host-agnostic now (every OS → write a UTF-8 file,
// post with `--content-file`) because the shell-layer corruption it guards
// against is not specific to any one provider or host (MUL-2904, #4182).
func BuildPrompt(task Task, provider string) string {
	if task.ChatSessionID != "" {
		return buildChatPrompt(task)
	}
	if task.TriggerCommentID != "" {
		return buildCommentPrompt(task, provider)
	}
	if task.AutopilotRunID != "" {
		return buildAutopilotPrompt(task)
	}
	if task.QuickCreatePrompt != "" {
		if task.QuickCreateMode == "planning" {
			return buildPlanningQuickCreatePrompt(task)
		}
		return buildQuickCreatePrompt(task)
	}
	if task.MemberAssigneeAdvisor {
		if task.EpicAdvisor {
			return buildEpicAdvisorPrompt(task)
		}
		return buildMemberAssigneeAdvisorPrompt(task)
	}
	var b strings.Builder
	b.WriteString("You are running as a local coding agent for a OhMyAgentTeam workspace.\n\n")
	fmt.Fprintf(&b, "Your assigned issue ID is: %s\n\n", task.IssueID)
	// Assignment handoff (MUL-3375): a free-text instruction the person who
	// assigned/promoted this issue left for you. Frame it as a handoff, not a
	// comment to reply to — there is no comment thread to answer here.
	if task.HandoffNote != "" {
		b.WriteString("You were handed this issue with a handoff note. Treat it as the assigner's scoping instruction for this run; follow it before doing anything broader, and do not reply to it as if it were a comment:\n\n")
		fmt.Fprintf(&b, "> %s\n\n", task.HandoffNote)
	}
	fmt.Fprintf(&b, "Start by running `omat issue get %s --output json` to understand your task, then complete it.\n", task.IssueID)
	fmt.Fprintf(&b, "For comment history, follow the rule in your runtime workflow file (assignment-triggered tasks treat the read as mandatory). Start with `omat issue comment list %s --recent 10 --output json` to read the 10 most recently active threads, then page older threads via the stderr `Next thread cursor: ...` line and the matching `--before` / `--before-id` until you have enough history. Resolved threads come back folded — `--full` to expand. `--since <RFC3339>` is still available for incremental polling and may combine with `--recent`.\n", task.IssueID)
	return b.String()
}

func buildEpicAdvisorPrompt(task Task) string {
	var b strings.Builder
	b.WriteString("You are running as a one-shot planning advisor for an Epic container.\n\n")
	fmt.Fprintf(&b, "Your Epic ID is: %s\n\n", task.IssueID)
	if task.AdvisorInstruction != "" {
		fmt.Fprintf(&b, "The human asked you to focus on:\n> %s\n\n", task.AdvisorInstruction)
	}
	fmt.Fprintf(&b, "Read the Epic with `omat epic get %s --output json`, its work items with `omat epic issues %s --output json`, and recent updates with `omat epic comment list %s --output json`.\n", task.IssueID, task.IssueID, task.IssueID)
	b.WriteString("If you can add a new, concrete planning recommendation, post exactly one comment with `omat epic comment add <epic-id> --content-file <path>`. Otherwise finish with empty output.\n")
	b.WriteString("You may only read and comment. Do not modify the Epic, create or update work items, change any status or owner, delegate, mention another actor, or trigger another Agent.\n")
	return b.String()
}

func buildMemberAssigneeAdvisorPrompt(task Task) string {
	var b strings.Builder
	b.WriteString("You are running as a one-shot advisor for a OhMyAgentTeam workspace.\n\n")
	fmt.Fprintf(&b, "A human member has been assigned issue ID: %s\n\n", task.IssueID)
	b.WriteString("Your job is to decide whether your Agent Identity makes you useful on this issue, then optionally leave exactly one advisory comment for the human assignee.\n\n")
	if task.AdvisorInstruction != "" {
		fmt.Fprintf(&b, "The human specifically asked you to focus on this request:\n> %s\n\n", task.AdvisorInstruction)
	}
	fmt.Fprintf(&b, "Start by running `omat issue get %s --output json`, then `omat issue comment list %s --recent 10 --output json` to understand the current context.\n", task.IssueID, task.IssueID)
	b.WriteString("If you can give useful, specific advice, write a concise comment to a UTF-8 file and post it with `omat issue comment add <issue-id> --content-file <path>`. The comment should help the human decide what to do next.\n")
	b.WriteString("If you cannot give useful advice, do not post a comment and finish with empty output. Do not write a placeholder such as \"no advice\" or \"done\".\n")
	b.WriteString("Do not change issue status, update the issue, create issues or sub-issues, write metadata, mention agents or members, delegate, resolve comments, edit comments, or delete comments.\n")
	return b.String()
}

// buildQuickCreatePrompt constructs a prompt for quick-create tasks. The
// user typed natural language in the create-issue modal; the agent's job is
// to translate it into one or more `omat issue create` CLI
// invocation, using its judgment to decide whether fetching referenced URLs
// would produce a better issue. No issue exists yet, so the agent must NOT
// call `omat issue get` or attempt to comment — there's nothing to read
// or reply to.
func buildQuickCreatePrompt(task Task) string {
	var b strings.Builder
	b.WriteString("You are running as a quick-create assistant for a OhMyAgentTeam workspace.\n\n")
	b.WriteString("A user captured the following input via the quick-create modal. There is NO existing issue. Your job is to create the issue or issues requested by this input with `omat issue create` commands.\n\n")
	fmt.Fprintf(&b, "User input:\n> %s\n\n", task.QuickCreatePrompt)

	b.WriteString("Field rules:\n\n")

	// title
	b.WriteString("- **title**: required. A concise but semantically rich summary. If the input references external resources (PRs, issues, URLs), use your judgment on whether fetching the resource would produce a meaningfully better title — e.g. \"review PR #123\" → \"Review PR #123: Refactor auth module to OAuth2\". Strip filler words but preserve key semantic information.\n\n")

	// description — the core optimization
	b.WriteString("- **description**: The description is the executing agent's primary context. Aim for high fidelity — they should grasp the user's intent as if they had read the raw input themselves. Use a two-section structure:\n\n")
	b.WriteString("  1. **User request** — Faithfully restate what the user wants in their own words. Preserve specific names, identifiers, file paths, code snippets, and technical terms verbatim. Strip non-spec material before writing it (this is removal, not paraphrasing): verbal routing wrappers about creating the issue or routing it (e.g. \"create an issue\", \"分配给 X\", \"让 @X 处理\") and pure conversational fillers (e.g. \"对吧？\"). When in doubt, keep it.\n\n")
	b.WriteString("     CC exception: `omat issue create` has no `--subscriber` flag, and the platform auto-subscribes members whose `[@Name](mention://member/<uuid>)` link appears in the description. When the user wrote \"cc @Y\", strip the verbal \"cc\" wrapper from the User request body and append a final `CC: <mention link(s)>` line to the description so the cc routing still fires.\n\n")
	b.WriteString("  2. **Context** — include ONLY when the input cited external resources AND you successfully fetched them AND they produced verifiable facts worth recording. Summarize facts only (e.g. \"PR #45 changes auth to JWT\"), not interpretation or unsolicited reference implementations. If you have nothing factual to add, omit the section entirely — never use it as an apology log for resources you could not fetch.\n\n")
	b.WriteString("  Hard rules: never invent requirements, implementation details, or acceptance criteria the user did not express; never reduce multi-sentence input to a single vague sentence; never echo the title.\n\n")

	// priority
	b.WriteString("- **priority**: one of `urgent`, `high`, `medium`, `low`, or omit. Map P0/P1 → urgent/high; \"asap\" → urgent. If unspecified, omit.\n\n")

	// assignee
	b.WriteString("- **assignee**:\n")
	b.WriteString("    - When the user names someone (\"assign to X\" / \"@X\"), call `omat workspace member list --output json`, `omat agent list --output json`, and `omat squad list --output json` and find the matching entity by display name. Squads are first-class assignees too — a squad name (e.g. \"Super Human\") routes work to the squad leader, who then delegates. On a clean unambiguous match, prefer `--assignee-id <uuid>` using the `user_id` (member) or `id` (agent or squad) from that JSON — UUID matching is exact and robust to name collisions in workspaces with overlapping names. `--assignee <name>` (fuzzy) is acceptable as a fallback when names are unambiguous. On no match or ambiguous match, do NOT pass either flag — instead append a final line to the description: `Unrecognized assignee: X`.\n")
	b.WriteString("    - Treat bare @-routing as an assignee directive even when the user did not write the English word \"assign\". This includes Chinese imperatives like `让 @独立团 review 这个 PR`, `给 @X 处理`, or `交给 @X`; strip the leading `@`/`＠` before matching display names. Do not keep that routing wrapper or `@Name` in the description unless it is a true CC-style notification rather than ownership. If the matched entity is a squad, pass the squad's `id` as `--assignee-id`, not the leader agent's id.\n")
	if len(task.QuickCreateAvailableAgents) > 0 {
		b.WriteString("    - When the user did NOT name an assignee, first use the Available agents roster below for smart assignment: compare the issue content against each agent's name and description, choose the single best-matching agent, and pass that agent's `id` with `--assignee-id`. For multiple requested issues, choose independently per issue. Do not invent capabilities beyond an agent's name/description. If there is no clear best match, use the picker fallback below.\n")
	} else {
		b.WriteString("    - When the user did NOT name an assignee, use the picker fallback below.\n")
	}
	agentID := ""
	agentName := ""
	if task.Agent != nil {
		agentID = task.Agent.ID
		agentName = task.Agent.Name
	}
	switch {
	case task.SquadID != "":
		// The user opened quick-create with a SQUAD selected. The task
		// runs on the squad's leader agent, but the squad is the expected
		// owner — assigning to the leader would mask the squad's
		// delegation flow. Always point the default at the squad UUID.
		if task.SquadName != "" {
			fmt.Fprintf(&b, "    - When the user did NOT name an assignee, default to the picker SQUAD %q: pass `--assignee-id %q` (the squad's UUID). The user opened quick-create with the squad selected; you (the leader agent) are running on the squad's behalf, so the squad — not you — is the expected owner. Never leave the issue unassigned, and do not assign it to your own agent UUID.\n\n", task.SquadName, task.SquadID)
		} else {
			fmt.Fprintf(&b, "    - When the user did NOT name an assignee, default to the picker SQUAD: pass `--assignee-id %q` (the squad's UUID). The user opened quick-create with the squad selected; you (the leader agent) are running on the squad's behalf, so the squad — not you — is the expected owner. Never leave the issue unassigned, and do not assign it to your own agent UUID.\n\n", task.SquadID)
		}
	case agentID != "":
		fmt.Fprintf(&b, "    - When the user did NOT name an assignee, default to YOURSELF: pass `--assignee-id %q` (your agent UUID). The picker agent is the expected owner because the user opened quick-create with you selected — never leave the issue unassigned. Use the UUID flag, not `--assignee <name>`, so the assignment is unambiguous even when other agents share part of your name.\n\n", agentID)
	case agentName != "":
		fmt.Fprintf(&b, "    - When the user did NOT name an assignee, default to YOURSELF: pass `--assignee %q`. The picker agent is the expected owner because the user opened quick-create with you selected — never leave the issue unassigned.\n\n", agentName)
	default:
		b.WriteString("    - When the user did NOT name an assignee, default to YOURSELF (the picker agent): pass `--assignee-id <your agent UUID>` (preferred) or `--assignee <your agent name>`. Never leave the issue unassigned.\n\n")
	}

	if len(task.QuickCreateAvailableAgents) > 0 {
		b.WriteString("Available agents for smart assignment:\n")
		for _, agent := range task.QuickCreateAvailableAgents {
			desc := compactSingleLine(agent.Description)
			if desc == "" {
				desc = "No description provided."
			}
			fmt.Fprintf(&b, "- id: `%s`; name: %q; description: %q\n", agent.ID, agent.Name, desc)
		}
		b.WriteString("\n")
	}

	// project — pinned by the modal when the user picked one, otherwise
	// omitted so the platform routes to the workspace default. Always pass
	// the UUID (never a name) so the issue lands in the right project even
	// when several share a title.
	if task.ProjectID != "" {
		if task.ProjectTitle != "" {
			fmt.Fprintf(&b, "- **project**: required for this run. Pass `--project %q` so the new issue lands in project %q (the user picked it in the quick-create modal). Do not infer a different project from the prompt text — the modal selection is authoritative.\n", task.ProjectID, task.ProjectTitle)
		} else {
			fmt.Fprintf(&b, "- **project**: required for this run. Pass `--project %q` so the new issue lands in the project the user picked in the quick-create modal. Do not infer a different project from the prompt text — the modal selection is authoritative.\n", task.ProjectID)
		}
	} else {
		b.WriteString("- **project**: omit. The platform will route the issue to the workspace default.\n")
	}
	// parent — pinned by the modal when the user opened it from "Add sub
	// issue" on an existing issue. Pass the UUID (never the identifier) so
	// the create lands the sub-issue under the right parent even when the
	// workspace prefix changes; the identifier is included in the prose
	// purely as human-readable context for the agent.
	if task.ParentIssueID != "" {
		if task.ParentIssueIdentifier != "" {
			fmt.Fprintf(&b, "- **parent**: required for this run. Pass `--parent %q` so the new issue is filed as a sub-issue of %s (the user opened quick-create from that issue's \"Add sub issue\" entry). Do not infer a different parent from the prompt text — the modal entry point is authoritative.\n", task.ParentIssueID, task.ParentIssueIdentifier)
		} else {
			fmt.Fprintf(&b, "- **parent**: required for this run. Pass `--parent %q` so the new issue is filed as a sub-issue of the parent the user picked in the quick-create modal. Do not infer a different parent from the prompt text — the modal entry point is authoritative.\n", task.ParentIssueID)
		}
	}
	b.WriteString("- **status**: omit (defaults to `backlog`). If the user explicitly asks to start execution immediately, pass `--status todo`.\n")
	b.WriteString("- **attachments**: do NOT pass `--attachment`. The flag only accepts LOCAL file paths. Any image URL in the user input is already markdown — keep it inline in `--description` instead.\n\n")

	// output format
	b.WriteString("Output format:\n")
	b.WriteString("- Run one `omat issue create --output json` invocation per issue the user requested. If the input describes one issue, create exactly one. If it clearly asks for multiple issues, create each requested issue separately.\n")
	b.WriteString("- Do not retry a failed `omat issue create` invocation for any reason — even on non-zero exit. The issue may already exist; another attempt would create a duplicate. Stop on the first failure and exit with that error.\n")
	b.WriteString("- Parse each JSON response to read the created issue's `identifier` (preferred) or `id` (fallback). Do not scrape human output and do not assume any workspace issue prefix such as `MUL-`; workspaces can use custom prefixes. Do not rely on `jq`; it may not be installed. Use built-in Python or Node JSON parsing if you need a helper.\n")
	b.WriteString("- After success, print exactly one final line. For one issue: `Created <identifier-or-id>: <title>`. For multiple issues: `Created <count> issues: <identifier-or-id>, <identifier-or-id>, ...`. No commentary, no follow-up tool calls.\n")
	b.WriteString("- Do NOT call `omat issue get` or `omat issue comment add` — there is no issue to query or comment on.\n")
	b.WriteString("- On CLI error or JSON parse error, exit with the error as the only output. The platform writes a failure notification automatically.\n")
	return b.String()
}

func buildPlanningQuickCreatePrompt(task Task) string {
	var b strings.Builder
	b.WriteString("You are running as a Planning Quick Create assistant for a OhMyAgentTeam workspace.\n\n")
	b.WriteString("A workspace admin is describing a feature, goal, or rough request. There is NO existing work item. Your job is to plan the right Project > Epic > Issue > Subtask structure, create planning containers with `omat epic create`, and create executable backlog work with `omat issue create`.\n\n")
	fmt.Fprintf(&b, "User planning request:\n> %s\n\n", task.QuickCreatePrompt)

	b.WriteString("Hard rules:\n\n")
	b.WriteString("- This is planning, not execution.\n")
	b.WriteString("- Use the same natural language as the user's request for issue titles and descriptions. If the user writes Chinese, write the issue title, description section labels, and description body in Chinese. Keep CLI flags/JSON parsing terms and the final required `Planned ...` line in the specified English format.\n")
	b.WriteString("- Every Epic MUST be created with `omat epic create` and starts in `planned`. Every `omat issue create` command MUST include `--status backlog`.\n")
	b.WriteString("- Do not use `todo`, `in_progress`, `in_review`, `done`, `blocked`, or `cancelled`.\n")
	b.WriteString("- Do not start work, update existing issues, change status, comment, mention agents or members, or create follow-up activity.\n")
	b.WriteString("- Epic membership and executable parent/child work are different relationships: use `--epic-id` for an Issue under an Epic and `--parent` only for a Subtask under an Issue.\n")
	b.WriteString("- Do not retry a failed `omat epic create` or `omat issue create` invocation for any reason — even on non-zero exit. Stop on the first failure and exit with that error.\n\n")

	b.WriteString("Hierarchy and decomposition rules:\n\n")
	b.WriteString("- A single independently deliverable request becomes one `--type issue`.\n")
	if task.ProjectID != "" {
		b.WriteString("- When two or more independently deliverable Issues share one business outcome, first run `omat epic create --project <project-id>`, parse its returned `id`, then create each Issue with `omat issue create --type issue --epic-id <epic-uuid>`.\n")
	} else {
		b.WriteString("- No Project was selected, so you MUST NOT create an Epic. Create one or more standalone `--type issue` work items only.\n")
	}
	b.WriteString("- Create `--type subtask --parent <issue-uuid>` only for a step that cannot be independently owned or released and exists solely to complete one Issue. Parse the parent Issue's returned `id` before creating its Subtasks.\n")
	b.WriteString("- Create one Issue per independently ownable work item.\n")
	b.WriteString("- Prefer a small set of meaningful issues over many tiny implementation chores.\n")
	b.WriteString("- If the request naturally has discovery, design, implementation, testing, rollout, or review parts, split those into separate issues when they are independently ownable.\n")
	b.WriteString("- If the request is already a single clear work item, creating one issue is acceptable.\n")
	b.WriteString("- Keep each Issue actionable for the assignee. Do not invent external facts, deadlines, acceptance criteria, or implementation details the user did not imply.\n")
	b.WriteString("- If you make an assumption, write it clearly in the issue description.\n\n")

	b.WriteString("Assignment rules:\n\n")
	b.WriteString("- Choose the assignee independently for every Issue and Subtask. An Epic may have an owner for planning accountability, but assigning an Epic never starts execution.\n")
	b.WriteString("- If the user explicitly names someone or writes `@Name`, call `omat workspace member list --output json`, `omat agent list --output json`, and `omat squad list --output json`; resolve the member, agent, or squad by display name and assign by UUID with `--assignee-id`. For human members, pass the member row's `user_id` field, not the member row's `id`. For agents and squads, pass their `id`.\n")
	b.WriteString("- Squads are first-class assignees. If the matched entity is a squad, pass the squad's `id` as `--assignee-id`, not the leader agent's id.\n")
	b.WriteString("- If the user does not name an assignee, use the Available agents roster below for smart assignment: compare each issue's content against each agent's name and description, choose the best-matching agent, and pass that agent's `id` with `--assignee-id`.\n")
	b.WriteString("- Assign to a human member only when the user named that member, or the issue is clearly a human decision, review, approval, or confirmation task.\n")
	b.WriteString("- If no clear owner exists, assign to the picker agent as the fallback owner. Never leave an issue unassigned unless no valid assignee can be resolved.\n\n")

	if len(task.QuickCreateAvailableAgents) > 0 {
		b.WriteString("Available agents for smart assignment:\n")
		for _, agent := range task.QuickCreateAvailableAgents {
			desc := compactSingleLine(agent.Description)
			if desc == "" {
				desc = "No description provided."
			}
			fmt.Fprintf(&b, "- id: `%s`; name: %q; description: %q\n", agent.ID, agent.Name, desc)
		}
		b.WriteString("\n")
	}

	if task.Agent != nil {
		fmt.Fprintf(&b, "Picker fallback agent: id `%s`; name %q.\n\n", task.Agent.ID, task.Agent.Name)
	}

	b.WriteString("Field rules for each work item:\n\n")
	b.WriteString("- **Epic fields**: use `omat epic create --title ... --project ... --description-file ... --success-criteria-file ... [--owner-id <member-or-agent-uuid>] --output json`. Never create an Epic through `omat issue create`.\n")
	b.WriteString("- **work item type**: pass `--type issue` or `--type subtask` to `omat issue create`.\n")
	b.WriteString("- **title**: concise, specific, and useful on a board.\n")
	b.WriteString("- **description**: use this structure:\n")
	b.WriteString("  1. **Original context** — the relevant part of the admin's request.\n")
	b.WriteString("  2. **Task** — what this issue asks the assignee to do.\n")
	b.WriteString("  3. **Done signal** — how the assignee can tell the issue is complete.\n")
	b.WriteString("  4. **Assignment rationale** — one sentence explaining why this assignee fits.\n")
	b.WriteString("- **acceptance criteria**: when the request provides a concrete completion signal, pass it as Markdown with `--acceptance-criteria`. Do not invent criteria the user did not imply.\n")
	b.WriteString("- **status**: required. Always pass `--status backlog`.\n")
	b.WriteString("- **priority**: omit unless the user clearly specified urgency.\n")
	if task.ProjectID != "" {
		if task.ProjectTitle != "" {
			fmt.Fprintf(&b, "- **project**: required for this run. Pass `--project %q` so every planned issue lands in project %q.\n", task.ProjectID, task.ProjectTitle)
		} else {
			fmt.Fprintf(&b, "- **project**: required for this run. Pass `--project %q` so every planned issue lands in the selected project.\n", task.ProjectID)
		}
	} else {
		b.WriteString("- **project**: omit. The platform will route each issue to the workspace default.\n")
	}
	b.WriteString("- **epic**: for an Issue under an Epic, pass the Epic UUID with `--epic-id`. Never use `--parent` for Epic membership.\n")
	b.WriteString("- **parent**: pass only on `--type subtask`, using its parent Issue UUID.\n")
	b.WriteString("- **attachments**: do NOT pass `--attachment`. Keep any image URLs from the user input inline in the description.\n\n")

	b.WriteString("Output format:\n")
	b.WriteString("- Create containers before work items and parents before children. Parse every JSON response before creating dependent items.\n")
	b.WriteString("- Every `omat issue create` command must include `--status backlog`; Epic create has no executable status flag and always starts planned.\n")
	b.WriteString("- Prefer `--assignee-id <uuid>` over fuzzy assignee names.\n")
	b.WriteString("- Parse each JSON response to read the created issue's `identifier` (preferred) or `id` (fallback). Do not scrape human output and do not assume any workspace issue prefix such as `MUL-`. Do not rely on `jq`; it may not be installed. Use built-in Python or Node JSON parsing if you need a helper.\n")
	b.WriteString("- After success, print exactly one final line: `Planned <epic-count> epics, <issue-count> issues, <subtask-count> subtasks: <identifier-or-id>, <identifier-or-id>, ...`.\n")
	b.WriteString("- Do NOT call get, update, status, or comment commands during planning.\n")
	b.WriteString("- On CLI error or JSON parse error, exit with the error as the only output. The platform writes a failure notification automatically.\n")
	return b.String()
}

func compactSingleLine(s string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(s)), " ")
}

// buildCommentPrompt constructs a prompt for comment-triggered tasks.
// The triggering comment content is embedded directly so the agent cannot
// miss it, even when stale output files exist in a reused workdir.
// The reply instructions (including the current TriggerCommentID as --parent)
// are re-emitted on every turn so resumed sessions cannot carry forward a
// previous turn's --parent UUID.
func buildCommentPrompt(task Task, provider string) string {
	var b strings.Builder
	b.WriteString("You are running as a local coding agent for a OhMyAgentTeam workspace.\n\n")
	fmt.Fprintf(&b, "Your assigned issue ID is: %s\n\n", task.IssueID)
	if task.TriggerCommentContent != "" {
		authorLabel := "A user"
		if task.TriggerAuthorType == "agent" {
			name := task.TriggerAuthorName
			if name == "" {
				name = "another agent"
			}
			authorLabel = fmt.Sprintf("Another agent (%s)", name)
		}
		fmt.Fprintf(&b, "[NEW COMMENT] %s just left a new comment. Focus on THIS comment — do not confuse it with previous ones:\n\n", authorLabel)
		fmt.Fprintf(&b, "> %s\n\n", task.TriggerCommentContent)
		if task.TriggerAuthorType == "agent" {
			b.WriteString("⚠️ The triggering comment was posted by another agent. Decide whether a reply is warranted. If you produced actual work this turn (investigated, fixed something, answered a real question), post the result as a normal reply — that is NOT a noise comment, and the standard rule that final results must be delivered via comment still applies. If the triggering comment was a pure acknowledgment, thanks, or sign-off AND you produced no work this turn, do NOT reply — and do NOT post a comment saying 'No reply needed' or similar. Simply exit with no output. Silence is the preferred way to end agent-to-agent threads. If you do reply, do not @mention the other agent as a sign-off (that re-triggers them and starts a loop).\n\n")
		}
		if task.Agent != nil && strings.Contains(task.Agent.Instructions, "## Squad Operating Protocol") {
			fmt.Fprintf(&b, "⚠️ **Squad leader no_action rule:** If you decide no action is needed, call `omat squad activity %s no_action --reason \"...\"` and EXIT. DO NOT post any comment — not even one that says \"no action needed\" or \"exiting silently\". The squad activity call records your decision; a comment is redundant noise.\n\n", task.IssueID)
		}
	}
	fmt.Fprintf(&b, "Start by running `omat issue get %s --output json` to understand your task, then decide how to proceed.\n\n", task.IssueID)
	// Comment-reading pointer. Warm path with new comments: issue-wide
	// since-delta count, but steer the agent to read the triggering thread
	// first. Warm resumed path with no new comments: the trigger is already
	// injected, so don't force a duplicate thread read. Cold path: read the
	// triggering thread, not the flat timeline. Final fallback (no trigger id,
	// shouldn't happen here): plain read.
	if hint := execenv.BuildNewCommentsHint(task.IssueID, task.TriggerCommentID, task.TriggerThreadID, task.NewCommentsSince, task.NewCommentCount); hint != "" {
		b.WriteString(hint)
	} else if task.PriorSessionID != "" {
		b.WriteString(execenv.BuildResumedCommentsHint(task.IssueID, task.TriggerCommentID, task.TriggerThreadID))
	} else if cold := execenv.BuildColdCommentsHint(task.IssueID, task.TriggerCommentID, task.TriggerThreadID); cold != "" {
		b.WriteString(cold)
	} else {
		fmt.Fprintf(&b, "Read the discussion: `omat issue comment list %s --recent 10 --output json` (resolved threads come back folded — `--full` to expand).\n\n", task.IssueID)
	}
	b.WriteString(execenv.BuildCommentReplyInstructions(provider, task.IssueID, task.TriggerCommentID))
	return b.String()
}

// buildChatPrompt constructs a prompt for interactive chat tasks.
func buildChatPrompt(task Task) string {
	var b strings.Builder
	b.WriteString("You are running as a chat assistant for a OhMyAgentTeam workspace.\n")
	b.WriteString("A user is chatting with you directly. Respond to their message.\n\n")
	// Channel awareness (MUL-3871). When the session is backed by an IM channel,
	// the agent must KNOW it is operating inside that channel — otherwise an ask
	// like "what did you just talk about" sends it to read OhMyAgentTeam instead of the
	// Slack conversation. State it explicitly, point reads at the channel (not
	// OhMyAgentTeam), and teach the two read commands, telling the agent which to start
	// with based on where it was @mentioned. A web-only chat session gets no such
	// block — its history is the OhMyAgentTeam chat_session the agent already resumes.
	if task.ChatChannelType != "" {
		platform := channelDisplayName(task.ChatChannelType)
		fmt.Fprintf(&b, "You are operating inside a %s conversation — not the OhMyAgentTeam web app. This conversation and its history live in %s, NOT in OhMyAgentTeam; never look in OhMyAgentTeam issues or comments for it. The message below may be only what triggered you. Read the conversation with:\n", platform, platform)
		b.WriteString("- `omat chat history --output json` — the channel overview: recent top-level messages, each thread tagged with a `thread_id` and `reply_count`. It does NOT expand thread contents.\n")
		b.WriteString("- `omat chat thread [<thread_id>] --output json` — read one thread's messages; omit the id to read the thread you are in, or pass a `thread_id` from the overview to read a specific thread.\n")
		if task.ChatInThread {
			b.WriteString("You were @mentioned inside a thread: start with `omat chat thread` to read it; if you need the wider channel, run `omat chat history` and open a specific thread with `omat chat thread <thread_id>`.\n")
		} else {
			b.WriteString("You were @mentioned at the channel top level: start with `omat chat history` to see the channel, then read a specific thread's contents with `omat chat thread <thread_id>`.\n")
		}
		// These reads are the agent's private context-gathering; narrating them
		// into a chat reply reads as noise (the user reported every reply being
		// prefixed with "我先读取…"). Tell the agent to keep them out of its answer.
		b.WriteString("Do these reads SILENTLY as an internal step — they are how you gather context, not part of your answer. Do NOT narrate them: your reply must not begin with what you are about to read or just read (no \"我先读取…\" / \"let me read the history / open the thread\"). Reply to the user with your answer only.\n\n")
	}
	if task.Agent != nil && len(task.Agent.Skills) > 0 {
		refs := ExtractSlashSkills(task.ChatMessage)
		if len(refs) > 0 {
			agentSkills := make(map[string]string, len(task.Agent.Skills))
			for _, s := range task.Agent.Skills {
				agentSkills[s.ID] = s.Name
			}

			selected := make([]string, 0, len(refs))
			seen := make(map[string]struct{}, len(refs))
			for _, ref := range refs {
				name, ok := agentSkills[ref.ID]
				if !ok {
					continue
				}
				if _, ok := seen[ref.ID]; ok {
					continue
				}
				seen[ref.ID] = struct{}{}
				selected = append(selected, name)
			}

			if len(selected) > 0 {
				b.WriteString("Explicitly selected skills:\n")
				for _, name := range selected {
					fmt.Fprintf(&b, "- %s\n", name)
				}
				b.WriteString("\n")
			}
		}
	}
	fmt.Fprintf(&b, "User message:\n%s\n", task.ChatMessage)
	// List attachments by id + filename so the agent can fetch them via
	// the CLI. We deliberately do NOT inline the URL: chat attachments
	// live behind a signed CDN with a short TTL, so by the time the agent
	// has finished thinking the URL embedded in the markdown body may
	// have expired. `omat attachment download <id>` re-signs at click
	// time and is the only reliable path.
	if len(task.ChatMessageAttachments) > 0 {
		b.WriteString("\nAttachments on this message:\n")
		for _, a := range task.ChatMessageAttachments {
			if a.ContentType != "" {
				fmt.Fprintf(&b, "- id=%s filename=%q content_type=%s\n", a.ID, a.Filename, a.ContentType)
			} else {
				fmt.Fprintf(&b, "- id=%s filename=%q\n", a.ID, a.Filename)
			}
		}
		b.WriteString("Use `omat attachment download <id>` to fetch each file locally before referring to it.\n")
		b.WriteString("When creating an issue that should preserve one of these attachments, pass `--attachment-id <id>` to `omat issue create` in addition to keeping the attachment markdown inline.\n")
	}
	return b.String()
}

// channelDisplayName renders a chat_channel_type for prompt copy.
func channelDisplayName(channelType string) string {
	switch channelType {
	case "slack":
		return "Slack"
	default:
		return channelType
	}
}

// buildAutopilotPrompt constructs a prompt for run_only autopilot tasks.
func buildAutopilotPrompt(task Task) string {
	var b strings.Builder
	b.WriteString("You are running as a local coding agent for a OhMyAgentTeam workspace.\n\n")
	b.WriteString("This task was triggered by an Autopilot in run-only mode. There is no assigned OhMyAgentTeam issue for this run.\n\n")
	fmt.Fprintf(&b, "Autopilot run ID: %s\n", task.AutopilotRunID)
	if task.AutopilotID != "" {
		fmt.Fprintf(&b, "Autopilot ID: %s\n", task.AutopilotID)
	}
	if task.AutopilotTitle != "" {
		fmt.Fprintf(&b, "Autopilot title: %s\n", task.AutopilotTitle)
	}
	if task.AutopilotSource != "" {
		fmt.Fprintf(&b, "Trigger source: %s\n", task.AutopilotSource)
	}
	if strings.TrimSpace(string(task.AutopilotTriggerPayload)) != "" {
		fmt.Fprintf(&b, "Trigger payload:\n%s\n", strings.TrimSpace(string(task.AutopilotTriggerPayload)))
	}
	b.WriteString("\nAutopilot instructions:\n")
	if strings.TrimSpace(task.AutopilotDescription) != "" {
		b.WriteString(task.AutopilotDescription)
		b.WriteString("\n\n")
	} else if task.AutopilotTitle != "" {
		fmt.Fprintf(&b, "%s\n\n", task.AutopilotTitle)
	} else {
		b.WriteString("No additional autopilot instructions were provided. Inspect the autopilot configuration before proceeding.\n\n")
	}
	if task.AutopilotID != "" {
		fmt.Fprintf(&b, "Start by running `omat autopilot get %s --output json` if you need the full autopilot configuration, then complete the instructions above.\n", task.AutopilotID)
	} else {
		b.WriteString("Complete the instructions above.\n")
	}
	b.WriteString("Do not run `omat issue get`; this run does not have an issue ID.\n")
	return b.String()
}
