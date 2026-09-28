import { Circle, Hand, Heart, type LucideIcon, Sparkles, Star } from 'lucide-react'
import { toCssHex } from '../slime/color'
import { SLIME_COLORS } from '../slime/palette'
import { type ToppingKind, TOPPING_KINDS } from '../slime/toppings'
import './SlimePanel.css'

export type Mode = 'squish' | 'topping'

const TOPPING_META: Record<ToppingKind, { label: string; Icon: LucideIcon }> = {
  star: { label: '별', Icon: Star },
  heart: { label: '하트', Icon: Heart },
  pearl: { label: '진주', Icon: Circle },
}

type Props = {
  color: number
  softness: number
  mode: Mode
  toppingKind: ToppingKind
  onColor: (rgb: number) => void
  onSoftness: (v: number) => void
  onMode: (m: Mode) => void
  onToppingKind: (k: ToppingKind) => void
}

export function SlimePanel({
  color,
  softness,
  mode,
  toppingKind,
  onColor,
  onSoftness,
  onMode,
  onToppingKind,
}: Props) {
  return (
    <section className="panel slime-panel" aria-label="슬라임 설정">
      <h2 className="panel-title">슬라임</h2>

      <div className="field">
        <span className="field-label">색상</span>
        <div className="swatches">
          {SLIME_COLORS.map((c) => (
            <button
              key={c.name}
              type="button"
              className="swatch"
              style={{ background: toCssHex(c.rgb) }}
              title={c.name}
              aria-label={c.name}
              aria-pressed={c.rgb === color}
              onClick={() => onColor(c.rgb)}
            />
          ))}
        </div>
      </div>

      <label className="field">
        <span className="field-label">말랑함</span>
        <input
          type="range"
          className="softness"
          min={0}
          max={1}
          step={0.05}
          value={softness}
          onChange={(e) => onSoftness(Number(e.target.value))}
        />
      </label>

      <div className="field">
        <span className="field-label">모드</span>
        <div className="segmented">
          <button
            type="button"
            aria-pressed={mode === 'squish'}
            onClick={() => onMode('squish')}
          >
            <Hand size={14} aria-hidden />
            주무르기
          </button>
          <button
            type="button"
            aria-pressed={mode === 'topping'}
            onClick={() => onMode('topping')}
          >
            <Sparkles size={14} aria-hidden />
            토핑
          </button>
        </div>
      </div>

      {mode === 'topping' && (
        <div className="field">
          <span className="field-label">토핑</span>
          <div className="segmented">
            {TOPPING_KINDS.map((k) => {
              const { label, Icon } = TOPPING_META[k]
              return (
                <button
                  key={k}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={k === toppingKind}
                  onClick={() => onToppingKind(k)}
                >
                  <Icon size={14} fill="currentColor" aria-hidden />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
