// Package server wires the HTTP router together.
package server

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"motionplay/backend/internal/auth"
	"motionplay/backend/internal/config"
	"motionplay/backend/internal/creation"
	"motionplay/backend/internal/user"
)

// New builds the gin engine with all routes and middleware registered.
func New(cfg config.Config, db *gorm.DB) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), cors())

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	users := user.NewRepository(db)
	tokens := auth.NewTokenIssuer(cfg.JWTSecret, cfg.JWTTTL)
	authHandler := auth.NewHandler(users, tokens)
	creationHandler := creation.NewHandler(creation.NewRepository(db))

	api := r.Group("/api")
	authHandler.Routes(api.Group("/auth"))
	creationHandler.Routes(api.Group("/creations"), auth.Middleware(tokens))
	creationHandler.PublicRoutes(api.Group("/share"))

	return r
}

// cors allows the local frontend dev servers to call the API.
func cors() gin.HandlerFunc {
	allowed := map[string]bool{
		"http://localhost:5173": true,
		"http://localhost:5174": true,
		"http://localhost:5175": true,
		"http://localhost:5176": true,
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if allowed[strings.TrimSuffix(origin, "/")] {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
			c.Header("Access-Control-Max-Age", "600")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
