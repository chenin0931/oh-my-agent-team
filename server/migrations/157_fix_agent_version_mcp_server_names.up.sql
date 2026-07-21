-- Migration 155 captured the top-level `mcpServers` key instead of the names
-- inside that object. Repair snapshots created before the claim-side filter
-- shipped. Credentials remain in agent.mcp_config and are never copied here.
UPDATE agent_version v
SET tool_config = jsonb_set(
    v.tool_config,
    '{mcp_server_names}',
    COALESCE(
        (
            SELECT jsonb_agg(server_name ORDER BY server_name)
            FROM jsonb_object_keys(COALESCE(a.mcp_config->'mcpServers', '{}'::jsonb)) AS server_name
        ),
        '[]'::jsonb
    ),
    TRUE
)
FROM agent a
WHERE a.id = v.agent_id
  AND v.tool_config ? 'mcp_server_names';
