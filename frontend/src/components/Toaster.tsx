import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { type ToastTone, useToastStore } from '../store/toastStore'

const ICONS: Record<ToastTone, typeof Info> = {
  info: Info,
  success: CircleCheck,
  error: CircleAlert,
}

/** Renders queued toasts; errors are announced assertively, the rest politely. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.tone]
        return (
          <div key={t.id} className="toast" data-tone={t.tone} role={t.tone === 'error' ? 'alert' : 'status'}>
            <Icon size={16} aria-hidden />
            <span className="toast-text">{t.text}</span>
            <button type="button" className="toast-close" aria-label="알림 닫기" onClick={() => dismiss(t.id)}>
              <X size={14} aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
}
