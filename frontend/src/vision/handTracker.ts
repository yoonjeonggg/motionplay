import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { HandConnection, WorkerRequest, WorkerResponse } from './handProtocol'

export type { HandConnection }

const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/mediapipe/models/hand_landmarker.task'

/** Frames are downscaled to this width before detection; the model's own
 *  input is far smaller, so full camera resolution only costs copy time. */
const DETECT_WIDTH = 640

export type HandResult = {
  landmarks: NormalizedLandmark[][]
  /** 'Left' | 'Right' per hand, as MediaPipe labels it. */
  handedness: string[]
}

/**
 * Page-side handle on the hand-tracking worker. Keeps at most one frame in
 * flight, so detection runs as fast as the worker can manage and never
 * queues up stale frames.
 *
 * The worker (and MediaPipe inside it) is created on first init(), so
 * visitors who never turn the camera on don't download it.
 */
export class HandTracker {
  private worker: Worker | null = null
  private inFlight = false
  private lastVideoTime = -1
  /** Skeleton edges (landmark index pairs) for drawing; set by init(). */
  connections: HandConnection[] = []
  /** Called with each detection result, off the render loop. */
  onResult: ((result: HandResult) => void) | null = null

  init({ numHands = 2 }: { numHands?: number } = {}): Promise<void> {
    const worker = new Worker(new URL('./handWorker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    const send = (msg: WorkerRequest, transfer: Transferable[] = []) =>
      worker.postMessage(msg, transfer)

    return new Promise((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data
        if (msg.type === 'ready') {
          this.connections = msg.connections
          resolve()
        } else if (msg.type === 'error') {
          reject(new Error(msg.message))
        } else {
          this.inFlight = false
          this.onResult?.(msg)
        }
      }
      worker.onerror = (e) => {
        e.preventDefault()
        reject(new Error(e.message || '손 인식 모델을 불러오지 못했습니다.'))
      }
      send({
        type: 'init',
        // Absolute, since the worker resolves relative URLs against itself.
        wasmPath: new URL(WASM_PATH, location.href).href,
        modelPath: new URL(MODEL_PATH, location.href).href,
        numHands,
      })
    })
  }

  /**
   * Hand the current video frame to the worker, unless it is still busy with
   * the previous one or the video hasn't advanced. Results arrive via onResult.
   */
  submit(video: HTMLVideoElement, timestamp: number): void {
    const worker = this.worker
    if (!worker || this.inFlight || video.currentTime === this.lastVideoTime) return
    if (!video.videoWidth) return
    this.lastVideoTime = video.currentTime
    this.inFlight = true

    const scale = Math.min(1, DETECT_WIDTH / video.videoWidth)
    createImageBitmap(video, {
      resizeWidth: Math.round(video.videoWidth * scale),
      resizeHeight: Math.round(video.videoHeight * scale),
    }).then(
      (frame) => {
        if (this.worker !== worker) {
          frame.close()
          return
        }
        const msg: WorkerRequest = { type: 'frame', frame, timestamp }
        worker.postMessage(msg, [frame])
      },
      () => {
        // The video wasn't decodable this instant; try the next frame.
        this.inFlight = false
      },
    )
  }

  close(): void {
    // terminate(), not a polite "close" message: it also stops a worker
    // that is still mid-init, and frees its WebGL context right away.
    this.worker?.terminate()
    this.worker = null
    this.inFlight = false
    this.lastVideoTime = -1
    this.onResult = null
  }
}
