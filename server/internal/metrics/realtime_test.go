package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/chenin0931/oh-my-agent-team/server/internal/realtime"
)

func TestRealtimeCollectorExposesCounters(t *testing.T) {
	m := &realtime.Metrics{}
	m.ActiveConnections.Store(3)
	m.MessagesSentTotal.Store(11)
	m.RedisConnected.Store(true)
	m.RedisMirrorPrimaryErrors.Store(2)
	m.RedisMirrorSecondaryErrors.Store(5)

	registry := NewRegistry(RegistryOptions{Realtime: m})
	rec := httptest.NewRecorder()
	NewHandler(registry.Gatherer).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := rec.Body.String()

	for _, want := range []string{
		"omat_realtime_active_connections 3",
		"omat_realtime_messages_sent_total 11",
		"omat_realtime_redis_connected 1",
		`omat_realtime_redis_mirror_errors_total{target="primary"} 2`,
		`omat_realtime_redis_mirror_errors_total{target="secondary"} 5`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("metrics body missing %q\n%s", want, body)
		}
	}
}
