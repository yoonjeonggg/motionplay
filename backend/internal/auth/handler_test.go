package auth

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"motionplay/backend/internal/user"
)

// fakeStore is an in-memory UserStore for handler tests.
type fakeStore struct {
	byID    map[uint]*user.User
	byEmail map[string]*user.User
	nextID  uint
	// lookupErr, when set, makes ByID fail as a database outage would.
	lookupErr error
}

func newFakeStore() *fakeStore {
	return &fakeStore{byID: map[uint]*user.User{}, byEmail: map[string]*user.User{}, nextID: 1}
}

func (f *fakeStore) Create(u *user.User) error {
	if _, taken := f.byEmail[u.Email]; taken {
		return user.ErrEmailTaken
	}
	u.ID = f.nextID
	f.nextID++
	u.CreatedAt = time.Now()
	u.UpdatedAt = u.CreatedAt
	f.byID[u.ID] = u
	f.byEmail[u.Email] = u
	return nil
}

func (f *fakeStore) ByEmail(email string) (*user.User, error) {
	if u, ok := f.byEmail[email]; ok {
		return u, nil
	}
	return nil, user.ErrNotFound
}

func (f *fakeStore) ByID(id uint) (*user.User, error) {
	if f.lookupErr != nil {
		return nil, f.lookupErr
	}
	if u, ok := f.byID[id]; ok {
		return u, nil
	}
	return nil, user.ErrNotFound
}

func newTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := NewHandler(newFakeStore(), NewTokenIssuer("test-secret", time.Hour))
	r := gin.New()
	h.Routes(r.Group("/auth"))
	return r
}

func doJSON(t *testing.T, r http.Handler, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestSignupLoginMeFlow(t *testing.T) {
	r := newTestRouter()
	creds := gin.H{"email": "Player@Example.com", "password": "hunter2hunter2"}

	// signup
	rec := doJSON(t, r, http.MethodPost, "/auth/signup", "", creds)
	if rec.Code != http.StatusCreated {
		t.Fatalf("signup status %d: %s", rec.Code, rec.Body)
	}
	var signup authResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &signup); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if signup.Token == "" || signup.User.Email != "player@example.com" {
		t.Fatalf("unexpected signup response: %+v", signup)
	}

	// duplicate signup -> 409
	if rec := doJSON(t, r, http.MethodPost, "/auth/signup", "", creds); rec.Code != http.StatusConflict {
		t.Fatalf("duplicate signup status %d", rec.Code)
	}

	// login with correct + wrong password
	if rec := doJSON(t, r, http.MethodPost, "/auth/login", "", creds); rec.Code != http.StatusOK {
		t.Fatalf("login status %d: %s", rec.Code, rec.Body)
	}
	bad := gin.H{"email": creds["email"], "password": "wrongwrong"}
	if rec := doJSON(t, r, http.MethodPost, "/auth/login", "", bad); rec.Code != http.StatusUnauthorized {
		t.Fatalf("bad login status %d", rec.Code)
	}

	// me with and without token
	if rec := doJSON(t, r, http.MethodGet, "/auth/me", signup.Token, nil); rec.Code != http.StatusOK {
		t.Fatalf("me status %d: %s", rec.Code, rec.Body)
	}
	if rec := doJSON(t, r, http.MethodGet, "/auth/me", "", nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("me without token status %d", rec.Code)
	}
}

func TestSignupRejectsShortPassword(t *testing.T) {
	r := newTestRouter()
	rec := doJSON(t, r, http.MethodPost, "/auth/signup", "", gin.H{"email": "a@b.com", "password": "short"})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d, want 400", rec.Code)
	}
}

func TestLoginUnknownEmailMatchesWrongPassword(t *testing.T) {
	r := newTestRouter()
	creds := gin.H{"email": "known@example.com", "password": "hunter2hunter2"}
	doJSON(t, r, http.MethodPost, "/auth/signup", "", creds)

	unknown := doJSON(t, r, http.MethodPost, "/auth/login", "", gin.H{"email": "nobody@example.com", "password": "hunter2hunter2"})
	wrong := doJSON(t, r, http.MethodPost, "/auth/login", "", gin.H{"email": "known@example.com", "password": "wrongwrong"})
	if unknown.Code != http.StatusUnauthorized || wrong.Code != http.StatusUnauthorized {
		t.Fatalf("statuses unknown=%d wrong=%d, want 401/401", unknown.Code, wrong.Code)
	}
	if unknown.Body.String() != wrong.Body.String() {
		t.Fatalf("responses differ: %s vs %s", unknown.Body, wrong.Body)
	}
}

func TestSignupRejectsPasswordOverBcryptLimit(t *testing.T) {
	r := newTestRouter()
	// 30 runes passes a rune-counted max=72, but is 90 bytes: past what
	// bcrypt accepts, which used to surface as a 500.
	long := strings.Repeat("가", 30)
	rec := doJSON(t, r, http.MethodPost, "/auth/signup", "", gin.H{"email": "a@b.com", "password": long})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d, want 400 (%s)", rec.Code, rec.Body)
	}
}

func TestMeReportsStoreFailureAsServerError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := newFakeStore()
	tokens := NewTokenIssuer("test-secret", time.Hour)
	r := gin.New()
	NewHandler(store, tokens).Routes(r.Group("/auth"))
	token, err := tokens.Issue(1)
	if err != nil {
		t.Fatal(err)
	}

	// A deleted account is a 401: the token no longer maps to anyone.
	if rec := doJSON(t, r, http.MethodGet, "/auth/me", token, nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("missing user status %d, want 401", rec.Code)
	}
	// An outage is not: a 401 would make the client discard a valid login.
	store.lookupErr = errors.New("connection refused")
	if rec := doJSON(t, r, http.MethodGet, "/auth/me", token, nil); rec.Code != http.StatusInternalServerError {
		t.Fatalf("store failure status %d, want 500", rec.Code)
	}
}
