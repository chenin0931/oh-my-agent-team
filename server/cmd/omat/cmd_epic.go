package main

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"github.com/chenin0931/oh-my-agent-team/server/internal/cli"
)

var epicCmd = &cobra.Command{Use: "epic", Short: "Plan outcomes with Epic containers"}
var epicListCmd = &cobra.Command{Use: "list", Short: "List Epics", RunE: runEpicList}
var epicGetCmd = &cobra.Command{Use: "get <id>", Short: "Get an Epic planning overview", Args: exactArgs(1), RunE: runEpicGet}
var epicCreateCmd = &cobra.Command{Use: "create", Short: "Create a planned Epic in a project", RunE: runEpicCreate}
var epicUpdateCmd = &cobra.Command{Use: "update <id>", Short: "Update Epic planning fields", Args: exactArgs(1), RunE: runEpicUpdate}
var epicIssuesCmd = &cobra.Command{Use: "issues <id>", Short: "List work items in an Epic", Args: exactArgs(1), RunE: runEpicIssues}
var epicCommentCmd = &cobra.Command{Use: "comment", Short: "Work with Epic planning updates"}
var epicCommentListCmd = &cobra.Command{Use: "list <epic-id>", Short: "List Epic updates", Args: exactArgs(1), RunE: runEpicCommentList}
var epicCommentAddCmd = &cobra.Command{Use: "add <epic-id>", Short: "Add one Epic planning update", Args: exactArgs(1), RunE: runEpicCommentAdd}

func init() {
	epicCmd.AddCommand(epicListCmd, epicGetCmd, epicCreateCmd, epicUpdateCmd, epicIssuesCmd, epicCommentCmd)
	epicCommentCmd.AddCommand(epicCommentListCmd, epicCommentAddCmd)

	epicListCmd.Flags().String("project", "", "Filter by project ID")
	epicListCmd.Flags().String("lifecycle", "", "Filter by lifecycle")
	epicListCmd.Flags().String("query", "", "Search title and goal")
	epicListCmd.Flags().Int("limit", 50, "Maximum Epics to return")
	epicListCmd.Flags().Int("offset", 0, "Epics to skip")
	epicListCmd.Flags().String("output", "table", "Output format: table or json")
	epicListCmd.Flags().Bool("full-id", false, "Show full UUIDs")

	epicGetCmd.Flags().String("output", "json", "Output format: table or json")

	epicCreateCmd.Flags().String("title", "", "Epic title (required)")
	epicCreateCmd.Flags().String("project", "", "Project ID (required)")
	epicCreateCmd.Flags().String("description", "", "Epic goal and scope")
	epicCreateCmd.Flags().Bool("description-stdin", false, "Read Epic goal from stdin")
	epicCreateCmd.Flags().String("description-file", "", "Read Epic goal from a UTF-8 file")
	epicCreateCmd.Flags().String("success-criteria", "", "Success criteria in Markdown")
	epicCreateCmd.Flags().Bool("success-criteria-stdin", false, "Read success criteria from stdin")
	epicCreateCmd.Flags().String("success-criteria-file", "", "Read success criteria from a UTF-8 file")
	epicCreateCmd.Flags().String("health", "", "Health: on_track, at_risk, or off_track")
	epicCreateCmd.Flags().String("priority", "", "Importance: urgent, high, medium, low, or none")
	epicCreateCmd.Flags().String("owner", "", "Planning owner name (member or agent)")
	epicCreateCmd.Flags().String("owner-id", "", "Planning owner UUID (member or agent)")
	epicCreateCmd.Flags().String("start-date", "", "Start date YYYY-MM-DD")
	epicCreateCmd.Flags().String("target-date", "", "Target date YYYY-MM-DD")
	epicCreateCmd.Flags().Bool("allow-duplicate", false, "Allow an active Epic with the same title")
	epicCreateCmd.Flags().String("output", "json", "Output format: table or json")

	epicUpdateCmd.Flags().String("title", "", "New title")
	epicUpdateCmd.Flags().String("description", "", "New goal and scope")
	epicUpdateCmd.Flags().Bool("description-stdin", false, "Read new goal from stdin")
	epicUpdateCmd.Flags().String("description-file", "", "Read new goal from a UTF-8 file")
	epicUpdateCmd.Flags().String("success-criteria", "", "New success criteria")
	epicUpdateCmd.Flags().Bool("success-criteria-stdin", false, "Read success criteria from stdin")
	epicUpdateCmd.Flags().String("success-criteria-file", "", "Read success criteria from a UTF-8 file")
	epicUpdateCmd.Flags().String("lifecycle", "", "planned, in_progress, paused, completed, or cancelled")
	epicUpdateCmd.Flags().String("health", "", "on_track, at_risk, off_track; empty with --clear-health")
	epicUpdateCmd.Flags().Bool("clear-health", false, "Clear health")
	epicUpdateCmd.Flags().String("priority", "", "New importance")
	epicUpdateCmd.Flags().String("owner", "", "New planning owner name")
	epicUpdateCmd.Flags().String("owner-id", "", "New planning owner UUID")
	epicUpdateCmd.Flags().Bool("clear-owner", false, "Remove the planning owner")
	epicUpdateCmd.Flags().String("project", "", "Move the Epic and its work items to another project")
	epicUpdateCmd.Flags().String("start-date", "", "New start date YYYY-MM-DD")
	epicUpdateCmd.Flags().String("target-date", "", "New target date YYYY-MM-DD")
	epicUpdateCmd.Flags().Bool("clear-start-date", false, "Clear start date")
	epicUpdateCmd.Flags().Bool("clear-target-date", false, "Clear target date")
	epicUpdateCmd.Flags().String("output", "json", "Output format: table or json")

	epicIssuesCmd.Flags().String("output", "table", "Output format: table or json")
	epicIssuesCmd.Flags().Bool("full-id", false, "Show full UUIDs")
	epicCommentListCmd.Flags().String("output", "json", "Output format: table or json")
	epicCommentAddCmd.Flags().String("content", "", "Update content")
	epicCommentAddCmd.Flags().Bool("content-stdin", false, "Read update from stdin")
	epicCommentAddCmd.Flags().String("content-file", "", "Read update from a UTF-8 file")
	epicCommentAddCmd.Flags().String("output", "json", "Output format: table or json")
}

