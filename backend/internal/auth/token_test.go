package auth

import (
	"testing"
	"time"
)

func TestTokenRoundTrip(t *testing.T) {
	issuer := NewTokenIssuer("test-secret", time.Hour)

	token, err := issuer.Issue(42)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}

	id, err := issuer.Parse(token)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if id != 42 {
		t.Fatalf("got id %d, want 42", id)
	}
}

func TestTokenRejectsWrongSecret(t *testing.T) {
	token, err := NewTokenIssuer("secret-a", time.Hour).Issue(1)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if _, err := NewTokenIssuer("secret-b", time.Hour).Parse(token); err == nil {
		t.Fatal("expected error for token signed with a different secret")
	}
}

func TestTokenRejectsExpired(t *testing.T) {
	issuer := NewTokenIssuer("test-secret", -time.Minute)
	token, err := issuer.Issue(1)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if _, err := issuer.Parse(token); err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestTokenRejectsGarbage(t *testing.T) {
	if _, err := NewTokenIssuer("s", time.Hour).Parse("not-a-jwt"); err == nil {
		t.Fatal("expected error for malformed token")
	}
}
