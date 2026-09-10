# MotionPlaying — frontend

React + TypeScript + Vite. Webcam hand tracking via MediaPipe Tasks Vision.

## Scripts

```bash
npm install
npm run dev      # runs setup:mediapipe, then Vite dev server
npm run build    # type-check + production build
npm run lint     # oxlint
```

## MediaPipe assets

`npm run setup:mediapipe` (auto-run by `predev` / `prebuild`) prepares
`public/mediapipe/`:

- `wasm/` — copied from the installed `@mediapipe/tasks-vision` package
- `models/hand_landmarker.task` — downloaded once and cached

The whole `public/mediapipe/` directory is git-ignored and regenerated on demand.

## Structure

```
src/
  vision/handTracker.ts     MediaPipe HandLandmarker wrapper (VIDEO mode)
  hooks/useCamera.ts        getUserMedia webcam stream
  hooks/useHandTracking.ts  detection loop + skeleton overlay rendering
  components/PlayScreen.tsx  onboarding, camera viewport, tracking HUD
```

## Privacy

All video and hand detection runs on-device. Nothing is uploaded.