func validateEpicLifecycle(value string) error {
	allowed := []string{"planned", "in_progress", "paused", "completed", "cancelled"}
	return validateIssueEnum("lifecycle", value, allowed)
}

func validateEpicHealth(value string) error {
	allowed := []string{"on_track", "at_risk", "off_track"}
	return validateIssueEnum("health", value, allowed)
}

func runEpicList(cmd *cobra.Command, _ []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := cli.APIContext(context.Background())
	defer cancel()
	params := url.Values{}
	if projectRaw, _ := cmd.Flags().GetString("project"); projectRaw != "" {
		project, err := resolveProjectID(ctx, client, projectRaw)
		if err != nil {
			return fmt.Errorf("resolve project: %w", err)
		}
		params.Set("project_id", project.ID)
	}
	if lifecycle, _ := cmd.Flags().GetString("lifecycle"); lifecycle != "" {
		if err := validateEpicLifecycle(lifecycle); err != nil {
			return err
		}
		params.Set("lifecycle", lifecycle)
	}
	if query, _ := cmd.Flags().GetString("query"); query != "" {
		params.Set("q", query)
	}
	limit, _ := cmd.Flags().GetInt("limit")
	offset, _ := cmd.Flags().GetInt("offset")
	params.Set("limit", strconv.Itoa(limit))
	params.Set("offset", strconv.Itoa(offset))
	var response struct {
		Epics []map[string]any `json:"epics"`
		Total int              `json:"total"`
	}
	path := "/api/epics"
	if encoded := params.Encode(); encoded != "" {
		path += "?" + encoded
	}
	if err := client.GetJSON(ctx, path, &response); err != nil {
		return fmt.Errorf("list epics: %w", err)
	}
	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, response)
	}
	fullID, _ := cmd.Flags().GetBool("full-id")
	rows := make([][]string, 0, len(response.Epics))
	for _, epic := range response.Epics {
		rows = append(rows, []string{
			displayID(strVal(epic, "id"), fullID), strVal(epic, "identifier"),
			strVal(epic, "title"), strVal(epic, "lifecycle"), strVal(epic, "health"),
			fmt.Sprintf("%v%%", epic["completion_percent"]),
		})
	}
	cli.PrintTable(os.Stdout, []string{"ID", "KEY", "TITLE", "LIFECYCLE", "HEALTH", "PROGRESS"}, rows)
	return nil
}

