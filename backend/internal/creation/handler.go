package creation

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"motionplay/backend/internal/auth"
	"motionplay/backend/internal/httpx"
)

// Store is the persistence slice the handler needs.
type Store interface {
	Create(*Creation) error
	ListByUser(userID uint) ([]Creation, error)
	ByIDForUser(id, userID uint) (*Creation, error)
	Update(*Creation) error
	Delete(id, userID uint) error
	EnsureShareSlug(id, userID uint) (*Creation, error)
	ByShareSlug(slug string) (*Creation, error)
}

type Handler struct {
	store Store
}

func NewHandler(store Store) *Handler {
	return &Handler{store: store}
}

// Routes registers CRUD endpoints. The caller supplies the auth middleware so
// every route is owner-scoped.
func (h *Handler) Routes(r *gin.RouterGroup, authMW gin.HandlerFunc) {
	r.Use(authMW)
	r.POST("", h.create)
	r.GET("", h.list)
	r.GET("/:id", h.get)
	r.PUT("/:id", h.update)
	r.DELETE("/:id", h.remove)
	r.POST("/:id/share", h.share)
}

// PublicRoutes registers the unauthenticated share-link lookup.
func (h *Handler) PublicRoutes(r *gin.RouterGroup) {
	r.GET("/:slug", h.getShared)
}

const (
	maxToppings = 200
	maxColor    = 0xffffff
	// shareSlugLen is the length of a slug from newShareSlug (9 random bytes,
	// base64url-encoded).
	shareSlugLen = 12
)

// toppingKinds mirrors TOPPING_KINDS in the frontend. Anything else is
// rejected so arbitrary strings can't be stored and served back via share
// links.
var toppingKinds = map[string]bool{"star": true, "heart": true, "pearl": true}

type payload struct {
	Title    string      `json:"title" binding:"required,max=120"`
	Color    int         `json:"color"`
	Softness float64     `json:"softness" binding:"gte=0,lte=1"`
	Toppings ToppingList `json:"toppings"`
}

func (p payload) validate() (ToppingList, bool) {
	if len(p.Toppings) > maxToppings || p.Color < 0 || p.Color > maxColor {
		return nil, false
	}
	list := make(ToppingList, 0, len(p.Toppings))
	for _, t := range p.Toppings {
		if !toppingKinds[t.Kind] || t.X < 0 || t.X > 1 || t.Y < 0 || t.Y > 1 {
			return nil, false
		}
		list = append(list, t)
	}
	return list, true
}

func (h *Handler) create(c *gin.Context) {
	userID, _ := auth.UserID(c)

	var body payload
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Error(c, http.StatusBadRequest, "title is required; softness must be 0..1")
		return
	}
	toppings, ok := body.validate()
	if !ok {
		httpx.Error(c, http.StatusBadRequest, "invalid color or toppings")
		return
	}

	item := &Creation{
		UserID:   userID,
		Title:    strings.TrimSpace(body.Title),
		Color:    body.Color,
		Softness: body.Softness,
		Toppings: toppings,
	}
	if err := h.store.Create(item); err != nil {
		httpx.Error(c, http.StatusInternalServerError, "could not save creation")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"creation": item})
}

func (h *Handler) list(c *gin.Context) {
	userID, _ := auth.UserID(c)
	items, err := h.store.ListByUser(userID)
	if err != nil {
		httpx.Error(c, http.StatusInternalServerError, "could not load creations")
		return
	}
	c.JSON(http.StatusOK, gin.H{"creations": items})
}

func (h *Handler) get(c *gin.Context) {
	userID, _ := auth.UserID(c)
	id, ok := parseID(c)
	if !ok {
		return
	}
	item, err := h.store.ByIDForUser(id, userID)
	if err != nil {
		storeError(c, err, "could not load creation")
		return
	}
	c.JSON(http.StatusOK, gin.H{"creation": item})
}

func (h *Handler) update(c *gin.Context) {
	userID, _ := auth.UserID(c)
	id, ok := parseID(c)
	if !ok {
		return
	}

	var body payload
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Error(c, http.StatusBadRequest, "title is required; softness must be 0..1")
		return
	}
	toppings, valid := body.validate()
	if !valid {
		httpx.Error(c, http.StatusBadRequest, "invalid color or toppings")
		return
	}

	item, err := h.store.ByIDForUser(id, userID)
	if err != nil {
		storeError(c, err, "could not load creation")
		return
	}
	item.Title = strings.TrimSpace(body.Title)
	item.Color = body.Color
	item.Softness = body.Softness
	item.Toppings = toppings
	if err := h.store.Update(item); err != nil {
		httpx.Error(c, http.StatusInternalServerError, "could not update creation")
		return
	}
	c.JSON(http.StatusOK, gin.H{"creation": item})
}

func (h *Handler) remove(c *gin.Context) {
	userID, _ := auth.UserID(c)
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := h.store.Delete(id, userID); err != nil {
		storeError(c, err, "could not delete creation")
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) share(c *gin.Context) {
	userID, _ := auth.UserID(c)
	id, ok := parseID(c)
	if !ok {
		return
	}
	item, err := h.store.EnsureShareSlug(id, userID)
	if err != nil {
		storeError(c, err, "could not create share link")
		return
	}
	c.JSON(http.StatusOK, gin.H{"shareSlug": *item.ShareSlug})
}

func (h *Handler) getShared(c *gin.Context) {
	slug := c.Param("slug")
	// Reject anything that can't be a real slug before touching the database.
	if !validShareSlug(slug) {
		httpx.Error(c, http.StatusNotFound, "shared creation not found")
		return
	}
	item, err := h.store.ByShareSlug(slug)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			httpx.Error(c, http.StatusNotFound, "shared creation not found")
			return
		}
		httpx.Error(c, http.StatusInternalServerError, "could not load shared creation")
		return
	}
	c.JSON(http.StatusOK, gin.H{"creation": SharedView{
		Title:    item.Title,
		Color:    item.Color,
		Softness: item.Softness,
		Toppings: item.Toppings,
	}})
}

// storeError answers 404 for a missing (or someone else's) creation and 500
// for anything else, so a database outage isn't reported as "not found".
func storeError(c *gin.Context, err error, failMsg string) {
	if errors.Is(err, ErrNotFound) {
		httpx.Error(c, http.StatusNotFound, "creation not found")
		return
	}
	httpx.Error(c, http.StatusInternalServerError, failMsg)
}

func parseID(c *gin.Context) (uint, bool) {
	n, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || n == 0 {
		httpx.Error(c, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	return uint(n), true
}

func validShareSlug(s string) bool {
	if len(s) != shareSlugLen {
		return false
	}
	for _, r := range s {
		isAlnum := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')
		if !isAlnum && r != '-' && r != '_' {
			return false
		}
	}
	return true
}
