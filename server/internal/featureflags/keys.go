package featureflags

import (
	"context"

	"github.com/chenin0931/oh-my-agent-team/server/pkg/featureflag"
)

const (
	// ComposioMCPApps gates the Composio app management UI and — together with
	// the MUL-3963 permission_mode / invocation_targets access model it depends
	// on — the aligned Private / Public-to picker in the agent create flow.
	// The access model exists to gate Composio sharing, so the two ship on the
	// same switch.
	ComposioMCPApps = "composio_mcp_apps"

	// Managed Execution ships in independently reversible layers. Session V2 is
	// the base model/UI; the other flags gate higher-risk protocol behavior.
	AgentSessionsV2           = "agent_sessions_v2"
	AgentActionApprovals      = "agent_action_approvals"
	OutcomeEvaluation         = "outcome_evaluation"
	AgentRuntimePooling       = "agent_runtime_pooling"
	SquadSessionOrchestration = "squad_session_orchestration"
)

var frontendPublicFlags = []string{
	ComposioMCPApps,
	AgentSessionsV2,
	AgentActionApprovals,
	OutcomeEvaluation,
	AgentRuntimePooling,
	SquadSessionOrchestration,
}

var frontendPublicFlagDefaults = map[string]bool{
	ComposioMCPApps:           false,
	AgentSessionsV2:           false,
	AgentActionApprovals:      false,
	OutcomeEvaluation:         false,
	AgentRuntimePooling:       false,
	SquadSessionOrchestration: false,
}

func ComposioMCPAppsEnabled(ctx context.Context, flags *featureflag.Service) bool {
	return flags.IsEnabled(ctx, ComposioMCPApps, false)
}

func AgentSessionsV2Enabled(ctx context.Context, flags *featureflag.Service) bool {
	return flags != nil && flags.IsEnabled(ctx, AgentSessionsV2, false)
}

func AgentActionApprovalsEnabled(ctx context.Context, flags *featureflag.Service) bool {
	return flags != nil && flags.IsEnabled(ctx, AgentActionApprovals, false)
}

func OutcomeEvaluationEnabled(ctx context.Context, flags *featureflag.Service) bool {
	return flags != nil && flags.IsEnabled(ctx, OutcomeEvaluation, false)
}

func AgentRuntimePoolingEnabled(ctx context.Context, flags *featureflag.Service) bool {
	return flags != nil && flags.IsEnabled(ctx, AgentRuntimePooling, false)
}

func SquadSessionOrchestrationEnabled(ctx context.Context, flags *featureflag.Service) bool {
	return flags != nil && flags.IsEnabled(ctx, SquadSessionOrchestration, false)
}

func EvaluateFrontendPublicFlags(ctx context.Context, flags *featureflag.Service) map[string]bool {
	out := make(map[string]bool, len(frontendPublicFlags))
	for _, key := range frontendPublicFlags {
		out[key] = flags.IsEnabled(ctx, key, frontendPublicFlagDefaults[key])
	}
	return out
}
