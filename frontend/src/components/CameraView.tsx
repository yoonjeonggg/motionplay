import { useEffect, useRef, useState } from 'react'
import { Hand, HandFist, HandGrab, LoaderCircle, X } from 'lucide-react'
import type { CameraStatus } from '../hooks/useCamera'
import { type TrackerStatus, useHandTracking } from '../hooks/useHandTracking'
import { clamp01 } from '../lib/math'
import type { SlimeController } from '../slime/controller'
import { createHandSlimeDriver, type HandGesture } from '../slime/handControl'
import type { ToppingKind } from '../slime/toppings'
import './CameraView.css'

const GESTURE_UI_INTERVAL = 120

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  status: CameraStatus
  onStop: () => void
  controller: React.RefObject<SlimeController | null>
  /** Topping a pinch picks up. */
  toppingKind: ToppingKind
}

/**
 * Camera preview + hand tracking. Owns all per-frame hand state, so gesture
 * readouts re-render only this view, not the whole play screen. The <video>
 * is always mounted (useCamera binds to it before the stream starts) and
 * only shown while the camera is on.
 */
export function CameraView({ videoRef, status, onStop, controller, toppingKind }: Props) {
  const [gestures, setGestures] = useState<HandGesture[]>([])
  const lastGestureUi = useRef(0)

  const driverRef = useRef<ReturnType<typeof createHandSlimeDriver> | null>(null)
  driverRef.current ??= createHandSlimeDriver(
    () => controller.current,
    {},
    (next) => {
      const now = performance.now()
      // Never throttle "no hands": the driver sends it only once, and
      // dropping it would leave stale gesture chips on screen.
      if (next.length > 0 && now - lastGestureUi.current < GESTURE_UI_INTERVAL) return
      lastGestureUi.current = now
      setGestures(next)
    },
  )

  useEffect(() => {
    driverRef.current?.setSelectedTopping(toppingKind)
  }, [toppingKind])

  const streaming = status === 'streaming'
  const { overlayRef, status: trackerStatus, error: trackerError, handCount } = useHandTracking(
    videoRef,
    streaming,
    (hands) => driverRef.current?.update(hands),
  )

  // Turning the camera off mid-grab must not leave the slime pinned.
  useEffect(() => {
    if (!streaming) driverRef.current?.reset()
  }, [streaming])

  const visible = streaming || status === 'requesting'

  return (
    <div className="pip" data-visible={visible} aria-hidden={!visible}>
      <video ref={videoRef} className="pip-feed" playsInline muted />
      <canvas ref={overlayRef} className="pip-overlay" />
      {status === 'requesting' && (
        <p className="pip-wait">
          <LoaderCircle size={18} className="spin" aria-hidden />
          카메라 권한을 허용해 주세요
        </p>
      )}
      {streaming && (
        <>
          <TrackerBadge status={trackerStatus} error={trackerError} handCount={handCount} />
          <GestureStrip gestures={gestures} />
        </>
      )}
      <button type="button" className="pip-close" aria-label="카메라 끄기" onClick={onStop}>
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}

function TrackerBadge({
  status,
  error,
  handCount,
}: {
  status: TrackerStatus
  error: string | null
  handCount: number
}) {
  let text: string
  let tone: 'wait' | 'ok' | 'error' = 'wait'
  if (status === 'loading') text = '손 인식 준비 중'
  else if (status === 'error') {
    text = error ?? '손 인식 오류'
    tone = 'error'
  } else if (handCount === 0) text = '손을 화면에 보여 주세요'
  else {
    text = `손 ${handCount}개 인식 중`
    tone = 'ok'
  }
  return (
    <span className="pip-badge" data-tone={tone} role="status">
      <span className="pip-badge-dot" aria-hidden />
      {text}
    </span>
  )
}

function GestureStrip({ gestures }: { gestures: HandGesture[] }) {
  if (gestures.length === 0) return null
  return (
    <div className="gesture-strip">
      {gestures.map((g, i) => {
        const level = clamp01((g.openness - 0.7) / 1.5)
        const Icon = g.pinching ? HandGrab : g.gripping ? HandFist : Hand
        const label = g.pinching ? '집기' : g.gripping ? '잡기' : '편 손'
        return (
          <div key={i} className="gesture-chip" data-active={g.gripping || g.pinching}>
            <Icon size={14} aria-hidden />
            <span>{label}</span>
            <span className="gesture-bar" aria-hidden>
              <span className="gesture-bar-fill" style={{ width: `${level * 100}%` }} />
            </span>
          </div>
        )
      })}
    </div>
  )
}
