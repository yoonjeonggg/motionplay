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

| Method | Path              | Auth   | Purpose                     |
|--------|-------------------|--------|-----------------------------|
| GET    | `/healthz`        | –      | liveness                    |
| POST   | `/api/auth/signup`| –      | create account, returns JWT |
| POST   | `/api/auth/login` | –      | returns JWT                 |
| GET    | `/api/auth/me`    | Bearer | current account             |

## Notes
- Secrets live in `.env` files and are git-ignored. Use `.env.example` as the template.
