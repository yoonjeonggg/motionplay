package config

import (
	"slices"
	"strings"
	"testing"
)

func TestValidateJWTSecret(t *testing.T) {
	cases := map[string]bool{
		"change-me":             false,
		"CHANGE-ME":             false,
		"short":                 false,
		strings.Repeat("a", 31): false,
		strings.Repeat("a", 32): true,
	}
	for secret, wantOK := range cases {
		if err := validateJWTSecret(secret); (err == nil) != wantOK {
			t.Errorf("validateJWTSecret(%q) err=%v, wantOK=%v", secret, err, wantOK)
		}
	}
}

func TestLoadRejectsPlaceholderSecret(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("JWT_SECRET", "change-me")
	if _, err := Load(); err == nil {
		t.Fatal("Load accepted the placeholder JWT secret")
	}
}

func TestLoadParsesLists(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("JWT_SECRET", strings.Repeat("k", 40))
	t.Setenv("CORS_ORIGINS", " https://a.example/ ,, https://b.example")
	t.Setenv("TRUSTED_PROXIES", "10.0.0.0/8")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(cfg.CORSOrigins, []string{"https://a.example", "https://b.example"}) {
		t.Fatalf("CORSOrigins = %v", cfg.CORSOrigins)
	}
	if !slices.Equal(cfg.TrustedProxies, []string{"10.0.0.0/8"}) {
		t.Fatalf("TrustedProxies = %v", cfg.TrustedProxies)
	}
}
