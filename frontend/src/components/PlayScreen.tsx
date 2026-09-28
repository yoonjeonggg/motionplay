import { useEffect, useRef, useState } from 'react'
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
import { api } from '../api/client'
import type { Creation, CreationInput, SharedCreation } from '../api/client'
import { readStorage, writeStorage } from '../lib/storage'
import { DEFAULT_SLIME_COLOR, DEFAULT_SOFTNESS } from '../slime/palette'
import { type ToppingKind, TOPPING_KINDS } from '../slime/toppings'
import { useSlime } from '../slime/useSlime'
import './PlayScreen.css'

const GRAB_RADIUS = 92
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

  const loadCreation = (c: Creation | SharedCreation) => {
    setColor(c.color)
    setSoftness(c.softness)
    controller.current?.loadToppings(c.toppings)
  }

  // A ?share= link is fetched right away but can only be applied once the
  // slime renderer is ready. Chaining onto the request promise applies it
  // whichever finishes last — the fetch or the renderer init. (The previous
  // version only re-checked on `ready`, so a fetch slower than renderer init
  // was silently dropped.)
  const [sharedTitle, setSharedTitle] = useState<string | null>(null)
  const [sharedRequest] = useState(() => fetchSharedFromUrl())
  const sharedApplied = useRef(false)

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    void sharedRequest.then((creation) => {
      if (!creation || cancelled || sharedApplied.current) return
      sharedApplied.current = true
      setSharedTitle(creation.title)
      setColor(creation.color)
      setSoftness(creation.softness)
      controller.current?.loadToppings(creation.toppings)
    })
    return () => {
      cancelled = true
    }
  }, [ready, sharedRequest, controller])

  const dismissShared = () => {
    setSharedTitle(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('share')
    window.history.replaceState({}, '', url)
  }

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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={onPointerLeave}
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

async function fetchSharedFromUrl(): Promise<SharedCreation | null> {
  const slug = new URLSearchParams(window.location.search).get('share')
  if (!slug) return null
  try {
    return (await api.getShared(slug)).creation
  } catch {
    return null // unknown/expired link: just show the default slime
  }
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
