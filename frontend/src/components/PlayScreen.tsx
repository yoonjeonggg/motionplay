import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { Link, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import type { Creation, SharedCreation } from '../api/client'
import { useCamera } from '../hooks/useCamera'
import { useSharedCreation } from '../hooks/useSharedCreation'
import { useSlimePointer } from '../hooks/useSlimePointer'
import { readStorage, writeStorage } from '../lib/storage'
import { DEFAULT_SLIME_COLOR, DEFAULT_SOFTNESS } from '../slime/palette'
import { MAX_TOPPINGS, type ToppingKind } from '../slime/toppings'
import { isToppingTool, type Tool, TOOLS } from '../slime/tools'
import { useSlime } from '../slime/useSlime'
import { useAuthStore } from '../store/authStore'
import { useCreationsStore } from '../store/creationsStore'
import { toast } from '../store/toastStore'
import { CameraView } from './CameraView'
import { Dock } from './Dock'
import { LibraryDrawer } from './LibraryDrawer'
import { Onboarding } from './Onboarding'
import { type Loaded, SaveControl } from './SaveControl'
import { Toaster } from './Toaster'
import { TopBar } from './TopBar'
import { TOOL_META } from './toolMeta'
import './PlayScreen.css'

const ONBOARDING_KEY = 'mp.onboarding.seen'
/** Space kept between the slime's resting floor and the dock. */
const FLOOR_GAP = 12

const isPhone = () => window.matchMedia('(max-width: 720px)').matches

export function PlayScreen() {
  const { hostRef, controller, status: slimeStatus } = useSlime()
  const ready = slimeStatus === 'ready'

  const [color, setColor] = useState(DEFAULT_SLIME_COLOR)
  const [softness, setSoftness] = useState(DEFAULT_SOFTNESS)
  const [tool, setTool] = useState<Tool>('squish')
  // What a pinch picks up with the camera: the last topping tool chosen.
  const [pinchTopping, setPinchTopping] = useState<ToppingKind>('star')
  const [recordingGif, setRecordingGif] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => readStorage(ONBOARDING_KEY) !== '1')

  const camera = useCamera()
  const cameraOn = camera.status === 'streaming' || camera.status === 'requesting'

  // Account + library ------------------------------------------------------
  const authStatus = useAuthStore((s) => s.status)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const restoreAuth = useAuthStore((s) => s.restore)
  const authed = authStatus === 'authed'
  const refreshCreations = useCreationsStore((s) => s.refresh)
  const clearCreations = useCreationsStore((s) => s.clear)

  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryNotice, setLibraryNotice] = useState<string | null>(null)
  const libraryButtonRef = useRef<HTMLButtonElement>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  // Set when "save" sent a signed-out user to log in; saving resumes after.
  const [pendingSave, setPendingSave] = useState(false)
  // Tagged with its owner, so after logging out (or into another account)
  // "overwrite" can't target the previous account's creation.
  const [loadedFor, setLoadedFor] = useState<(Loaded & { userId: number }) | null>(null)
  const creations = useCreationsStore((s) => s.items)
  const creationsReady = useCreationsStore((s) => s.status === 'ready')
  // Also forget it once it's deleted, or "overwrite" would hit a 404.
  const loaded =
    loadedFor &&
    loadedFor.userId === userId &&
    (!creationsReady || creations.some((c) => c.id === loadedFor.id))
      ? loadedFor
      : null
  const setLoaded = (c: Creation) =>
    userId !== null && setLoadedFor({ id: c.id, title: c.title, userId })

  useEffect(() => {
    void restoreAuth()
  }, [restoreAuth])

  useEffect(() => {
    if (authed) void refreshCreations()
    else clearCreations()
  }, [authed, refreshCreations, clearCreations])

  const closeLibrary = useCallback(() => {
    setLibraryOpen(false)
    setLibraryNotice(null)
    setPendingSave(false)
  }, [])

  const onAuthed = () => {
    if (!pendingSave) return
    closeLibrary()
    setSaveOpen(true)
  }

  const requestLogin = () => {
    setLibraryNotice('저장하려면 로그인해 주세요. 지금 만든 슬라임은 그대로 남아 있어요.')
    setPendingSave(true)
    setLibraryOpen(true)
  }

  // Slime ----------------------------------------------------------------
  useEffect(() => {
    if (!ready) return
    controller.current?.setColor(color)
    controller.current?.setSoftness(softness)
  }, [ready, color, softness, controller])

  // Switching away from a topping tool drops its hover preview.
  useEffect(() => {
    if (!isToppingTool(tool)) controller.current?.setHeldTopping(null, null)
  }, [tool, controller])

  // Keep the slime resting above the dock instead of sinking behind it.
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const bottom = bottomRef.current
    const stage = hostRef.current
    if (!ready || !bottom || !stage) return
    const update = () => {
      const inset = stage.getBoundingClientRect().bottom - bottom.getBoundingClientRect().top
      controller.current?.setFloorInset(inset + FLOOR_GAP)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(bottom)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [ready, controller, hostRef])

  const chooseTool = useCallback((t: Tool) => {
    setTool(t)
    if (isToppingTool(t)) setPinchTopping(t)
  }, [])

  const applyCreation = (c: SharedCreation) => {
    setColor(c.color)
    setSoftness(c.softness)
    controller.current?.loadToppings(c.toppings)
  }

  const loadCreation = (c: Creation) => {
    applyCreation(c)
    setLoaded(c)
    toast(`'${c.title}'을(를) 불러왔어요`)
    // The bottom sheet covers the slime on phones; get out of the way.
    if (isPhone()) closeLibrary()
  }

  const { sharedTitle, dismissShared } = useSharedCreation(ready, applyCreation, (message) =>
    toast(message, 'error'),
  )

  const pointerHandlers = useSlimePointer(controller, tool, () =>
    toast(`토핑은 최대 ${MAX_TOPPINGS}개까지 붙일 수 있어요`, 'error'),
  )

  // Actions --------------------------------------------------------------
  const reset = () => controller.current?.reset()

  const clearToppings = () => {
    const n = controller.current?.toppingCount() ?? 0
    if (n === 0) {
      toast('붙어 있는 토핑이 없어요')
      return
    }
    controller.current?.clearToppings()
    toast(`토핑 ${n}개를 지웠어요`)
  }

  const screenshot = async () => {
    try {
      await controller.current?.screenshot()
    } catch {
      toast('이미지를 저장하지 못했어요', 'error')
    }
  }

  const recordGif = async () => {
    if (recordingGif || !controller.current) return
    setRecordingGif(true)
    toast('2.5초 동안 녹화해요. 슬라임을 움직여 보세요!')
    try {
      if (await controller.current.recordGif()) toast('움짤을 저장했어요', 'success')
    } catch {
      toast('움짤을 만들지 못했어요', 'error')
    } finally {
      setRecordingGif(false)
    }
  }

  const toggleCamera = () => {
    if (cameraOn) camera.stop()
    else void camera.start()
  }

  useEffect(() => {
    if (camera.error) toast(camera.error, 'error')
  }, [camera.error])

  const closeOnboarding = useCallback(() => {
    writeStorage(ONBOARDING_KEY, '1')
    setShowOnboarding(false)
  }, [])

  // Keyboard shortcuts: 1-4 tools, R reset, ? help.
  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
    const t = e.target
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
    const n = Number(e.key)
    if (n >= 1 && n <= TOOLS.length) chooseTool(TOOLS[n - 1])
    else if (e.key === 'r' || e.key === 'R') reset()
    else if (e.key === '?') setShowOnboarding(true)
  })
  useEffect(() => {
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [])

  return (
    <div className="stage">
      <div ref={hostRef} className="slime-host" data-tool={tool} {...pointerHandlers} />

      {slimeStatus !== 'ready' && <SlimeStatusOverlay status={slimeStatus} />}

      <TopBar
        color={color}
        cameraStatus={camera.status}
        onToggleCamera={toggleCamera}
        libraryOpen={libraryOpen}
        onToggleLibrary={() => (libraryOpen ? closeLibrary() : setLibraryOpen(true))}
        libraryButtonRef={libraryButtonRef}
        onHelp={() => setShowOnboarding(true)}
      />

      {sharedTitle && (
        <div className="share-banner" role="status">
          <Link size={14} aria-hidden />
          <span>
            공유받은 슬라임 <b>{sharedTitle}</b>
          </span>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={dismissShared} aria-label="닫기">
            <X size={14} aria-hidden />
          </button>
        </div>
      )}

      <CameraView
        videoRef={camera.videoRef}
        status={camera.status}
        onStop={camera.stop}
        controller={controller}
        toppingKind={pinchTopping}
      />

      <LibraryDrawer
        open={libraryOpen}
        onClose={closeLibrary}
        notice={libraryNotice}
        loadedId={loaded?.id ?? null}
        onLoad={loadCreation}
        onAuthed={onAuthed}
        toggleRef={libraryButtonRef}
      />

      <div className="bottom" ref={bottomRef}>
        <Toaster />
        <p className="hint">{hintText(tool, camera.status === 'streaming')}</p>
        <Dock
          tool={tool}
          onTool={chooseTool}
          color={color}
          onColor={setColor}
          softness={softness}
          onSoftness={setSoftness}
          onReset={reset}
          onClearToppings={clearToppings}
          onScreenshot={() => void screenshot()}
          onRecordGif={() => void recordGif()}
          recordingGif={recordingGif}
        >
          <SaveControl
            open={saveOpen}
            onOpenChange={setSaveOpen}
            authed={authed}
            loaded={loaded}
            suggestedTitle={sharedTitle ?? ''}
            getCurrent={() => ({
              color,
              softness,
              toppings: controller.current?.snapshotToppings() ?? [],
            })}
            onRequestLogin={requestLogin}
            onSaved={setLoaded}
          />
        </Dock>
      </div>

      {showOnboarding && (
        <Onboarding onClose={closeOnboarding} onStartCamera={() => void camera.start()} />
      )}
    </div>
  )
}

function SlimeStatusOverlay({ status }: { status: 'loading' | 'error' }) {
  return (
    <div className="slime-status" role="status">
      {status === 'loading' ? (
        <>
          <LoaderCircle size={20} className="spin" aria-hidden />
          <span>슬라임 준비 중</span>
        </>
      ) : (
        <>
          <TriangleAlert size={20} aria-hidden />
          <span>
            이 브라우저에서 그래픽(WebGL)을 쓸 수 없어 슬라임을 보여 줄 수 없어요.
            <br />
            하드웨어 가속을 켜거나 다른 브라우저로 열어 주세요.
          </span>
        </>
      )}
    </div>
  )
}

function hintText(tool: Tool, handsOn: boolean): string {
  if (handsOn) {
    return isToppingTool(tool)
      ? '엄지와 검지로 집었다가 슬라임 위에서 놓으면 토핑이 붙어요'
      : '주먹을 쥐고 움직이면 잡히고, 편 손을 휙 움직이면 눌려요'
  }
  if (isToppingTool(tool)) return `슬라임을 클릭하면 ${TOOL_META[tool].label}이 붙어요`
  return '슬라임을 드래그해서 늘리고 옮겨 보세요'
}
