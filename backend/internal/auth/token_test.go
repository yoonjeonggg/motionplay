package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
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

func TestTokenRejectsOtherAlgorithmsAndMissingExpiry(t *testing.T) {
	secret := []byte("test-secret")
	issuer := NewTokenIssuer(string(secret), time.Hour)
	exp := jwt.NewNumericDate(time.Now().Add(time.Hour))

	// Same secret, but HS512 instead of the HS256 we issue.
	hs512, err := jwt.NewWithClaims(jwt.SigningMethodHS512, jwt.RegisteredClaims{Subject: "1", ExpiresAt: exp}).SignedString(secret)
	if err != nil {
		t.Fatal(err)
	}
	// Unsigned "alg: none" token.
	none, err := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.RegisteredClaims{Subject: "1", ExpiresAt: exp}).SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatal(err)
	}
	// Correctly signed but never expires.
	noExp, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{Subject: "1"}).SignedString(secret)
	if err != nil {
		t.Fatal(err)
	}

	for name, tok := range map[string]string{"HS512": hs512, "none": none, "no exp": noExp} {
		if _, err := issuer.Parse(tok); err == nil {
			t.Errorf("%s token was accepted", name)
		}
	}
}
