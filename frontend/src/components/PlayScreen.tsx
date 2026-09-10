import type { CameraStatus } from '../hooks/useCamera'
import { useCamera } from '../hooks/useCamera'
import { useHandTracking } from '../hooks/useHandTracking'
import './PlayScreen.css'

export function PlayScreen() {
  const { videoRef, status: cameraStatus, error: cameraError, start } = useCamera()
  const streaming = cameraStatus === 'streaming'
  const {
    overlayRef,
    status: trackerStatus,
    error: trackerError,
    handCount,
    fps,
  } = useHandTracking(videoRef, streaming)

  return (
    <div className="stage">
      <div className="viewport">
        <video
          ref={videoRef}
          className="camera-feed"
          playsInline
          muted
          data-active={streaming}
        />
        <canvas ref={overlayRef} className="hand-overlay" data-active={streaming} />

        {streaming && (
          <div className="hud">
            <StatusBadge
              status={trackerStatus}
              error={trackerError}
              handCount={handCount}
              fps={fps}
            />
          </div>
        )}

        {!streaming && (
          <Onboarding status={cameraStatus} error={cameraError} onStart={start} />
        )}
      </div>
    </div>
  )
}

function StatusBadge({
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
  if (status === 'loading') {
    return <span className="badge badge--wait">손 인식 모델 로딩 중…</span>
  }
  if (status === 'error') {
    return <span className="badge badge--error">{error ?? '인식 오류'}</span>
  }
  if (handCount === 0) {
    return <span className="badge badge--wait">손을 카메라에 보여주세요</span>
  }
  return (
    <span className="badge badge--ok">
      손 {handCount}개 인식 중 · {fps}fps
    </span>
  )
}

function Onboarding({
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
    <div className="onboarding">
      <h1>MotionPlaying</h1>
      <p className="tagline">
        손동작으로 슬라임을 조몰락거리며 노는 웹 인터랙티브 플레이
      </p>
      <ol className="guide">
        <li>밝은 곳에서 카메라에 손이 잘 보이도록 하세요.</li>
        <li>손을 쥐면 누르기, 펴면 늘리기 동작이 됩니다.</li>
        <li>영상은 기기에서만 처리되며 서버로 전송되지 않습니다.</li>
      </ol>
      <button
        type="button"
        className="start-btn"
        onClick={onStart}
        disabled={requesting}
      >
        {requesting ? '카메라 준비 중…' : '카메라 시작'}
      </button>
      {error && <p className="onboarding-error">{error}</p>}
    </div>
  )
}
