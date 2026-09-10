package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"motionplay/backend/internal/httpx"
)

const contextUserID = "userID"

// Middleware rejects requests without a valid bearer token and stores the
// authenticated user ID in the gin context.
func Middleware(tokens *TokenIssuer) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		token, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || token == "" {
			httpx.Error(c, http.StatusUnauthorized, "missing bearer token")
			return
		}
		id, err := tokens.Parse(token)
		if err != nil {
			httpx.Error(c, http.StatusUnauthorized, "invalid or expired token")
			return
		}
		c.Set(contextUserID, id)
		c.Next()
	}
}

// UserID returns the authenticated user ID set by Middleware.
func UserID(c *gin.Context) (uint, bool) {
	v, ok := c.Get(contextUserID)
	if !ok {
		return 0, false
	}
	id, ok := v.(uint)
	return id, ok
}
