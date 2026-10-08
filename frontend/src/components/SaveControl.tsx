import { useRef, useState } from 'react'
import { LoaderCircle, Save } from 'lucide-react'
import type { Creation, CreationInput } from '../api/client'
import { useDismiss } from '../hooks/useDismiss'
import { useCreationsStore } from '../store/creationsStore'
import { toast } from '../store/toastStore'

/** The saved creation currently on screen, if any (so saving can overwrite it). */
export type Loaded = { id: number; title: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  authed: boolean
  loaded: Loaded | null
  /** Pre-filled title when nothing saved is loaded (e.g. a shared slime's). */
  suggestedTitle: string
  getCurrent: () => Omit<CreationInput, 'title'>
  onRequestLogin: () => void
  onSaved: (c: Creation) => void
}

const MAX_TITLE = 120

export function SaveControl({
  open,
  onOpenChange,
  authed,
  loaded,
  suggestedTitle,
  getCurrent,
  onRequestLogin,
  onSaved,
}: Props) {
  const popRef = useRef<HTMLFormElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useDismiss(open, () => onOpenChange(false), popRef, [buttonRef])

  const onClick = () => {
    if (!authed) {
      onRequestLogin()
      return
    }
    onOpenChange(!open)
  }

  return (
    <div className="popover-anchor">
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-primary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={onClick}
      >
        <Save size={16} aria-hidden />
        <span className="save-label">저장</span>
      </button>
      {open && authed && (
        <SaveForm
          // Re-mount per opening, so the title starts fresh each time.
          key={loaded?.id ?? 'new'}
          formRef={popRef}
          loaded={loaded}
          suggestedTitle={suggestedTitle}
          getCurrent={getCurrent}
          onDone={(c) => {
            onOpenChange(false)
            onSaved(c)
          }}
        />
      )}
    </div>
  )
}

function SaveForm({
  formRef,
  loaded,
  suggestedTitle,
  getCurrent,
  onDone,
}: {
  formRef: React.RefObject<HTMLFormElement | null>
  loaded: Loaded | null
  suggestedTitle: string
  getCurrent: () => Omit<CreationInput, 'title'>
  onDone: (c: Creation) => void
}) {
  const save = useCreationsStore((s) => s.save)
  const update = useCreationsStore((s) => s.update)
  const error = useCreationsStore((s) => s.error)
  const [title, setTitle] = useState(loaded?.title ?? suggestedTitle)
  const [busy, setBusy] = useState<'update' | 'new' | null>(null)
  const name = title.trim()

  const submit = async (as: 'update' | 'new') => {
    if (!name || busy) return
    setBusy(as)
    const input = { ...getCurrent(), title: name }
    const saved = as === 'update' && loaded ? await update(loaded.id, input) : await save(input)
    setBusy(null)
    if (!saved) return
    toast(as === 'update' ? '변경 사항을 저장했어요' : `'${saved.title}'을(를) 저장했어요`, 'success')
    onDone(saved)
  }

  return (
    <form
      ref={formRef}
      className="panel popover save-pop"
      aria-label="슬라임 저장"
      onSubmit={(e) => {
        e.preventDefault()
        void submit(loaded ? 'update' : 'new')
      }}
    >
      <label className="field">
        <span className="field-label">이름</span>
        <input
          className="input"
          type="text"
          placeholder="예: 반짝이 민트 슬라임"
          maxLength={MAX_TITLE}
          value={title}
          // The form only exists while the user is saving, so focus is expected.
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      {error && <p className="text-error">{error}</p>}
      <div className="save-actions">
        {loaded ? (
          <>
            <button
              type="button"
              className="btn"
              disabled={!name || busy !== null}
              aria-busy={busy === 'new'}
              onClick={() => void submit('new')}
            >
              {busy === 'new' && <LoaderCircle size={16} className="spin" aria-hidden />}
              새로 저장
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!name || busy !== null}
              aria-busy={busy === 'update'}
            >
              {busy === 'update' && <LoaderCircle size={16} className="spin" aria-hidden />}
              덮어쓰기
            </button>
          </>
        ) : (
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={!name || busy !== null}
            aria-busy={busy !== null}
          >
            {busy && <LoaderCircle size={16} className="spin" aria-hidden />}
            저장하기
          </button>
        )}
      </div>
    </form>
  )
}
