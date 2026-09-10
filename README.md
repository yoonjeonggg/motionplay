# MotionPlay

Webcam motion-controlled physics playground — move your body to play with objects in real time.

- **frontend/** — React + TypeScript + Vite. MediaPipe Tasks Vision (pose detection), matter-js (physics), pixi.js (rendering), zustand (state).
- **backend/** — Go + Gin, GORM/PostgreSQL, MongoDB, JWT auth.

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
cp .env.example .env   # fill in values
go run .
```

## Notes
- Secrets live in `.env` files and are git-ignored. Use `.env.example` as the template.
