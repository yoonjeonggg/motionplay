import { useRef, useState } from 'react'
import { Download, Eraser, Film, ImageDown, LoaderCircle, RotateCcw } from 'lucide-react'
import { useDismiss } from '../hooks/useDismiss'
import { toCssHex } from '../slime/color'
import { SLIME_COLORS } from '../slime/palette'
import { TOOLS, type Tool } from '../slime/tools'
import { TOOL_META } from './toolMeta'
import './Dock.css'

type Props = {
  tool: Tool
  onTool: (t: Tool) => void
  color: number
  onColor: (rgb: number) => void
  softness: number
  onSoftness: (v: number) => void
  onReset: () => void
  onClearToppings: () => void
  onScreenshot: () => void
  onRecordGif: () => void
  recordingGif: boolean
  /** The save control, rendered at the end of the dock. */
  children: React.ReactNode
  ref?: React.Ref<HTMLDivElement>
}

/** The one place for everything you do to the slime. */
export function Dock({
  tool,
  onTool,
  color,
  onColor,
  softness,
  onSoftness,
  onReset,
  onClearToppings,
  onScreenshot,
  onRecordGif,
  recordingGif,
  children,
  ref,
}: Props) {
  return (
    <div className="dock" role="toolbar" aria-label="슬라임 도구" ref={ref}>
      <div className="dock-group dock-tools" role="radiogroup" aria-label="도구">
        {TOOLS.map((t, i) => {
          const { label, Icon } = TOOL_META[t]
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tool === t}
              aria-label={label}
              data-tip={`${label} (${i + 1})`}
              className="tool"
              data-tool={t}
              onClick={() => onTool(t)}
            >
              <Icon size={18} aria-hidden fill={t === 'squish' ? 'none' : 'currentColor'} />
              {t === 'squish' && <span className="tool-label">{label}</span>}
            </button>
          )
        })}
      </div>

      <span className="dock-divider" aria-hidden />

      <div className="dock-group dock-look">
        <div className="swatches" role="radiogroup" aria-label="색상">
          {SLIME_COLORS.map((c) => (
            <button
              key={c.name}
              type="button"
              role="radio"
              className="swatch"
              style={{ background: toCssHex(c.rgb) }}
              aria-label={c.name}
              aria-checked={c.rgb === color}
              data-tip={c.name}
              onClick={() => onColor(c.rgb)}
            />
          ))}
        </div>
        <label className="softness">
          <span className="softness-label">말랑함</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={softness}
            aria-valuetext={softnessText(softness)}
            onChange={(e) => onSoftness(Number(e.target.value))}
          />
        </label>
      </div>

      <span className="dock-divider" aria-hidden />

      <div className="dock-group dock-actions">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="다시 뭉치기"
          data-tip="다시 뭉치기 (R)"
          onClick={onReset}
        >
          <RotateCcw size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="토핑 모두 지우기"
          data-tip="토핑 모두 지우기"
          onClick={onClearToppings}
        >
          <Eraser size={18} aria-hidden />
        </button>
        <ExportMenu
          onScreenshot={onScreenshot}
          onRecordGif={onRecordGif}
          recordingGif={recordingGif}
        />
        {children}
      </div>
    </div>
  )
}

function softnessText(v: number) {
  if (v < 0.25) return '단단함'
  if (v < 0.6) return '보통'
  return '아주 말랑함'
}

function ExportMenu({
  onScreenshot,
  onRecordGif,
  recordingGif,
}: {
  onScreenshot: () => void
  onRecordGif: () => void
  recordingGif: boolean
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useDismiss(open, () => setOpen(false), menuRef, [buttonRef])

  const pick = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  return (
    <div className="popover-anchor">
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label={recordingGif ? 'GIF 녹화 중' : '내보내기'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={recordingGif}
        data-tip={recordingGif ? 'GIF 녹화 중' : '내보내기'}
        disabled={recordingGif}
        onClick={() => setOpen((v) => !v)}
      >
        {recordingGif ? (
          <LoaderCircle size={18} className="spin" aria-hidden />
        ) : (
          <Download size={18} aria-hidden />
        )}
      </button>
      {open && (
        <div className="panel popover menu" role="menu" ref={menuRef}>
          <button type="button" role="menuitem" className="menu-item" onClick={() => pick(onScreenshot)}>
            <ImageDown size={16} aria-hidden />
            <span>
              이미지로 저장
              <small>투명 배경 PNG</small>
            </span>
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => pick(onRecordGif)}>
            <Film size={16} aria-hidden />
            <span>
              움짤로 저장
              <small>2.5초 GIF · 녹화 중엔 슬라임을 움직여 보세요</small>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
