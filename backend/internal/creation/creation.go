// Package creation stores saved slime creations.
package creation

import (
	"crypto/rand"
	"database/sql/driver"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"

	"motionplay/backend/internal/store"
)

var ErrNotFound = errors.New("creation not found")

// ToppingSpec is one topping's kind and position, normalised (0..1) to the
// slime canvas so it survives different screen sizes.
type ToppingSpec struct {
	Kind string  `json:"kind"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

// ToppingList is persisted as a JSONB column.
type ToppingList []ToppingSpec

func (t ToppingList) Value() (driver.Value, error) {
	if t == nil {
		return "[]", nil
	}
	return json.Marshal(t)
}

func (t *ToppingList) Scan(src any) error {
	if src == nil {
		*t = ToppingList{}
		return nil
	}
	var b []byte
	switch v := src.(type) {
	case []byte:
		b = v
	case string:
		b = []byte(v)
	default:
		return fmt.Errorf("creation: cannot scan %T into ToppingList", src)
	}
	return json.Unmarshal(b, t)
}

type Creation struct {
	ID        uint        `gorm:"primaryKey" json:"id"`
	UserID    uint        `gorm:"index;not null" json:"userId"`
	Title     string      `gorm:"size:120;not null" json:"title"`
	Color     int         `json:"color"`
	Softness  float64     `json:"softness"`
	Toppings  ToppingList `gorm:"type:jsonb;not null;default:'[]'" json:"toppings"`
	ShareSlug *string     `gorm:"uniqueIndex;size:32" json:"shareSlug,omitempty"`
	CreatedAt time.Time   `json:"createdAt"`
	UpdatedAt time.Time   `json:"updatedAt"`
}

// SharedView is the public, owner-blind projection returned for a share link.
type SharedView struct {
	Title    string      `json:"title"`
	Color    int         `json:"color"`
	Softness float64     `json:"softness"`
	Toppings ToppingList `json:"toppings"`
}

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(c *Creation) error {
	return r.db.Create(c).Error
}

func (r *Repository) ListByUser(userID uint) ([]Creation, error) {
	var out []Creation
	err := r.db.Where("user_id = ?", userID).Order("updated_at desc").Find(&out).Error
	return out, err
}

// ByIDForUser returns the creation only if it belongs to the user.
func (r *Repository) ByIDForUser(id, userID uint) (*Creation, error) {
	return store.First[Creation](r.db.Where("id = ? AND user_id = ?", id, userID), ErrNotFound)
}

// Update saves the editable fields. It returns ErrNotFound if the row is
// gone, e.g. deleted from another tab after the caller loaded it.
func (r *Repository) Update(c *Creation) error {
	res := r.db.Model(c).
		Select("title", "color", "softness", "toppings").
		Updates(c)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) Delete(id, userID uint) error {
	res := r.db.Where("id = ? AND user_id = ?", id, userID).Delete(&Creation{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// ByShareSlug looks up a creation by its public share link, regardless of owner.
func (r *Repository) ByShareSlug(slug string) (*Creation, error) {
	return store.First[Creation](r.db.Where("share_slug = ?", slug), ErrNotFound)
}

// EnsureShareSlug returns the owner's creation with a share slug set, minting
// one on first use so repeated shares reuse the same link.
func (r *Repository) EnsureShareSlug(id, userID uint) (*Creation, error) {
	c, err := r.ByIDForUser(id, userID)
	if err != nil {
		return nil, err
	}
	if c.ShareSlug != nil && *c.ShareSlug != "" {
		return c, nil
	}
	slug, err := newShareSlug()
	if err != nil {
		return nil, fmt.Errorf("generate share slug: %w", err)
	}
	// Only set it if still unset. Two concurrent share requests would
	// otherwise each write their own slug, and whoever copied the first
	// link would end up with a dead one.
	res := r.db.Model(&Creation{}).
		Where("id = ? AND share_slug IS NULL", c.ID).
		Update("share_slug", slug)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		// Lost the race: return the slug the other request stored.
		return r.ByIDForUser(id, userID)
	}
	c.ShareSlug = &slug
	return c, nil
}

func newShareSlug() (string, error) {
	b := make([]byte, 9)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
