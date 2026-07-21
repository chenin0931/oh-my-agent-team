package agent

import (
	"context"
	"testing"
)

type capabilityTestBackend struct{}

func (capabilityTestBackend) Execute(context.Context, string, ExecOptions) (*Session, error) {
	return nil, nil
}

func (capabilityTestBackend) Capabilities() BackendCapabilities {
	return BackendCapabilities{Resume: true, Interrupt: true, Sandbox: true}
}

type legacyCapabilityTestBackend struct{}

func (legacyCapabilityTestBackend) Execute(context.Context, string, ExecOptions) (*Session, error) {
	return nil, nil
}

func TestCapabilitiesOfPrefersBackendDeclaration(t *testing.T) {
	got := CapabilitiesOf(capabilityTestBackend{}, "unknown")
	if !got.Resume || !got.Interrupt || !got.Sandbox || got.InteractiveApproval {
		t.Fatalf("unexpected capabilities: %+v", got)
	}
}

func TestCapabilitiesOfUsesConservativeProviderFallback(t *testing.T) {
	got := CapabilitiesOf(legacyCapabilityTestBackend{}, "codex")
	if !got.Resume || got.Interrupt || got.InteractiveApproval || got.Sandbox {
		t.Fatalf("unexpected fallback capabilities: %+v", got)
	}
	unknown := CapabilitiesOf(legacyCapabilityTestBackend{}, "custom")
	if unknown != (BackendCapabilities{}) {
		t.Fatalf("unknown provider must not claim capabilities: %+v", unknown)
	}
}
