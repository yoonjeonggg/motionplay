// Package store has small helpers shared by the GORM repositories.
package store

import (
	"errors"

	"gorm.io/gorm"
)

// First runs q and scans the first row into a new T. A missing row is
// reported as notFound, so callers deal in their own domain error rather
// than gorm.ErrRecordNotFound.
func First[T any](q *gorm.DB, notFound error) (*T, error) {
	var v T
	err := q.First(&v).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, notFound
	}
	if err != nil {
		return nil, err
	}
	return &v, nil
}
