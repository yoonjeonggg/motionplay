// Package auth handles signup, login and token verification.
package auth

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"motionplay/backend/internal/httpx"
	"motionplay/backend/internal/user"
)

// UserStore is the slice of user persistence the auth handler needs.
type UserStore interface {
	Create(*user.User) error
	ByEmail(string) (*user.User, error)
	ByID(uint) (*user.User, error)
}

type Handler struct {
	users  UserStore
	tokens *TokenIssuer
}

func NewHandler(users UserStore, tokens *TokenIssuer) *Handler {
	return &Handler{users: users, tokens: tokens}
}

// Routes registers the auth endpoints under the given group. credentialMW
// (e.g. a rate limiter) runs only on the endpoints that check passwords.
func (h *Handler) Routes(r *gin.RouterGroup, credentialMW ...gin.HandlerFunc) {
	r.POST("/signup", append(credentialMW, h.signup)...)
	r.POST("/login", append(credentialMW, h.login)...)
	r.GET("/me", Middleware(h.tokens), h.me)
}

type credentials struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8,max=72"`
}

type authResponse struct {
	Token string     `json:"token"`
	User  *user.User `json:"user"`
}

func (h *Handler) signup(c *gin.Context) {
	var body credentials
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Error(c, http.StatusBadRequest, "email and password (min 8 chars) are required")
		return
	}
	email := normalizeEmail(body.Email)

	hash, err := hashPassword(body.Password)
	if err != nil {
		httpx.Error(c, http.StatusInternalServerError, "could not hash password")
		return
	}

	u := &user.User{Email: email, PasswordHash: hash}
	if err := h.users.Create(u); err != nil {
		if errors.Is(err, user.ErrEmailTaken) {
			httpx.Error(c, http.StatusConflict, "email already registered")
			return
		}
		httpx.Error(c, http.StatusInternalServerError, "could not create account")
		return
	}

	h.respondWithToken(c, http.StatusCreated, u)
}

func (h *Handler) login(c *gin.Context) {
	var body credentials
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Error(c, http.StatusBadRequest, "email and password are required")
		return
	}

	u, err := h.users.ByEmail(normalizeEmail(body.Email))
	if err != nil {
		if errors.Is(err, user.ErrNotFound) {
			// Burn the same bcrypt time as a real check, so response timing
			// doesn't reveal which emails have accounts.
			checkPassword(dummyHash, body.Password)
			httpx.Error(c, http.StatusUnauthorized, "invalid email or password")
			return
		}
		httpx.Error(c, http.StatusInternalServerError, "could not look up account")
		return
	}
	if !checkPassword(u.PasswordHash, body.Password) {
		httpx.Error(c, http.StatusUnauthorized, "invalid email or password")
		return
	}

	h.respondWithToken(c, http.StatusOK, u)
}

func (h *Handler) me(c *gin.Context) {
	id, ok := UserID(c)
	if !ok {
		httpx.Error(c, http.StatusUnauthorized, "not authenticated")
		return
	}
	u, err := h.users.ByID(id)
	if err != nil {
		httpx.Error(c, http.StatusUnauthorized, "account no longer exists")
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": u})
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func (h *Handler) respondWithToken(c *gin.Context, status int, u *user.User) {
	token, err := h.tokens.Issue(u.ID)
	if err != nil {
		httpx.Error(c, http.StatusInternalServerError, "could not issue token")
		return
	}
	c.JSON(status, authResponse{Token: token, User: u})
}
