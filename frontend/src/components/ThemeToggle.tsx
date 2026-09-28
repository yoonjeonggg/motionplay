import { type LucideIcon, Monitor, Moon, Sun } from 'lucide-react'
import { type ThemePreference, useThemeStore } from '../store/themeStore'

const OPTIONS: { value: ThemePreference; label: string; Icon: LucideIcon }[] = [
  { value: 'light', label: '라이트 모드', Icon: Sun },
  { value: 'dark', label: '다크 모드', Icon: Moon },
  { value: 'system', label: '시스템 설정 따르기', Icon: Monitor },
]

export function ThemeToggle() {
  const preference = useThemeStore((s) => s.preference)
  const setPreference = useThemeStore((s) => s.setPreference)

  return (
    <div className="segmented" role="group" aria-label="화면 테마">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={preference === value}
          onClick={() => setPreference(value)}
        >
          <Icon size={14} aria-hidden />
        </button>
      ))}
    </div>
  )
}
