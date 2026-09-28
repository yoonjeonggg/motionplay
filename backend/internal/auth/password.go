package auth

import "golang.org/x/crypto/bcrypt"

// dummyHash is compared against when a login names an unknown email, so that
// path costs the same bcrypt work as a wrong password for a real account.
var dummyHash = func() string {
	h, err := hashPassword("motionplay-timing-equaliser")
	if err != nil {
		panic(err)
	}
	return h
}()

// hashPassword returns a bcrypt hash suitable for storage.
func hashPassword(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	return string(b), err
}

// checkPassword reports whether plain matches the stored hash.
func checkPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}
