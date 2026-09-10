import { useEffect, useRef, useState } from 'react'
import { AuthWidget } from './AuthWidget'
import type { CameraStatus } from '../hooks/useCamera'
import { useCamera } from '../hooks/useCamera'
import { useHandTracking } from '../hooks/useHandTracking'
import { createHandSlimeDriver, type HandGesture } from '../slime/handControl'
import { type ToppingKind, TOPPING_KINDS } from '../slime/toppings'
import { useSlime } from '../slime/useSlime'
import './PlayScreen.css'

const GRAB_RADIUS = 92
const GESTURE_UI_INTERVAL = 120

const SLIME_COLORS = [
  { name: '민트', rgb: 0x7cf29c, css: '#7cf29c' },
  { name: '핑크', rgb: 0xf9a8d4, css: '#f9a8d4' },
  { name: '블루', rgb: 0x93c5fd, css: '#93c5fd' },
  { name: '퍼플', rgb: 0xc4b5fd, css: '#c4b5fd' },
  { name: '옐로', rgb: 0xfde68a, css: '#fde68a' },
]
const DEFAULT_SOFTNESS = 0.4

const TOPPING_LABEL: Record<ToppingKind, string> = {
  star: '★',
  heart: '♥',
  pearl: '⬤',
}

type Mode = 'squish' | 'topping'

export function PlayScreen() {
  const { canvasRef, controller, ready } = useSlime()

  const [gestures, setGestures] = useState<HandGesture[]>([])
  const lastGestureUi = useRef(0)

  const [colorIndex, setColorIndex] = useState(0)
  const [softness, setSoftness] = useState(DEFAULT_SOFTNESS)
  const [mode, setMode] = useState<Mode>('squish')
  const [toppingKind, setToppingKind] = useState<ToppingKind>(TOPPING_KINDS[0])

  useEffect(() => {
    if (!ready) return
    controller.current?.setColor(SLIME_COLORS[colorIndex].rgb)
    controller.current?.setSoftness(softness)
  }, [ready, colorIndex, softness, controller])

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

  useEffect(() => {
    handDriverRef.current?.setSelectedTopping(toppingKind)
  }, [toppingKind])

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
    const p = toLocal(e)
    if (mode === 'topping') {
      controller.current?.addTopping(toppingKind, p)
      return
    }
    dragging.current = true
    last.current = p
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toLocal(e)
    if (mode === 'topping') {
      controller.current?.setHeldTopping(toppingKind, p)
      return
    }
    if (!dragging.current) return
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

  const onPointerLeave = () => {
    endDrag()
    if (mode === 'topping') controller.current?.setHeldTopping(null, null)
  }

  return (
    <div className="stage">
      <canvas
        ref={canvasRef}
        className="slime-canvas"
        data-mode={mode}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={onPointerLeave}
      />

      <SlimePanel
        colorIndex={colorIndex}
        softness={softness}
        mode={mode}
        toppingKind={toppingKind}
        onColor={setColorIndex}
        onSoftness={setSoftness}
        onMode={setMode}
        onToppingKind={setToppingKind}
      />

      <div className="dock-bottom">
        <p className="hint">{hintText(streaming, mode)}</p>
        <div className="dock-actions">
          <button
            type="button"
            className="reset-btn"
            onClick={() => controller.current?.reset()}
          >
            다시 뭉치기
          </button>
          <button
            type="button"
            className="reset-btn"
            onClick={() => controller.current?.clearToppings()}
          >
            토핑 비우기
          </button>
        </div>
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

      <AuthWidget />
    </div>
  )
}

function hintText(streaming: boolean, mode: Mode): string {
  if (mode === 'topping') {
    return streaming
      ? '손가락을 집어 토핑을 슬라임 위에 놓으세요'
      : '슬라임 위를 클릭해 토핑을 붙이세요'
  }
  return streaming
    ? '주먹을 쥐어 잡고, 편 손으로 밀어 보세요'
    : '슬라임을 드래그해 누르고 늘려 보세요'
}

function SlimePanel({
  colorIndex,
  softness,
  mode,
  toppingKind,
  onColor,
  onSoftness,
  onMode,
  onToppingKind,
}: {
  colorIndex: number
  softness: number
  mode: Mode
  toppingKind: ToppingKind
  onColor: (i: number) => void
  onSoftness: (v: number) => void
  onMode: (m: Mode) => void
  onToppingKind: (k: ToppingKind) => void
}) {
  return (
    <div className="slime-panel">
      <div className="panel-row">
        <span className="panel-label">색상</span>
        <div className="swatches">
          {SLIME_COLORS.map((c, i) => (
            <button
              key={c.name}
              type="button"
              className="swatch"
              style={{ background: c.css }}
              data-active={i === colorIndex}
              aria-label={c.name}
              aria-pressed={i === colorIndex}
              onClick={() => onColor(i)}
            />
          ))}
        </div>
      </div>

      <div className="panel-row">
        <span className="panel-label">말랑함</span>
        <input
          type="range"
          className="softness"
          min={0}
          max={1}
          step={0.05}
          value={softness}
          onChange={(e) => onSoftness(Number(e.target.value))}
        />
      </div>

      <div className="panel-row">
        <span className="panel-label">모드</span>
        <div className="mode-toggle">
          <button
            type="button"
            data-active={mode === 'squish'}
            onClick={() => onMode('squish')}
          >
            주무르기
          </button>
          <button
            type="button"
            data-active={mode === 'topping'}
            onClick={() => onMode('topping')}
          >
            토핑
          </button>
        </div>
      </div>

      {mode === 'topping' && (
        <div className="panel-row">
          <span className="panel-label">토핑</span>
          <div className="mode-toggle">
            {TOPPING_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                data-active={k === toppingKind}
                onClick={() => onToppingKind(k)}
              >
                {TOPPING_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
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
        const level = Math.max(0, Math.min(1, (g.openness - 0.7) / 1.5))
        const icon = g.pinching ? '🤏' : g.gripping ? '✊' : '✋'
        return (
          <div
            key={i}
            className="gesture-chip"
            data-grip={g.gripping || g.pinching}
          >
            <span className="gesture-icon">{icon}</span>
            <span className="gesture-bar">
              <span
                className="gesture-bar-fill"
                style={{ width: `${level * 100}%` }}
              />
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
