import { useEffect, useRef, useState } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { type HandConnection, HandTracker } from '../vision/handTracker'

export type TrackerStatus = 'loading' | 'ready' | 'error'

type UseHandTrackingResult = {
  /** Canvas overlaid on the video; the hand skeleton is drawn here each frame. */
  overlayRef: React.RefObject<HTMLCanvasElement | null>
  status: TrackerStatus
  error: string | null
  handCount: number
}

const HANDEDNESS_COLORS: Record<string, string> = {
  Left: '#38bdf8',
  Right: '#f472b6',
}

/**
 * Runs the hand tracker (in a worker) against a live <video> and paints the
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

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const tracker = new HandTracker()
    let raf = 0
    // Latest detection, kept so every rendered frame redraws (and reports)
    // the most recent hands while the worker works on the next one.
    let latestHands: NormalizedLandmark[][] = []
    let latestColors: string[] = []
    let lastHandCount = -1
    let cachedCtx: CanvasRenderingContext2D | null = null

    tracker.onResult = ({ landmarks, handedness }) => {
      latestHands = landmarks
      latestColors = handedness.map((h) => HANDEDNESS_COLORS[h] ?? HANDEDNESS_COLORS.Right)
      if (landmarks.length !== lastHandCount) {
        lastHandCount = landmarks.length
        setHandCount(landmarks.length)
      }
    }

    const drawFrame = (now: number) => {
      if (cancelled) return
      raf = requestAnimationFrame(drawFrame)

      const video = videoRef.current
      const canvas = overlayRef.current
      if (!video || !canvas || video.readyState < 2) return

      tracker.submit(video, now)

      // Draw at the overlay's displayed size, not the camera's: a 1280x720
      // backing store for a 240px preview was mostly wasted fill.
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const ctx = (cachedCtx ??= canvas.getContext('2d'))
      if (!ctx) return

      ctx.clearRect(0, 0, w, h)
      // The canvas is mirrored in CSS to match the selfie-view video, so
      // landmarks are drawn in raw frame coordinates here.
      const fit = coverTransform(video.videoWidth, video.videoHeight, w, h)
      latestHands.forEach((landmarks, i) => {
        drawHand(ctx, landmarks, tracker.connections, fit, latestColors[i])
      })

      onHandsRef.current?.(latestHands)
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
      // Back to a clean slate, so turning the camera on again shows
      // "loading" rather than the previous session's state.
      setStatus('loading')
      setError(null)
      setHandCount(0)
    }
  }, [enabled, videoRef])

  return { overlayRef, status, error, handCount }
}

type Fit = { scale: number; dx: number; dy: number; vw: number; vh: number }

/** Maps video pixels onto an object-fit: cover box of size w x h. */
function coverTransform(vw: number, vh: number, w: number, h: number): Fit {
  const scale = Math.max(w / vw, h / vh)
  return { scale, dx: (w - vw * scale) / 2, dy: (h - vh * scale) / 2, vw, vh }
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  connections: HandConnection[],
  { scale, dx, dy, vw, vh }: Fit,
  color: string,
) {
  const px = (x: number) => x * vw * scale + dx
  const py = (y: number) => y * vh * scale + dy

  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  for (const { start, end } of connections) {
    const a = landmarks[start]
    const b = landmarks[end]
    if (!a || !b) continue
    ctx.moveTo(px(a.x), py(a.y))
    ctx.lineTo(px(b.x), py(b.y))
  }
  ctx.stroke()

  // All joints in one path + one fill, instead of a fill per joint.
  ctx.fillStyle = color
  const r = 2.5
  ctx.beginPath()
  for (const point of landmarks) {
    const x = px(point.x)
    const y = py(point.y)
    ctx.moveTo(x + r, y)
    ctx.arc(x, y, r, 0, Math.PI * 2)
  }
  ctx.fill()
}
