// Package security holds HTTP hardening middleware shared by all routes:
// response security headers, request body limits and per-client rate limits.
package security

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Headers sets conservative security headers. The API only ever returns JSON,
// so it can forbid framing, sniffing and caching outright.
func Headers() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		h.Set("Cross-Origin-Resource-Policy", "same-site")
		// Responses carry tokens and private creations; never let a shared
		// cache or the browser's back/forward cache keep them.
		h.Set("Cache-Control", "no-store")
		c.Next()
	}
}

// BodyLimit caps request bodies at maxBytes. Reads past the limit fail, so
// JSON binding rejects oversized payloads instead of buffering them.
func BodyLimit(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		c.Next()
	}
}
