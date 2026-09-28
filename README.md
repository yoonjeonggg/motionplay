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
cp .env.example .env         # set DATABASE_URL and JWT_SECRET (openssl rand -base64 48)
docker compose up -d         # local PostgreSQL on :5433 (see docker-compose.yml)
go run ./cmd/server
```

Needs a reachable PostgreSQL. The bundled `docker-compose.yml` maps it to
`localhost:5433` to avoid clashing with a system Postgres on 5432; the
`.env.example` `DATABASE_URL` already points there. `go test ./...` runs
without a database; repository integration tests additionally run against a
disposable Postgres when `TEST_DATABASE_URL` is set (they drop tables — never
point it at real data):

```bash
docker run --rm -d --name mp-it-pg -p 55432:5432 -e POSTGRES_PASSWORD=it postgres:16
TEST_DATABASE_URL="postgres://postgres:it@localhost:55432/postgres?sslmode=disable" go test ./...
```

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
`x`/`y` are normalised 0..1 to the slime canvas, `color` is 0..0xFFFFFF and
`kind` is one of `star`, `heart`, `pearl`.

### Security
- The server refuses to start unless `JWT_SECRET` is at least 32 characters
  and not a placeholder.
- Signup/login are rate-limited per client IP (burst 10, then ~10/min), the
  rest of `/api` more loosely; over the limit returns `429` with `Retry-After`.
  Behind a reverse proxy, set `TRUSTED_PROXIES` so client IPs come from
  `X-Forwarded-For` — otherwise that header is ignored.
- `CORS_ORIGINS` (comma-separated) sets the allowed frontend origins;
  defaults to the local Vite ports.
- Request bodies are capped at 64 KB; responses send `nosniff`,
  `X-Frame-Options: DENY` and `Cache-Control: no-store`.
- Production frontend builds include a Content-Security-Policy `<meta>`
  (scripts: own bundle + hashed inline theme script only; network: self +
  `VITE_API_URL`). When deploying, also send it as a header with
  `frame-ancestors 'none'`.
- The MediaPipe model download is checked against a pinned SHA-256.

## Notes
- Secrets live in `.env` files and are git-ignored. Use `.env.example` as the template.
