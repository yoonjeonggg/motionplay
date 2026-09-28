// Package user holds the account model and its persistence.
package user

import (
	"errors"
	"time"

	"gorm.io/gorm"

	"motionplay/backend/internal/store"
)

var (
	ErrNotFound   = errors.New("user not found")
	ErrEmailTaken = errors.New("email already registered")
)

type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Email        string    `gorm:"uniqueIndex;size:255;not null" json:"email"`
	PasswordHash string    `gorm:"size:255;not null" json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// Repository is the persistence boundary for users.
type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Create inserts u, returning ErrEmailTaken if the address is in use. The
// unique index decides this atomically; a separate "is it taken?" query
// first would let two concurrent signups both pass the check.
func (r *Repository) Create(u *User) error {
	err := r.db.Create(u).Error
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return ErrEmailTaken
	}
	return err
}

func (r *Repository) ByEmail(email string) (*User, error) {
	return store.First[User](r.db.Where("email = ?", email), ErrNotFound)
}

func (r *Repository) ByID(id uint) (*User, error) {
	return store.First[User](r.db.Where("id = ?", id), ErrNotFound)
}
