package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"motionplay/backend/internal/config"
)

func testServer(t *testing.T) http.Handler {
	t.Helper()
	gin.SetMode(gin.TestMode)
	// No database: these tests only hit middleware and requests rejected
	// before any handler touches storage.
	r, err := New(config.Config{
		JWTSecret:   strings.Repeat("k", 40),
		JWTTTL:      time.Hour,
		CORSOrigins: []string{"http://localhost:5173"},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func TestCORSAllowsOnlyConfiguredOrigins(t *testing.T) {
	h := testServer(t)
	for origin, allowed := range map[string]bool{
		"http://localhost:5173": true,
		"https://evil.example":  false,
	} {
		req := httptest.NewRequest(http.MethodOptions, "/api/creations", nil)
		req.Header.Set("Origin", origin)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		got := rec.Header().Get("Access-Control-Allow-Origin")
		if allowed && got != origin || !allowed && got != "" {
			t.Errorf("origin %s: Allow-Origin=%q", origin, got)
		}
		if rec.Header().Get("Vary") != "Origin" {
			t.Errorf("origin %s: missing Vary: Origin", origin)
		}
	}
}

func TestSecurityHeadersOnEveryResponse(t *testing.T) {
	rec := httptest.NewRecorder()
	testServer(t).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("missing security headers: %v", rec.Header())
	}
}

func TestLoginRateLimitIgnoresForgedForwardedFor(t *testing.T) {
	h := testServer(t)
	var last int
	for i := range authBurst + 1 {
		// Invalid body -> 400 without touching the database, but still
		// counted by the limiter. A fresh X-Forwarded-For each time must not
		// reset the limit, since no proxies are trusted.
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Forwarded-For", "203.0.113."+string(rune('0'+i%10)))
		req.RemoteAddr = "198.51.100.7:1234"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		last = rec.Code
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("request %d status %d, want 429", authBurst+1, last)
	}
}

func TestShareRejectsMalformedSlugWithoutDB(t *testing.T) {
	rec := httptest.NewRecorder()
	testServer(t).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/share/..%2Fcreations", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status %d, want 404", rec.Code)
	}
}
