import { useRef } from 'react'
import type { CameraStatus } from '../hooks/useCamera'
import { useCamera } from '../hooks/useCamera'
import { useHandTracking } from '../hooks/useHandTracking'
import { useSlime } from '../slime/useSlime'
import './PlayScreen.css'

const GRAB_RADIUS = 92

export function PlayScreen() {
  const { canvasRef, controller } = useSlime()

  const { videoRef, status: cameraStatus, error: cameraError, start } = useCamera()
  const streaming = cameraStatus === 'streaming'
  const {
    overlayRef,
    status: trackerStatus,
    error: trackerError,
    handCount,
    fps,
  } = useHandTracking(videoRef, streaming)

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

      <p className="hint">슬라임을 드래그해 누르고 늘려 보세요</p>

      <div className="camera-dock">
        <div className="pip" data-streaming={streaming}>
          <video ref={videoRef} className="pip-feed" playsInline muted />
          <canvas ref={overlayRef} className="pip-overlay" />
          {streaming && (
            <TrackerBadge
              status={trackerStatus}
              error={trackerError}
              handCount={handCount}
              fps={fps}
            />
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
