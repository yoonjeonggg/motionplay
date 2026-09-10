import { useRef, useState } from 'react'
import type { CameraStatus } from '../hooks/useCamera'
import { useCamera } from '../hooks/useCamera'
import { useHandTracking } from '../hooks/useHandTracking'
import { createHandSlimeDriver, type HandGesture } from '../slime/handControl'
import { useSlime } from '../slime/useSlime'
import './PlayScreen.css'

const GRAB_RADIUS = 92
const GESTURE_UI_INTERVAL = 120

export function PlayScreen() {
  const { canvasRef, controller } = useSlime()

  const [gestures, setGestures] = useState<HandGesture[]>([])
  const lastGestureUi = useRef(0)

  const handDriverRef = useRef<ReturnType<typeof createHandSlimeDriver> | null>(
    null,
  )
  handDriverRef.current ??= createHandSlimeDriver(
    () => controller.current,
    {},
    (next) => {
      const now = performance.now()
      if (now - lastGestureUi.current < GESTURE_UI_INTERVAL) return
      lastGestureUi.current = now
      setGestures(next)
    },
  )

  const { videoRef, status: cameraStatus, error: cameraError, start } = useCamera()
  const streaming = cameraStatus === 'streaming'
  const {
    overlayRef,
    status: trackerStatus,
    error: trackerError,
    handCount,
    fps,
  } = useHandTracking(videoRef, streaming, (hands) =>
    handDriverRef.current?.update(hands),
  )

  const dragging = useRef(false)
  const last = useRef({ x: 0, y: 0 })

  const toLocal = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragging.current = true
    last.current = toLocal(e)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return
    const p = toLocal(e)
    controller.current?.grab(
      last.current,
      { x: p.x - last.current.x, y: p.y - last.current.y },
      GRAB_RADIUS,
    )
    last.current = p
  }

  const endDrag = () => {
    dragging.current = false
    controller.current?.release()
  }

  return (
    <div className="stage">
      <canvas
        ref={canvasRef}
        className="slime-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />

      <div className="dock-bottom">
        <p className="hint">
          {streaming
            ? '주먹을 쥐어 잡고, 편 손으로 밀어 보세요'
            : '슬라임을 드래그해 누르고 늘려 보세요'}
        </p>
        <button
          type="button"
          className="reset-btn"
          onClick={() => controller.current?.reset()}
        >
          다시 뭉치기
        </button>
      </div>

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
          <HandControlPrompt
            status={cameraStatus}
            error={cameraError}
            onStart={start}
          />
        )}
      </div>
    </div>
  )
}

function TrackerBadge({
  status,
  error,
  handCount,
  fps,
}: {
  status: ReturnType<typeof useHandTracking>['status']
  error: string | null
  handCount: number
  fps: number
}) {
  let text = ''
  let tone = 'wait'
  if (status === 'loading') text = '손 인식 모델 로딩 중…'
  else if (status === 'error') {
    text = error ?? '인식 오류'
    tone = 'error'
  } else if (handCount === 0) text = '손을 보여주세요'
  else {
    text = `손 ${handCount}개 · ${fps}fps`
    tone = 'ok'
  }
  return <span className={`pip-badge pip-badge--${tone}`}>{text}</span>
}

function GestureStrip({ gestures }: { gestures: HandGesture[] }) {
  if (gestures.length === 0) return null
  return (
    <div className="gesture-strip">
      {gestures.map((g, i) => {
        // openness ~0.7 (fist) .. ~2.2 (open) → 0..1 bar
        const level = Math.max(0, Math.min(1, (g.openness - 0.7) / 1.5))
        return (
          <div key={i} className="gesture-chip" data-grip={g.gripping}>
            <span className="gesture-icon">{g.gripping ? '✊' : '✋'}</span>
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
    <div className="hand-prompt">
      <button
        type="button"
        className="hand-prompt-btn"
        onClick={onStart}
        disabled={requesting}
      >
        {requesting ? '카메라 준비 중…' : '✋ 손으로 조작하기'}
      </button>
      <p className="hand-prompt-note">
        영상은 기기에서만 처리되며 서버로 전송되지 않습니다.
      </p>
      {error && <p className="hand-prompt-error">{error}</p>}
    </div>
  )
}
