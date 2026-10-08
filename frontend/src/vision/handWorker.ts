/// <reference lib="webworker" />
// Runs MediaPipe hand landmarking off the main thread. A detectForVideo()
// call blocks for ~20-25ms (the GPU delegate reads its results back
// synchronously), which on the main thread starved rendering and input:
// with the camera on, the page ran at ~40fps with the main thread ~97% busy.

import type { HandLandmarker } from '@mediapipe/tasks-vision'
import type { WorkerRequest, WorkerResponse } from './handProtocol'

declare const self: DedicatedWorkerGlobalScope

let landmarker: HandLandmarker | null = null

const post = (msg: WorkerResponse) => self.postMessage(msg)

async function create(
  wasmPath: string,
  modelPath: string,
  numHands: number,
): Promise<HandLandmarker> {
  const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
  // useModule: a module worker can't importScripts the classic loader.
  const fileset = await FilesetResolver.forVisionTasks(wasmPath, true)
  const make = (delegate: 'GPU' | 'CPU') =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelPath, delegate },
      runningMode: 'VIDEO',
      numHands,
    })
  try {
    return await make('GPU')
  } catch {
    // No usable WebGL in workers on this device: slower, but it works.
    return await make('CPU')
  }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.type === 'init') {
    try {
      landmarker ??= await create(msg.wasmPath, msg.modelPath, msg.numHands)
      const { HandLandmarker } = await import('@mediapipe/tasks-vision')
      post({ type: 'ready', connections: HandLandmarker.HAND_CONNECTIONS })
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
    return
  }

  if (msg.type === 'frame') {
    const { frame, timestamp } = msg
    try {
      // Every frame must be answered: the page sends the next one only
      // after a result, so silence would stall tracking for good.
      if (!landmarker) throw new Error('not ready')
      const result = landmarker.detectForVideo(frame, timestamp)
      post({
        type: 'result',
        landmarks: result.landmarks,
        handedness: result.handedness.map((h) => h[0]?.categoryName ?? 'Right'),
      })
    } catch {
      // A bad frame (e.g. a non-monotonic timestamp after a tab switch) must
      // not wedge the pipeline: report "nothing seen" and carry on.
      post({ type: 'result', landmarks: [], handedness: [] })
    } finally {
      frame.close()
    }
  }
}
