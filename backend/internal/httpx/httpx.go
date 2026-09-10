// Package httpx has small helpers for consistent JSON responses.
package httpx

import "github.com/gin-gonic/gin"

// Error writes {"error": message} with the given status.
func Error(c *gin.Context, status int, message string) {
	c.AbortWithStatusJSON(status, gin.H{"error": message})
}
