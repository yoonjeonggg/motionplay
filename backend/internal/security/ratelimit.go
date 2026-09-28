package security

import (
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"motionplay/backend/internal/httpx"
)

// RateLimiter is an in-memory token bucket per key (typically client IP).
// Each key may burst up to `burst` requests, then gets one more every
// `interval`. Good enough for a single instance; multiple instances would
// need a shared store.
type RateLimiter struct {
	burst    float64
	interval time.Duration
	now      func() time.Time

	mu        sync.Mutex
	buckets   map[string]*bucket
	lastPrune time.Time
}

type bucket struct {
	tokens float64
	last   time.Time
}

// idleTTL is how long an untouched bucket is kept. A bucket idle this long
// has fully refilled anyway, so dropping it changes nothing.
const idleTTL = 10 * time.Minute

func NewRateLimiter(burst int, interval time.Duration) *RateLimiter {
	return &RateLimiter{
		burst:    float64(burst),
		interval: interval,
		now:      time.Now,
		buckets:  map[string]*bucket{},
	}
}

// Allow consumes one token for key. When it returns false, retryAfter is how
// long until the next token is available.
func (l *RateLimiter) Allow(key string) (ok bool, retryAfter time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	l.pruneLocked(now)

	b, found := l.buckets[key]
	if !found {
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	} else {
		elapsed := now.Sub(b.last)
		b.tokens = math.Min(l.burst, b.tokens+float64(elapsed)/float64(l.interval))
		b.last = now
	}

	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	wait := time.Duration((1 - b.tokens) * float64(l.interval))
	return false, wait
}

func (l *RateLimiter) pruneLocked(now time.Time) {
	if now.Sub(l.lastPrune) < idleTTL {
		return
	}
	l.lastPrune = now
	for k, b := range l.buckets {
		if now.Sub(b.last) > idleTTL {
			delete(l.buckets, k)
		}
	}
}

// Middleware rejects requests over the limit with 429, keyed by client IP.
// ClientIP only honours X-Forwarded-For from configured trusted proxies, so
// clients can't dodge the limit by forging that header.
func (l *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ok, retryAfter := l.Allow(c.ClientIP())
		if !ok {
			secs := int(math.Ceil(retryAfter.Seconds()))
			c.Header("Retry-After", strconv.Itoa(max(secs, 1)))
			httpx.Error(c, http.StatusTooManyRequests, "too many requests, try again later")
			return
		}
		c.Next()
	}
}
