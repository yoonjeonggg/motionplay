package db_test

import (
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"gorm.io/gorm"

	"motionplay/backend/internal/creation"
	"motionplay/backend/internal/db"
	"motionplay/backend/internal/user"
)

// Repository tests against a real Postgres. They run only when
// TEST_DATABASE_URL points at a disposable database, e.g.
//
//	docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=it postgres:16
//	TEST_DATABASE_URL=postgres://postgres:it@localhost:55432/postgres?sslmode=disable go test ./...
//
// Tables are dropped first, so never point this at real data.
func openTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	gdb, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if sqlDB, err := gdb.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	if err := gdb.Migrator().DropTable(&creation.Creation{}, &user.User{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(gdb); err != nil {
		t.Fatal(err)
	}
	return gdb
}

func TestUserCreateReportsDuplicateEmail(t *testing.T) {
	users := user.NewRepository(openTestDB(t))
	if err := users.Create(&user.User{Email: "a@example.com", PasswordHash: "x"}); err != nil {
		t.Fatal(err)
	}
	err := users.Create(&user.User{Email: "a@example.com", PasswordHash: "y"})
	if !errors.Is(err, user.ErrEmailTaken) {
		t.Fatalf("duplicate create err = %v, want ErrEmailTaken", err)
	}
	if _, err := users.ByEmail("missing@example.com"); !errors.Is(err, user.ErrNotFound) {
		t.Fatalf("ByEmail(missing) err = %v, want ErrNotFound", err)
	}
}

func TestCreationUpdateBumpsUpdatedAt(t *testing.T) {
	repo := creation.NewRepository(openTestDB(t))
	c := &creation.Creation{UserID: 1, Title: "first"}
	if err := repo.Create(c); err != nil {
		t.Fatal(err)
	}
	before := c.UpdatedAt
	time.Sleep(10 * time.Millisecond)

	c.Title = "second"
	if err := repo.Update(c); err != nil {
		t.Fatal(err)
	}
	got, err := repo.ByIDForUser(c.ID, 1)
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "second" || !got.UpdatedAt.After(before) {
		t.Fatalf("after update: title=%q updatedAt=%v (before %v)", got.Title, got.UpdatedAt, before)
	}
}

func TestEnsureShareSlugIsStableUnderConcurrency(t *testing.T) {
	repo := creation.NewRepository(openTestDB(t))
	c := &creation.Creation{UserID: 1, Title: "shared"}
	if err := repo.Create(c); err != nil {
		t.Fatal(err)
	}

	const n = 8
	slugs := make([]string, n)
	errs := make([]error, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Go(func() {
			got, err := repo.EnsureShareSlug(c.ID, 1)
			errs[i] = err
			if err == nil {
				slugs[i] = *got.ShareSlug
			}
		})
	}
	wg.Wait()

	stored, err := repo.ByIDForUser(c.ID, 1)
	if err != nil {
		t.Fatal(err)
	}
	for i := range n {
		if errs[i] != nil {
			t.Fatalf("request %d: %v", i, errs[i])
		}
		if slugs[i] != *stored.ShareSlug {
			t.Fatalf("request %d got slug %q, but %q is stored — that link is dead", i, slugs[i], *stored.ShareSlug)
		}
	}
	if _, err := repo.EnsureShareSlug(c.ID, 2); !errors.Is(err, creation.ErrNotFound) {
		t.Fatalf("other user's share err = %v, want ErrNotFound", err)
	}
}
