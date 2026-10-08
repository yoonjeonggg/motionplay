import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

/** Skeleton edge between two landmark indices, for drawing. */
export type HandConnection = { start: number; end: number }

/** Messages from the page to the hand-tracking worker. */
export type WorkerRequest =
  | { type: 'init'; wasmPath: string; modelPath: string; numHands: number }
  | { type: 'frame'; frame: ImageBitmap; timestamp: number }

/** Messages from the worker back to the page. */
export type WorkerResponse =
  | { type: 'ready'; connections: HandConnection[] }
  | { type: 'error'; message: string }
  | { type: 'result'; landmarks: NormalizedLandmark[][]; handedness: string[] }