func runEpicGet(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := cli.APIContext(context.Background())
	defer cancel()
	ref, err := resolveEpicRef(ctx, client, args[0])
	if err != nil {
		return fmt.Errorf("resolve epic: %w", err)
	}
	var epic map[string]any
	if err := client.GetJSON(ctx, "/api/epics/"+ref.ID, &epic); err != nil {
		return fmt.Errorf("get epic: %w", err)
	}
	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, epic)
	}
	cli.PrintTable(os.Stdout, []string{"KEY", "TITLE", "LIFECYCLE", "HEALTH", "PROGRESS", "TARGET"}, [][]string{{
		strVal(epic, "identifier"), strVal(epic, "title"), strVal(epic, "lifecycle"),
		strVal(epic, "health"), fmt.Sprintf("%v%%", epic["completion_percent"]), strVal(epic, "target_date"),
	}})
	return nil
}

func runEpicCreate(cmd *cobra.Command, _ []string) error {
	title, _ := cmd.Flags().GetString("title")
	projectRaw, _ := cmd.Flags().GetString("project")
	if strings.TrimSpace(title) == "" || projectRaw == "" {
		return fmt.Errorf("--title and --project are required")
	}
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := cli.APIContext(context.Background())
	defer cancel()
	project, err := resolveProjectID(ctx, client, projectRaw)
	if err != nil {
		return fmt.Errorf("resolve project: %w", err)
	}
	body := map[string]any{"title": title, "project_id": project.ID, "lifecycle": "planned"}
	if description, set, err := resolveTextFlag(cmd, "description"); err != nil {
		return err
	} else if set {
		body["description"] = description
	}
	if criteria, set, err := resolveTextFlag(cmd, "success-criteria"); err != nil {
		return err
	} else if set {
		body["success_criteria"] = criteria
	}
	if health, _ := cmd.Flags().GetString("health"); health != "" {
		if err := validateEpicHealth(health); err != nil {
			return err
		}
		body["health"] = health
	}
	if priority, _ := cmd.Flags().GetString("priority"); priority != "" {
		if err := validateIssuePriority(priority); err != nil {
			return err
		}
		body["priority"] = priority
	}
	ownerType, ownerID, hasOwner, err := pickAssigneeFromFlags(ctx, client, cmd, "owner", "owner-id", memberOrAgentKinds)
	if err != nil {
		return fmt.Errorf("resolve owner: %w", err)
	}
	if hasOwner {
		body["owner_type"], body["owner_id"] = ownerType, ownerID
	}
	if value, _ := cmd.Flags().GetString("start-date"); value != "" {
		body["start_date"] = value
	}
	if value, _ := cmd.Flags().GetString("target-date"); value != "" {
		body["target_date"] = value
	}
	if allow, _ := cmd.Flags().GetBool("allow-duplicate"); allow {
		body["allow_duplicate"] = true
	}
	if taskID := os.Getenv("OMAT_QUICK_CREATE_TASK_ID"); taskID != "" {
		body["origin_type"], body["origin_id"] = "quick_create", taskID
	}
	var result map[string]any
	if err := client.PostJSON(ctx, "/api/epics", body, &result); err != nil {
		return fmt.Errorf("create epic: %w", err)
	}
	return printEpicMutation(cmd, result)
}

func runEpicUpdate(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := cli.APIContext(context.Background())
	defer cancel()
	ref, err := resolveEpicRef(ctx, client, args[0])
	if err != nil {
		return fmt.Errorf("resolve epic: %w", err)
	}
	body := map[string]any{}
	for _, field := range []string{"title", "lifecycle", "priority"} {
		if cmd.Flags().Changed(field) {
			value, _ := cmd.Flags().GetString(field)
			body[field] = value
		}
	}
	if value, ok := body["lifecycle"].(string); ok {
		if err := validateEpicLifecycle(value); err != nil {
			return err
		}
	}
	if description, set, err := resolveTextFlag(cmd, "description"); err != nil {
		return err
	} else if set {
		body["description"] = description
	}
	if criteria, set, err := resolveTextFlag(cmd, "success-criteria"); err != nil {
		return err
	} else if set {
		body["success_criteria"] = criteria
	}
	if clear, _ := cmd.Flags().GetBool("clear-health"); clear {
		body["health"] = nil
	} else if cmd.Flags().Changed("health") {
		health, _ := cmd.Flags().GetString("health")
		if err := validateEpicHealth(health); err != nil {
			return err
		}
		body["health"] = health
	}
	if clear, _ := cmd.Flags().GetBool("clear-owner"); clear {
		body["owner_type"], body["owner_id"] = nil, nil
	} else {
		ownerType, ownerID, hasOwner, err := pickAssigneeFromFlags(ctx, client, cmd, "owner", "owner-id", memberOrAgentKinds)
		if err != nil {
			return fmt.Errorf("resolve owner: %w", err)
		}
		if hasOwner {
			body["owner_type"], body["owner_id"] = ownerType, ownerID
		}
	}
	if projectRaw, _ := cmd.Flags().GetString("project"); projectRaw != "" {
		project, err := resolveProjectID(ctx, client, projectRaw)
		if err != nil {
			return fmt.Errorf("resolve project: %w", err)
		}
		body["project_id"] = project.ID
	}
	if clear, _ := cmd.Flags().GetBool("clear-start-date"); clear {
		body["start_date"] = nil
	} else if cmd.Flags().Changed("start-date") {
		body["start_date"], _ = cmd.Flags().GetString("start-date")
	}
	if clear, _ := cmd.Flags().GetBool("clear-target-date"); clear {
		body["target_date"] = nil
	} else if cmd.Flags().Changed("target-date") {
		body["target_date"], _ = cmd.Flags().GetString("target-date")
	}
	if len(body) == 0 {
		return fmt.Errorf("no Epic fields to update")
	}
	var result map[string]any
	if err := client.PutJSON(ctx, "/api/epics/"+ref.ID, body, &result); err != nil {
		return fmt.Errorf("update epic: %w", err)
	}
	return printEpicMutation(cmd, result)
}

