import { CircleHelp, FolderOpen, LoaderCircle, Moon, Sun, Video, VideoOff } from 'lucide-react'
import type { CameraStatus } from '../hooks/useCamera'
import { toCssHex } from '../slime/color'
import { useThemeStore } from '../store/themeStore'
import './TopBar.css'

type Props = {
  color: number
  cameraStatus: CameraStatus
  onToggleCamera: () => void
  libraryOpen: boolean
  onToggleLibrary: () => void
  libraryButtonRef: React.Ref<HTMLButtonElement>
  onHelp: () => void
}

export function TopBar({
  color,
  cameraStatus,
  onToggleCamera,
  libraryOpen,
  onToggleLibrary,
  libraryButtonRef,
  onHelp,
}: Props) {
  const cameraOn = cameraStatus === 'streaming' || cameraStatus === 'requesting'
  return (
    <header className="topbar">
      <h1 className="brand">
        <span className="brand-mark" style={{ background: toCssHex(color) }} aria-hidden />
        MotionPlaying
      </h1>

      <nav className="topbar-actions" aria-label="메뉴">
        <button
          type="button"
          className="btn"
          aria-pressed={cameraOn}
          aria-label={cameraOn ? '카메라 끄기' : '손으로 조작하기 (카메라 켜기)'}
          data-tip={cameraOn ? '카메라 끄기' : '카메라로 손동작을 인식해요'}
          data-tip-pos="below"
          onClick={onToggleCamera}
        >
          {cameraStatus === 'requesting' ? (
            <LoaderCircle size={16} className="spin" aria-hidden />
          ) : cameraOn ? (
            <VideoOff size={16} aria-hidden />
          ) : (
            <Video size={16} aria-hidden />
          )}
          <span className="topbar-label">{cameraOn ? '카메라 끄기' : '손으로 조작하기'}</span>
        </button>
        <button
          ref={libraryButtonRef}
          type="button"
          className="btn"
          aria-pressed={libraryOpen}
          aria-label="내 슬라임"
          onClick={onToggleLibrary}
        >
          <FolderOpen size={16} aria-hidden />
          <span className="topbar-label">내 슬라임</span>
        </button>
        <button
          type="button"
          className="btn btn-icon"
          aria-label="사용법"
          data-tip="사용법 (?)"
          data-tip-pos="below"
          onClick={onHelp}
        >
          <CircleHelp size={16} aria-hidden />
        </button>
        <ThemeButton />
      </nav>
    </header>
  )
}

function ThemeButton() {
  const resolved = useThemeStore((s) => s.resolved)
  const setPreference = useThemeStore((s) => s.setPreference)
  const next = resolved === 'dark' ? 'light' : 'dark'
  const label = next === 'dark' ? '어두운 화면으로' : '밝은 화면으로'
  return (
    <button
      type="button"
      className="btn btn-icon"
      aria-label={label}
      data-tip={label}
      data-tip-pos="below"
      onClick={() => setPreference(next)}
    >
      {resolved === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
    </button>
  )
}
