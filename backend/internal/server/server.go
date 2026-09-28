// Package server wires the HTTP router together.
package server

import (
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"motionplay/backend/internal/auth"
	"motionplay/backend/internal/config"
	"motionplay/backend/internal/creation"
	"motionplay/backend/internal/security"
	"motionplay/backend/internal/user"
)

const (
	// maxBodyBytes comfortably fits the largest valid request (a creation
	// with the maximum 200 toppings is ~12 KB of JSON).
	maxBodyBytes = 64 << 10

	// Auth endpoints run bcrypt and are the brute-force target: allow a short
	// burst, then one attempt every 6s (~10/min) per client IP.
	authBurst    = 10
	authInterval = 6 * time.Second

	// Everything else gets a looser per-IP ceiling against scraping/floods.
	apiBurst    = 120
	apiInterval = 250 * time.Millisecond
)

// New builds the gin engine with all routes and middleware registered.
func New(cfg config.Config, db *gorm.DB) (*gin.Engine, error) {
	r := gin.New()
	// Without this gin trusts X-Forwarded-For from anyone, which would let a
	// client pick its own IP and sidestep the rate limits.
	if err := r.SetTrustedProxies(cfg.TrustedProxies); err != nil {
		return nil, err
	}
	r.Use(
		gin.Logger(),
		gin.Recovery(),
		security.Headers(),
		cors(cfg.CORSOrigins),
		security.BodyLimit(maxBodyBytes),
	)

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	users := user.NewRepository(db)
	tokens := auth.NewTokenIssuer(cfg.JWTSecret, cfg.JWTTTL)
	authHandler := auth.NewHandler(users, tokens)
	creationHandler := creation.NewHandler(creation.NewRepository(db))

	api := r.Group("/api", security.NewRateLimiter(apiBurst, apiInterval).Middleware())
	authHandler.Routes(api.Group("/auth"), security.NewRateLimiter(authBurst, authInterval).Middleware())
	creationHandler.Routes(api.Group("/creations"), auth.Middleware(tokens))
	creationHandler.PublicRoutes(api.Group("/share"))

	return r, nil
}

// cors allows the configured frontend origins to call the API.
func cors(origins []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// The response differs per Origin, so caches must key on it —
		// otherwise one origin's allow header can be served to another.
		c.Writer.Header().Add("Vary", "Origin")
		origin := c.GetHeader("Origin")
		if slices.Contains(origins, strings.TrimSuffix(origin, "/")) {
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
