# MotionPlay

Webcam motion-controlled physics playground — move your body to play with objects in real time.

- **frontend/** — React + TypeScript + Vite. MediaPipe Tasks Vision (hand tracking), a custom Verlet soft-body for the slime, pixi.js (rendering).
- **backend/** — Go + Gin, GORM/PostgreSQL, JWT auth.

## Getting started

### frontend
```bash
cd frontend
npm install
npm run dev
```

### backend
```bash
cd backend
cp .env.example .env      # set DATABASE_URL and JWT_SECRET
go run ./cmd/server
```

Needs a reachable PostgreSQL. `go test ./...` runs without one.

### API

| Method | Path                   | Auth   | Purpose                     |
|--------|------------------------|--------|-----------------------------|
| GET    | `/healthz`             | –      | liveness                    |
| POST   | `/api/auth/signup`     | –      | create account, returns JWT |
| POST   | `/api/auth/login`      | –      | returns JWT                 |
| GET    | `/api/auth/me`         | Bearer | current account             |
| GET    | `/api/creations`       | Bearer | list your saved slimes      |
| POST   | `/api/creations`       | Bearer | save a slime                |
| GET    | `/api/creations/:id`   | Bearer | one saved slime (owner)     |
| PUT    | `/api/creations/:id`   | Bearer | update (owner)              |
| DELETE | `/api/creations/:id`   | Bearer | delete (owner)              |

A creation is `{ title, color, softness, toppings: [{ kind, x, y }] }`, where
`x`/`y` are normalised 0..1 to the slime canvas.

## Notes
- Secrets live in `.env` files and are git-ignored. Use `.env.example` as the template.
