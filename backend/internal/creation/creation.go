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
	var c Creation
	err := r.db.Where("id = ? AND user_id = ?", id, userID).First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) Update(c *Creation) error {
	return r.db.Model(c).
		Select("title", "color", "softness", "toppings").
		Updates(c).Error
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
	var c Creation
	err := r.db.Where("share_slug = ?", slug).First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
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
	if err := r.db.Model(c).Update("share_slug", slug).Error; err != nil {
		return nil, err
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
