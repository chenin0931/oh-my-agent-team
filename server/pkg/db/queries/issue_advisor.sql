-- name: CreateIssueAdvisorInvocation :one
INSERT INTO issue_advisor_invocation (
    issue_id, workspace_id, assignee_user_id, agent_id
)
VALUES ($1, $2, $3, $4)
ON CONFLICT (issue_id, assignee_user_id, agent_id) DO NOTHING
RETURNING *;

-- name: SetIssueAdvisorInvocationTask :exec
UPDATE issue_advisor_invocation
SET task_id = $4
WHERE issue_id = $1
  AND assignee_user_id = $2
  AND agent_id = $3;
