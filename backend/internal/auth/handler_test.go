package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
}

func newFakeStore() *fakeStore {
	return &fakeStore{byID: map[uint]*user.User{}, byEmail: map[string]*user.User{}, nextID: 1}
}

func (f *fakeStore) Create(u *user.User) error {
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
	if u, ok := f.byID[id]; ok {
		return u, nil
	}
	return nil, user.ErrNotFound
}

func (f *fakeStore) EmailTaken(email string) (bool, error) {
	_, ok := f.byEmail[email]
	return ok, nil
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
