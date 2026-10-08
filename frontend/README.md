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
  vision/handWorker.ts       MediaPipe HandLandmarker, run in a Web Worker
  vision/handTracker.ts      page-side client: sends frames, receives landmarks
  hooks/useCamera.ts         getUserMedia webcam stream
  hooks/useHandTracking.ts   result loop + skeleton overlay rendering
  slime/slimeApp.ts          Pixi renderer + physics + controller for one slime
  slime/verletBlob.ts        soft-body physics
  components/PlayScreen.tsx  layout and app state: top bar, dock, drawer, camera
```

Hand detection runs in a worker because `detectForVideo()` blocks for
~20-25ms per frame; on the main thread it held the page at ~40fps with the
camera on. The slime is only re-drawn while it moves or something changes.

## Privacy

All video and hand detection runs on-device. Nothing is uploaded.