func printEpicMutation(cmd *cobra.Command, epic map[string]any) error {
	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		cli.PrintTable(os.Stdout, []string{"KEY", "TITLE", "LIFECYCLE", "HEALTH"}, [][]string{{
			strVal(epic, "identifier"), strVal(epic, "title"), strVal(epic, "lifecycle"), strVal(epic, "health"),
		}})
		return nil
	}
	return cli.PrintJSON(os.Stdout, epic)
}

func runEpicIssues(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := cli.APIContext(context.Background())
	defer cancel()
	ref, err := resolveEpicRef(ctx, client, args[0])
	if err != nil {
		return fmt.Errorf("resolve epic: %w", err)
	}
	var response struct {
		Issues []map[string]any `json:"issues"`
	}
	if err := client.GetJSON(ctx, "/api/epics/"+ref.ID+"/work-items", &response); err != nil {
		return fmt.Errorf("list epic issues: %w", err)
	}
	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, response.Issues)
	}
	fullID, _ := cmd.Flags().GetBool("full-id")
	rows := make([][]string, 0, len(response.Issues))
	for _, issue := range response.Issues {
		rows = append(rows, []string{displayID(strVal(issue, "id"), fullID), strVal(issue, "identifier"), strVal(issue, "issue_type"), strVal(issue, "title"), strVal(issue, "status")})
	}
	cli.PrintTable(os.Stdout, []string{"ID", "KEY", "TYPE", "TITLE", "STATUS"}, rows)
	return nil
}

func runEpicCommentList(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := cli.APIContext(context.Background())
	defer cancel()
	ref, err := resolveEpicRef(ctx, client, args[0])
	if err != nil {
		return fmt.Errorf("resolve epic: %w", err)
	}
	var comments []map[string]any
	if err := client.GetJSON(ctx, "/api/epics/"+ref.ID+"/comments", &comments); err != nil {
		return fmt.Errorf("list epic comments: %w", err)
	}
	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, comments)
	}
	rows := make([][]string, 0, len(comments))
	for _, comment := range comments {
		rows = append(rows, []string{strVal(comment, "id"), strVal(comment, "author_type"), strVal(comment, "content"), strVal(comment, "created_at")})
	}
	cli.PrintTable(os.Stdout, []string{"ID", "AUTHOR", "CONTENT", "CREATED"}, rows)
	return nil
}

func runEpicCommentAdd(cmd *cobra.Command, args []string) error {
	content, set, err := resolveTextFlag(cmd, "content")
	if err != nil {
		return err
	}
	if !set {
		return fmt.Errorf("--content, --content-stdin, or --content-file is required")
	}
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := cli.APIContext(context.Background())
	defer cancel()
	ref, err := resolveEpicRef(ctx, client, args[0])
	if err != nil {
		return fmt.Errorf("resolve epic: %w", err)
	}
	var result map[string]any
	if err := client.PostJSON(ctx, "/api/epics/"+ref.ID+"/comments", map[string]any{"content": content}, &result); err != nil {
		return fmt.Errorf("add epic comment: %w", err)
	}
	output, _ := cmd.Flags().GetString("output")
	if output == "table" {
		fmt.Fprintf(os.Stderr, "Planning update added to Epic %s.\n", ref.Display)
		return nil
	}
	return cli.PrintJSON(os.Stdout, result)
}
