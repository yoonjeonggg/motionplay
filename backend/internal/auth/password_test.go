package auth

import "testing"

func TestPasswordHashAndCheck(t *testing.T) {
	hash, err := hashPassword("correct horse battery")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if hash == "correct horse battery" {
		t.Fatal("password stored in plain text")
	}
	if !checkPassword(hash, "correct horse battery") {
		t.Fatal("valid password rejected")
	}
	if checkPassword(hash, "wrong password") {
		t.Fatal("wrong password accepted")
	}
}
