package creation

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"motionplay/backend/internal/auth"
)

type fakeStore struct {
	items  map[uint]*Creation
	nextID uint
}

func newFakeStore() *fakeStore {
	return &fakeStore{items: map[uint]*Creation{}, nextID: 1}
}

func (f *fakeStore) Create(c *Creation) error {
	c.ID = f.nextID
	f.nextID++
	c.CreatedAt = time.Now()
	c.UpdatedAt = c.CreatedAt
	copy := *c
	f.items[c.ID] = &copy
	return nil
}

func (f *fakeStore) ListByUser(userID uint) ([]Creation, error) {
	var out []Creation
	for _, c := range f.items {
		if c.UserID == userID {
			out = append(out, *c)
		}
	}
	return out, nil
}

func (f *fakeStore) ByIDForUser(id, userID uint) (*Creation, error) {
	if c, ok := f.items[id]; ok && c.UserID == userID {
		copy := *c
		return &copy, nil
	}
	return nil, ErrNotFound
}

func (f *fakeStore) Update(c *Creation) error {
	if _, ok := f.items[c.ID]; !ok {
		return ErrNotFound
	}
	copy := *c
	copy.UpdatedAt = time.Now()
	f.items[c.ID] = &copy
	return nil
}

func (f *fakeStore) Delete(id, userID uint) error {
	if c, ok := f.items[id]; ok && c.UserID == userID {
		delete(f.items, id)
		return nil
	}
	return ErrNotFound
}

func newTestRig(t *testing.T) (*gin.Engine, func(userID uint) string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	issuer := auth.NewTokenIssuer("test-secret", time.Hour)
	h := NewHandler(newFakeStore())
	r := gin.New()
	h.Routes(r.Group("/creations"), auth.Middleware(issuer))
	return r, func(userID uint) string {
		tok, err := issuer.Issue(userID)
		if err != nil {
			t.Fatalf("issue token: %v", err)
		}
		return tok
	}
}

func req(t *testing.T, r http.Handler, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	rq := httptest.NewRequest(method, path, &buf)
	rq.Header.Set("Content-Type", "application/json")
	if token != "" {
		rq.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, rq)
	return rec
}

func TestCreationCRUDAndOwnership(t *testing.T) {
	r, tokenFor := newTestRig(t)
	alice := tokenFor(1)
	bob := tokenFor(2)

	body := gin.H{
		"title":    "  Galaxy Goo  ",
		"color":    0x7cf29c,
		"softness": 0.6,
		"toppings": []gin.H{{"kind": "star", "x": 0.5, "y": 0.4}},
	}

	// create as alice
	rec := req(t, r, http.MethodPost, "/creations", alice, body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create status %d: %s", rec.Code, rec.Body)
	}
	var created struct {
		Creation Creation `json:"creation"`
	}
	mustDecode(t, rec, &created)
	if created.Creation.Title != "Galaxy Goo" || len(created.Creation.Toppings) != 1 {
		t.Fatalf("unexpected created: %+v", created.Creation)
	}
	id := created.Creation.ID

	// alice lists hers, bob lists none
	if rec := req(t, r, http.MethodGet, "/creations", alice, nil); !bodyHasCount(t, rec, 1) {
		t.Fatalf("alice list: %s", rec.Body)
	}
	if rec := req(t, r, http.MethodGet, "/creations", bob, nil); !bodyHasCount(t, rec, 0) {
		t.Fatalf("bob list: %s", rec.Body)
	}

	// bob cannot read alice's creation
	if rec := req(t, r, http.MethodGet, "/creations/1", bob, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("bob get alice's: %d", rec.Code)
	}

	// alice updates
	body["title"] = "Galaxy Goo v2"
	body["softness"] = 0.2
	if rec := req(t, r, http.MethodPut, "/creations/1", alice, body); rec.Code != http.StatusOK {
		t.Fatalf("update status %d: %s", rec.Code, rec.Body)
	}

	// alice deletes, then it's gone
	if rec := req(t, r, http.MethodDelete, "/creations/1", alice, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("delete status %d", rec.Code)
	}
	if rec := req(t, r, http.MethodGet, "/creations/1", alice, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("get after delete %d", rec.Code)
	}
	_ = id
}

func TestCreationRequiresAuth(t *testing.T) {
	r, _ := newTestRig(t)
	if rec := req(t, r, http.MethodGet, "/creations", "", nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("status %d, want 401", rec.Code)
	}
}

func TestCreationRejectsBadInput(t *testing.T) {
	r, tokenFor := newTestRig(t)
	tok := tokenFor(1)

	cases := []gin.H{
		{"title": "", "softness": 0.5},
		{"title": "ok", "softness": 1.5},
		{"title": "ok", "softness": 0.5, "toppings": []gin.H{{"kind": "star", "x": 2, "y": 0.5}}},
		{"title": "ok", "softness": 0.5, "toppings": []gin.H{{"kind": "", "x": 0.5, "y": 0.5}}},
	}
	for i, body := range cases {
		if rec := req(t, r, http.MethodPost, "/creations", tok, body); rec.Code != http.StatusBadRequest {
			t.Fatalf("case %d: status %d, want 400 (%s)", i, rec.Code, rec.Body)
		}
	}
}

func mustDecode(t *testing.T, rec *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), v); err != nil {
		t.Fatalf("decode: %v (%s)", err, rec.Body)
	}
}

func bodyHasCount(t *testing.T, rec *httptest.ResponseRecorder, want int) bool {
	t.Helper()
	if rec.Code != http.StatusOK {
		return false
	}
	var out struct {
		Creations []Creation `json:"creations"`
	}
	mustDecode(t, rec, &out)
	return len(out.Creations) == want
}
