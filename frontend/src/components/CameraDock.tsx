import { useEffect, useRef, useState } from 'react'
import { Hand, HandFist, HandGrab, LoaderCircle, ShieldCheck, Video } from 'lucide-react'
import { type CameraStatus, useCamera } from '../hooks/useCamera'
import { type TrackerStatus, useHandTracking } from '../hooks/useHandTracking'
import { clamp01 } from '../lib/math'
import { createHandSlimeDriver, type HandGesture } from '../slime/handControl'
import type { ToppingKind } from '../slime/toppings'
import type { SlimeController } from '../slime/useSlime'
import './CameraDock.css'

const GESTURE_UI_INTERVAL = 120

type Props = {
  controller: React.RefObject<SlimeController | null>
  toppingKind: ToppingKind
  onStreamingChange: (streaming: boolean) => void
}

/**
 * Webcam preview + hand tracking. Owns all per-frame hand state, so gesture
 * and fps readouts re-render only this dock, not the whole play screen.
 */
export function CameraDock({ controller, toppingKind, onStreamingChange }: Props) {
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

  const { videoRef, status: cameraStatus, error: cameraError, start } = useCamera()
  const streaming = cameraStatus === 'streaming'
  const {
    overlayRef,
    status: trackerStatus,
    error: trackerError,
    handCount,
    fps,
  } = useHandTracking(videoRef, streaming, (hands) => driverRef.current?.update(hands))

  useEffect(() => {
    onStreamingChange(streaming)
  }, [streaming, onStreamingChange])

  return (
    <div className="camera-dock">
      <div className="pip" data-streaming={streaming}>
        <video ref={videoRef} className="pip-feed" playsInline muted />
        <canvas ref={overlayRef} className="pip-overlay" />
        {streaming && (
          <>
            <TrackerBadge
              status={trackerStatus}
              error={trackerError}
              handCount={handCount}
              fps={fps}
            />
            <GestureStrip gestures={gestures} />
          </>
        )}
      </div>

      {!streaming && (
        <HandControlPrompt status={cameraStatus} error={cameraError} onStart={start} />
      )}
    </div>
  )
}

function TrackerBadge({
  status,
  error,
  handCount,
  fps,
}: {
  status: TrackerStatus
  error: string | null
  handCount: number
  fps: number
}) {
  let text: string
  let tone: 'wait' | 'ok' | 'error' = 'wait'
  if (status === 'loading') text = '손 인식 모델 로딩 중'
  else if (status === 'error') {
    text = error ?? '인식 오류'
    tone = 'error'
  } else if (handCount === 0) text = '손을 보여주세요'
  else {
    text = `손 ${handCount}개 · ${fps}fps`
    tone = 'ok'
  }
  return (
    <span className="pip-badge" data-tone={tone}>
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
        const label = g.pinching ? '집기' : g.gripping ? '주먹' : '편 손'
        return (
          <div
            key={i}
            className="gesture-chip"
            data-active={g.gripping || g.pinching}
            title={label}
          >
            <Icon size={14} aria-label={label} />
            <span className="gesture-bar">
              <span className="gesture-bar-fill" style={{ width: `${level * 100}%` }} />
            </span>
          </div>
        )
      })}
    </div>
  )
}

function HandControlPrompt({
  status,
  error,
  onStart,
}: {
  status: CameraStatus
  error: string | null
  onStart: () => void
}) {
  const requesting = status === 'requesting'
  return (
    <div className="panel hand-prompt">
      <button
        type="button"
        className="btn btn-primary"
        onClick={onStart}
        disabled={requesting}
        aria-busy={requesting}
      >
        {requesting ? (
          <LoaderCircle size={16} className="spin" aria-hidden />
        ) : (
          <Video size={16} aria-hidden />
        )}
        {requesting ? '카메라 준비 중' : '손으로 조작하기'}
      </button>
      <p className="hand-prompt-note">
        <ShieldCheck size={14} aria-hidden />
        영상은 기기에서만 처리되며 서버로 전송되지 않습니다.
      </p>
      {error && <p className="text-error">{error}</p>}
    </div>
  )
}
