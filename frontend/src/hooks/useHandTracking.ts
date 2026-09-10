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
 * detected skeleton onto an overlay canvas. Detection results are also kept in
 * a ref for later consumers (slime physics) without forcing per-frame renders.
 */
export function useHandTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
): UseHandTrackingResult {
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const trackerRef = useRef<HandTracker | null>(null)
  const rafRef = useRef(0)
  const latestLandmarksRef = useRef<NormalizedLandmark[][]>([])

  const [status, setStatus] = useState<TrackerStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [handCount, setHandCount] = useState(0)
  const [fps, setFps] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const tracker = new HandTracker()
    trackerRef.current = tracker

    let frames = 0
    let fpsWindowStart = performance.now()
    let lastHandCount = -1

    const drawFrame = (now: number) => {
      if (cancelled) return
      rafRef.current = requestAnimationFrame(drawFrame)

      const video = videoRef.current
      const canvas = overlayRef.current
      if (!video || !canvas || video.readyState < 2) return

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const result = tracker.detect(video, now)
      if (result) {
        latestLandmarksRef.current = result.landmarks
        if (result.landmarks.length !== lastHandCount) {
          lastHandCount = result.landmarks.length
          setHandCount(result.landmarks.length)
        }
      }

      const hands = latestLandmarksRef.current
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
        rafRef.current = requestAnimationFrame(drawFrame)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : '손 인식 모델을 불러오지 못했습니다.')
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      tracker.close()
      trackerRef.current = null
      latestLandmarksRef.current = []
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

  ctx.fillStyle = color
  const r = Math.max(3, w / 220)
  for (const point of landmarks) {
    ctx.beginPath()
    ctx.arc(point.x * w, point.y * h, r, 0, Math.PI * 2)
    ctx.fill()
  }
}
