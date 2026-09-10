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
}

const maxToppings = 200

type payload struct {
	Title    string      `json:"title" binding:"required,max=120"`
	Color    int         `json:"color"`
	Softness float64     `json:"softness" binding:"gte=0,lte=1"`
	Toppings ToppingList `json:"toppings"`
}

func (p payload) validate() (ToppingList, bool) {
	if len(p.Toppings) > maxToppings {
		return nil, false
	}
	list := make(ToppingList, 0, len(p.Toppings))
	for _, t := range p.Toppings {
		if t.Kind == "" || t.X < 0 || t.X > 1 || t.Y < 0 || t.Y > 1 {
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
		httpx.Error(c, http.StatusBadRequest, "invalid toppings")
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
		httpx.Error(c, http.StatusNotFound, "creation not found")
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
		httpx.Error(c, http.StatusBadRequest, "invalid toppings")
		return
	}

	item, err := h.store.ByIDForUser(id, userID)
	if err != nil {
		httpx.Error(c, http.StatusNotFound, "creation not found")
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
		if errors.Is(err, ErrNotFound) {
			httpx.Error(c, http.StatusNotFound, "creation not found")
			return
		}
		httpx.Error(c, http.StatusInternalServerError, "could not delete creation")
		return
	}
	c.Status(http.StatusNoContent)
}

func parseID(c *gin.Context) (uint, bool) {
	n, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || n == 0 {
		httpx.Error(c, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	return uint(n), true
}
