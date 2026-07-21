import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const agentSessionKeys = {
  all: (workspaceId: string) => ["agent-sessions", workspaceId] as const,
  issue: (workspaceId: string, issueId: string) =>
    [...agentSessionKeys.all(workspaceId), "issue", issueId] as const,
  agent: (workspaceId: string, agentId: string) =>
    [...agentSessionKeys.all(workspaceId), "agent", agentId] as const,
  versions: (workspaceId: string, agentId: string) =>
    [...agentSessionKeys.all(workspaceId), "versions", agentId] as const,
  detail: (workspaceId: string, sessionId: string) =>
    [...agentSessionKeys.all(workspaceId), "detail", sessionId] as const,
  events: (workspaceId: string, sessionId: string) =>
    [...agentSessionKeys.all(workspaceId), "events", sessionId] as const,
};

export function issueAgentSessionsOptions(workspaceId: string, issueId: string) {
  return queryOptions({
    queryKey: agentSessionKeys.issue(workspaceId, issueId),
    queryFn: () => api.listIssueAgentSessions(issueId),
  });
}

export function agentSessionsOptions(workspaceId: string, agentId: string) {
  return queryOptions({
    queryKey: agentSessionKeys.agent(workspaceId, agentId),
    queryFn: () => api.listAgentSessions(agentId),
    enabled: agentId.length > 0,
  });
}

export function agentVersionsOptions(workspaceId: string, agentId: string) {
  return queryOptions({
    queryKey: agentSessionKeys.versions(workspaceId, agentId),
    queryFn: () => api.listAgentVersions(agentId),
    enabled: agentId.length > 0,
  });
}

export function agentSessionOptions(workspaceId: string, sessionId: string) {
  return queryOptions({
    queryKey: agentSessionKeys.detail(workspaceId, sessionId),
    queryFn: () => api.getAgentSession(sessionId),
    enabled: sessionId.length > 0,
  });
}

export function agentSessionEventsOptions(workspaceId: string, sessionId: string) {
  return queryOptions({
    queryKey: agentSessionKeys.events(workspaceId, sessionId),
    queryFn: () => api.listAgentSessionEvents(sessionId, { limit: 300 }),
    enabled: sessionId.length > 0,
  });
}
