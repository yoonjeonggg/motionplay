// Package config loads runtime configuration from the environment, with an
// optional .env file for local development.
package config

import (
	"bufio"
	"fmt"
	"os"
	"strings"
	"time"
)

type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
	JWTTTL      time.Duration
	// CORSOrigins are the browser origins allowed to call the API.
	CORSOrigins []string
	// TrustedProxies are the proxy IPs/CIDRs whose X-Forwarded-For is
	// believed. Empty means the direct peer address is the client IP.
	TrustedProxies []string
}

// minJWTSecretLen is the shortest HS256 key accepted: 32 bytes matches the
// hash output size, below which the key is the weakest link.
const minJWTSecretLen = 32

// weakJWTSecrets are placeholder values that must never reach a real server.
var weakJWTSecrets = map[string]bool{
	"change-me": true,
	"changeme":  true,
	"secret":    true,
}

var defaultCORSOrigins = []string{
	"http://localhost:5173",
	"http://localhost:5174",
	"http://localhost:5175",
	"http://localhost:5176",
}

// Load reads .env (if present) into the process environment, then builds a
// Config. It returns an error when a required value is missing.
func Load() (Config, error) {
	loadDotEnv(".env")

	cfg := Config{
		Port:           getenv("PORT", "8080"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		JWTSecret:      os.Getenv("JWT_SECRET"),
		JWTTTL:         7 * 24 * time.Hour,
		CORSOrigins:    splitList(os.Getenv("CORS_ORIGINS")),
		TrustedProxies: splitList(os.Getenv("TRUSTED_PROXIES")),
	}
	if len(cfg.CORSOrigins) == 0 {
		cfg.CORSOrigins = defaultCORSOrigins
	}

	var missing []string
	if cfg.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if cfg.JWTSecret == "" {
		missing = append(missing, "JWT_SECRET")
	}
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("missing required env: %s", strings.Join(missing, ", "))
	}
	if err := validateJWTSecret(cfg.JWTSecret); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// validateJWTSecret refuses short or placeholder secrets: anyone who guesses
// the key can mint a token for any user.
func validateJWTSecret(secret string) error {
	if weakJWTSecrets[strings.ToLower(secret)] || len(secret) < minJWTSecretLen {
		return fmt.Errorf(
			"JWT_SECRET must be a random value of at least %d characters (e.g. `openssl rand -base64 48`)",
			minJWTSecretLen,
		)
	}
	return nil
}

// splitList parses a comma-separated env value, dropping blanks and any
// trailing slash on origins.
func splitList(v string) []string {
	var out []string
	for _, part := range strings.Split(v, ",") {
		part = strings.TrimSuffix(strings.TrimSpace(part), "/")
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// loadDotEnv parses a simple KEY=VALUE file. Existing environment variables win,
// so real env always overrides the file. Missing file is not an error.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}
}
