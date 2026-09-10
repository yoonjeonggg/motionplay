import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision'

const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/mediapipe/models/hand_landmarker.task'

/** Connection graph (pairs of landmark indices) for drawing the hand skeleton. */
export const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS

export type HandTrackerOptions = {
  /** Max hands to track. The plan targets two-hand play, so default 2. */
  numHands?: number
}

/**
 * Thin wrapper around MediaPipe's HandLandmarker in VIDEO running mode.
 * Owns the model lifecycle; callers feed it video frames.
 */
export class HandTracker {
  private landmarker: HandLandmarker | null = null
  private lastVideoTime = -1

  async init({ numHands = 2 }: HandTrackerOptions = {}): Promise<void> {
    if (this.landmarker) return
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands,
    })
  }

  get ready(): boolean {
    return this.landmarker !== null
  }

  /**
   * Detect hands in the current video frame. Returns null when the frame has
   * not advanced since the last call (MediaPipe requires monotonic timestamps).
   */
  detect(video: HTMLVideoElement, timestampMs: number): HandLandmarkerResult | null {
    if (!this.landmarker) return null
    if (video.currentTime === this.lastVideoTime) return null
    this.lastVideoTime = video.currentTime
    return this.landmarker.detectForVideo(video, timestampMs)
  }

  close(): void {
    this.landmarker?.close()
    this.landmarker = null
    this.lastVideoTime = -1
  }
}
