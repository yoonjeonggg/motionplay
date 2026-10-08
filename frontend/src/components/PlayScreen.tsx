import { useEffect, useState } from 'react'
import {
  CircleHelp,
  Eraser,
  Film,
  ImageDown,
  Link,
  LoaderCircle,
  RotateCcw,
  X,
} from 'lucide-react'
import { AuthWidget } from './AuthWidget'
import { CameraDock } from './CameraDock'
import { GalleryPanel } from './GalleryPanel'
import { Onboarding } from './Onboarding'
import { type Mode, SlimePanel } from './SlimePanel'
import { ThemeToggle } from './ThemeToggle'
import type { CreationInput, SharedCreation } from '../api/client'
import { useSharedCreation } from '../hooks/useSharedCreation'
import { useSlimePointer } from '../hooks/useSlimePointer'
import { readStorage, writeStorage } from '../lib/storage'
import { DEFAULT_SLIME_COLOR, DEFAULT_SOFTNESS } from '../slime/palette'
import { type ToppingKind, TOPPING_KINDS } from '../slime/toppings'
import { useSlime } from '../slime/useSlime'
import './PlayScreen.css'

const ONBOARDING_KEY = 'mp.onboarding.seen'

export function PlayScreen() {
  const { canvasRef, controller, ready } = useSlime()

  const [color, setColor] = useState(DEFAULT_SLIME_COLOR)
  const [softness, setSoftness] = useState(DEFAULT_SOFTNESS)
  const [mode, setMode] = useState<Mode>('squish')
  const [toppingKind, setToppingKind] = useState<ToppingKind>(TOPPING_KINDS[0])
  const [streaming, setStreaming] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(
    () => readStorage(ONBOARDING_KEY) !== '1',
  )
  const [recordingGif, setRecordingGif] = useState(false)

  const onRecordGif = async () => {
    if (recordingGif) return
    setRecordingGif(true)
    try {
      await controller.current?.recordGif()
    } finally {
      setRecordingGif(false)
    }
  }

  const closeOnboarding = () => {
    writeStorage(ONBOARDING_KEY, '1')
    setShowOnboarding(false)
  }

  useEffect(() => {
    if (!ready) return
    controller.current?.setColor(color)
    controller.current?.setSoftness(softness)
  }, [ready, color, softness, controller])

  const currentCreation = (): CreationInput => ({
    title: '',
    color,
    softness,
    toppings: controller.current?.snapshotToppings() ?? [],
  })

  const loadCreation = (c: SharedCreation) => {
    setColor(c.color)
    setSoftness(c.softness)
    controller.current?.loadToppings(c.toppings)
  }

  const { sharedTitle, dismissShared } = useSharedCreation(ready, loadCreation)
  const pointerHandlers = useSlimePointer(controller, mode, toppingKind)

  return (
    <div className="stage">
      {sharedTitle && (
        <div className="share-banner" role="status">
          <Link size={14} aria-hidden />
          <span>공유된 슬라임 &lsquo;{sharedTitle}&rsquo;을 불러왔어요</span>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={dismissShared}
            aria-label="닫기"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="slime-canvas"
        data-mode={mode}
        {...pointerHandlers}
      />

      <div className="left-dock">
        <SlimePanel
          color={color}
          softness={softness}
          mode={mode}
          toppingKind={toppingKind}
          onColor={setColor}
          onSoftness={setSoftness}
          onMode={setMode}
          onToppingKind={setToppingKind}
        />
        <GalleryPanel getCurrent={currentCreation} onLoad={loadCreation} />
      </div>

      <CameraDock
        controller={controller}
        toppingKind={toppingKind}
        onStreamingChange={setStreaming}
      />

      <div className="bottom-bar">
        <div className="bottom-bar-start">
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setShowOnboarding(true)}
            title="사용법 보기"
            aria-label="사용법 보기"
          >
            <CircleHelp size={16} aria-hidden />
          </button>
          <ThemeToggle />
        </div>

        <div className="bottom-bar-center">
          <p className="hint">{hintText(streaming, mode)}</p>
          <div className="toolbar" role="toolbar" aria-label="슬라임 작업">
            <ToolButton
              label="다시 뭉치기"
              icon={<RotateCcw size={16} aria-hidden />}
              onClick={() => controller.current?.reset()}
            />
            <ToolButton
              label="토핑 비우기"
              icon={<Eraser size={16} aria-hidden />}
              onClick={() => controller.current?.clearToppings()}
            />
            <span className="toolbar-divider" aria-hidden />
            <ToolButton
              label="이미지 저장"
              icon={<ImageDown size={16} aria-hidden />}
              onClick={() => controller.current?.screenshot()}
            />
            <ToolButton
              label={recordingGif ? 'GIF 녹화 중' : 'GIF 저장'}
              icon={
                recordingGif ? (
                  <LoaderCircle size={16} className="spin" aria-hidden />
                ) : (
                  <Film size={16} aria-hidden />
                )
              }
              onClick={onRecordGif}
              busy={recordingGif}
            />
          </div>
        </div>

        <div className="bottom-bar-end">
          <AuthWidget />
        </div>
      </div>

      {showOnboarding && <Onboarding onClose={closeOnboarding} />}
    </div>
  )
}

function ToolButton({
  label,
  icon,
  onClick,
  busy = false,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  busy?: boolean
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost tool-btn"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      title={label}
    >
      {icon}
      <span className="tool-btn-label">{label}</span>
    </button>
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
