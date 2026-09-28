import { useEffect, useRef, useState } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { HAND_CONNECTIONS, HandTracker } from '../vision/handTracker'

export type TrackerStatus = 'loading' | 'ready' | 'error'

type UseHandTrackingResult = {
  /** Canvas overlaid on the video; the hand skeleton is drawn here each frame. */
  overlayRef: React.RefObject<HTMLCanvasElement | null>
  status: TrackerStatus
  error: string | null
  handCount: number
  fps: number
}

const HANDEDNESS_COLORS: Record<string, string> = {
  Left: '#38bdf8',
  Right: '#f472b6',
}

/**
 * Runs the MediaPipe hand tracker against a live <video> and paints the
 * detected skeleton onto an overlay canvas. Each frame's hands go to `onHands`
 * (the slime driver) directly, without forcing per-frame React renders.
 */
export function useHandTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onHands?: (hands: NormalizedLandmark[][]) => void,
): UseHandTrackingResult {
  const overlayRef = useRef<HTMLCanvasElement | null>(null)

  // Keep the callback in a ref so a new closure each render doesn't restart
  // the tracker.
  const onHandsRef = useRef(onHands)
  useEffect(() => {
    onHandsRef.current = onHands
  })

  const [status, setStatus] = useState<TrackerStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [handCount, setHandCount] = useState(0)
  const [fps, setFps] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const tracker = new HandTracker()
    let raf = 0
    // Last detection, kept so frames where the video hasn't advanced still
    // redraw (and report) the most recent hands.
    let latestHands: NormalizedLandmark[][] = []

    let frames = 0
    let fpsWindowStart = performance.now()
    let lastHandCount = -1
    let cachedCtx: CanvasRenderingContext2D | null = null

    const drawFrame = (now: number) => {
      if (cancelled) return
      raf = requestAnimationFrame(drawFrame)

      const video = videoRef.current
      const canvas = overlayRef.current
      if (!video || !canvas || video.readyState < 2) return

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }
      const ctx = (cachedCtx ??= canvas.getContext('2d'))
      if (!ctx) return

      const result = tracker.detect(video, now)
      if (result) {
        latestHands = result.landmarks
        if (result.landmarks.length !== lastHandCount) {
          lastHandCount = result.landmarks.length
          setHandCount(result.landmarks.length)
        }
      }

      const hands = latestHands
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      // The canvas is mirrored in CSS to match the selfie-view video, so
      // landmarks are drawn in raw frame coordinates here.
      hands.forEach((landmarks, i) => {
        const handedness = result?.handedness?.[i]?.[0]?.categoryName ?? 'Right'
        drawHand(
          ctx,
          landmarks,
          canvas.width,
          canvas.height,
          HANDEDNESS_COLORS[handedness] ?? '#f472b6',
        )
      })

      onHandsRef.current?.(hands)

      frames += 1
      if (now - fpsWindowStart >= 500) {
        setFps(Math.round((frames * 1000) / (now - fpsWindowStart)))
        frames = 0
        fpsWindowStart = now
      }
    }

    tracker
      .init({ numHands: 2 })
      .then(() => {
        if (cancelled) return
        setStatus('ready')
        raf = requestAnimationFrame(drawFrame)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : '손 인식 모델을 불러오지 못했습니다.')
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      tracker.close()
      setHandCount(0)
      setFps(0)
    }
  }, [enabled, videoRef])

  return { overlayRef, status, error, handCount, fps }
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  w: number,
  h: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(2, w / 320)
  ctx.beginPath()
  for (const { start, end } of HAND_CONNECTIONS) {
    const a = landmarks[start]
    const b = landmarks[end]
    if (!a || !b) continue
    ctx.moveTo(a.x * w, a.y * h)
    ctx.lineTo(b.x * w, b.y * h)
  }
  ctx.stroke()

  // All joints in one path + one fill, instead of a fill per joint.
  ctx.fillStyle = color
  const r = Math.max(3, w / 220)
  ctx.beginPath()
  for (const point of landmarks) {
    const x = point.x * w
    const y = point.y * h
    ctx.moveTo(x + r, y)
    ctx.arc(x, y, r, 0, Math.PI * 2)
  }
  ctx.fill()
}
