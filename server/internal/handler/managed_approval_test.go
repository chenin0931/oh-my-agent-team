package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/chenin0931/oh-my-agent-team/server/pkg/db/generated"
)

func TestResolveManagedIssueUpdateAction(t *testing.T) {
	tests := []struct {
		name string
		body string
		want string
	}{
		{name: "progress", body: `{"status":"in_progress"}`, want: "issue.status.own"},
		{name: "review", body: `{"status":"in_review"}`, want: "issue.status.review"},
		{name: "human final done", body: `{"status":"done"}`, want: "issue.status.finalize"},
		{name: "human final cancelled", body: `{"status":"cancelled"}`, want: "issue.status.finalize"},
		{name: "reassignment", body: `{"assignee_id":"00000000-0000-0000-0000-000000000001"}`, want: "issue.assignee"},
		{name: "business fields", body: `{"title":"Updated"}`, want: "workspace.write"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPut, "/managed-policy-probe", nil)
			got := (&Handler{}).resolveManagedAction(r, db.AgentTaskQueue{}, "issue.update", []byte(tt.body))
			if got != tt.want {
				t.Fatalf("action = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCanDecideManagedSessionApproval(t *testing.T) {
	owner := pgtype.UUID{Bytes: [16]byte{1}, Valid: true}
	other := pgtype.UUID{Bytes: [16]byte{2}, Valid: true}
	session := db.AgentSession{CreatedBy: owner}
	if !canDecideManagedSessionApproval(session, owner, "member") {
		t.Fatal("session owner should decide approval")
	}
	if canDecideManagedSessionApproval(session, other, "member") {
		t.Fatal("unrelated member must not decide approval")
	}
	if !canDecideManagedSessionApproval(session, other, "admin") {
		t.Fatal("workspace admin should decide approval")
	}
}

func TestManagedThreadCanRouteComment(t *testing.T) {
	parent := pgtype.UUID{Bytes: [16]byte{3}, Valid: true}
	for _, tt := range []struct {
		name   string
		thread db.AgentSessionThread
		want   bool
	}{
		{name: "primary executor", thread: db.AgentSessionThread{Role: "executor"}, want: true},
		{name: "coordinator", thread: db.AgentSessionThread{Role: "coordinator"}, want: true},
		{name: "advisor", thread: db.AgentSessionThread{Role: "advisor"}, want: false},
		{name: "reviewer", thread: db.AgentSessionThread{Role: "reviewer"}, want: false},
		{name: "delegated worker", thread: db.AgentSessionThread{Role: "executor", ParentThreadID: parent}, want: false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := managedThreadCanRouteComment(tt.thread); got != tt.want {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCanViewManagedSessionEvent(t *testing.T) {
	owner := pgtype.UUID{Bytes: [16]byte{1}, Valid: true}
	other := pgtype.UUID{Bytes: [16]byte{2}, Valid: true}
	session := db.AgentSession{CreatedBy: owner}
	if !canViewManagedSessionEvent("workspace", session, other, "member") {
		t.Fatal("workspace event should be visible to members")
	}
	if canViewManagedSessionEvent("owner", session, other, "member") {
		t.Fatal("owner event leaked to unrelated member")
	}
	if !canViewManagedSessionEvent("participants", session, owner, "member") {
		t.Fatal("session owner should see participant events")
	}
	if !canViewManagedSessionEvent("owner", session, other, "admin") {
		t.Fatal("workspace admin should see governed events")
	}
	if canViewManagedSessionEvent("system", session, owner, "owner") {
		t.Fatal("system-only event should never be exposed")
	}
}
