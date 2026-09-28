package security

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestRateLimiterBurstThenRefill(t *testing.T) {
	now := time.Unix(0, 0)
	l := NewRateLimiter(3, time.Second)
	l.now = func() time.Time { return now }

	for i := range 3 {
		if ok, _ := l.Allow("a"); !ok {
			t.Fatalf("request %d within burst was rejected", i)
		}
	}
	ok, retry := l.Allow("a")
	if ok {
		t.Fatal("request over burst was allowed")
	}
	if retry <= 0 || retry > time.Second {
		t.Fatalf("retryAfter = %v, want (0, 1s]", retry)
	}

	// other keys are independent
	if ok, _ := l.Allow("b"); !ok {
		t.Fatal("separate key was limited")
	}

	now = now.Add(time.Second)
	if ok, _ := l.Allow("a"); !ok {
		t.Fatal("token did not refill after interval")
	}
	if ok, _ := l.Allow("a"); ok {
		t.Fatal("refilled more than one token")
	}
}

func TestRateLimiterPrunesIdleBuckets(t *testing.T) {
	now := time.Unix(0, 0)
	l := NewRateLimiter(1, time.Second)
	l.now = func() time.Time { return now }

	l.Allow("a")
	now = now.Add(idleTTL + time.Second)
	l.Allow("b")
	if _, found := l.buckets["a"]; found {
		t.Fatal("idle bucket was not pruned")
	}
}

func TestRateLimitMiddlewareReturns429(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(NewRateLimiter(1, time.Minute).Middleware())
	r.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })

	do := func() *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
		return rec
	}
	if rec := do(); rec.Code != http.StatusOK {
		t.Fatalf("first status %d", rec.Code)
	}
	rec := do()
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("second status %d, want 429", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Fatal("missing Retry-After header")
	}
}

func TestBodyLimitRejectsOversizedJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(BodyLimit(32))
	r.POST("/", func(c *gin.Context) {
		var v map[string]any
		if err := c.ShouldBindJSON(&v); err != nil {
			c.Status(http.StatusBadRequest)
			return
		}
		c.Status(http.StatusOK)
	})

	big := `{"k":"` + strings.Repeat("x", 100) + `"}`
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(big)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("oversized body status %d, want 400", rec.Code)
	}

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"k":"v"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("small body status %d, want 200", rec.Code)
	}
}

func TestHeadersSet(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(Headers())
	r.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	for _, h := range []string{"X-Content-Type-Options", "X-Frame-Options", "Cache-Control"} {
		if rec.Header().Get(h) == "" {
			t.Errorf("missing %s", h)
		}
	}
}
