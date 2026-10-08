import { useEffect, useRef, useState } from 'react'
import { Link, LoaderCircle, LogOut, RefreshCw, Trash2, User, X } from 'lucide-react'
import type { Creation } from '../api/client'
import { useDismiss } from '../hooks/useDismiss'
import { toCssHex } from '../slime/color'
import { useAuthStore } from '../store/authStore'
import { useCreationsStore } from '../store/creationsStore'
import { toast } from '../store/toastStore'
import { AuthForm } from './AuthForm'
import './LibraryDrawer.css'

type Props = {
  open: boolean
  onClose: () => void
  /** Shown above the login form, e.g. why the drawer opened. */
  notice: string | null
  loadedId: number | null
  onLoad: (c: Creation) => void
  onAuthed?: () => void
  toggleRef: React.RefObject<HTMLElement | null>
}

/** Account + saved slimes, in one side drawer (a bottom sheet on phones). */
export function LibraryDrawer({ open, onClose, notice, loadedId, onLoad, onAuthed, toggleRef }: Props) {
  const ref = useRef<HTMLElement>(null)
  useDismiss(open, onClose, ref, [toggleRef])
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const logout = useAuthStore((s) => s.logout)
  const authed = status === 'authed' && user !== null

  if (!open) return null

  return (
    <aside className="panel drawer" ref={ref} role="dialog" aria-label="내 슬라임">
      <header className="drawer-header">
        <h2 className="drawer-title">내 슬라임</h2>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="닫기" onClick={onClose}>
          <X size={18} aria-hidden />
        </button>
      </header>

      {authed ? (
        <>
          <div className="account">
            <User size={16} aria-hidden />
            <span className="account-email" title={user.email}>
              {user.email}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
              <LogOut size={14} aria-hidden />
              로그아웃
            </button>
          </div>
          <CreationList loadedId={loadedId} onLoad={onLoad} />
        </>
      ) : (
        <div className="drawer-auth">
          <p className="text-muted">
            {notice ?? '로그인하면 만든 슬라임을 저장하고, 링크로 친구에게 보여줄 수 있어요.'}
          </p>
          <AuthForm onSuccess={onAuthed} />
        </div>
      )}
    </aside>
  )
}

function CreationList({ loadedId, onLoad }: { loadedId: number | null; onLoad: (c: Creation) => void }) {
  const items = useCreationsStore((s) => s.items)
  const status = useCreationsStore((s) => s.status)
  const error = useCreationsStore((s) => s.error)
  const refresh = useCreationsStore((s) => s.refresh)

  if (status === 'error' && items.length === 0) {
    return (
      <div className="empty">
        <p className="text-error">{error}</p>
        <button type="button" className="btn btn-sm" onClick={() => void refresh()}>
          <RefreshCw size={14} aria-hidden />
          다시 불러오기
        </button>
      </div>
    )
  }
  if (status !== 'ready' && items.length === 0) {
    return (
      <p className="text-muted drawer-loading">
        <LoaderCircle size={16} className="spin" aria-hidden /> 불러오는 중
      </p>
    )
  }
  if (items.length === 0) {
    return (
      <div className="empty">
        <p>아직 저장한 슬라임이 없어요</p>
        <p className="text-muted">마음에 드는 슬라임을 만들고 아래의 저장 버튼을 눌러 보세요.</p>
      </div>
    )
  }
  return (
    <>
      {error && <p className="text-error">{error}</p>}
      <ul className="lib-list">
        {items.map((c) => (
          <CreationItem key={c.id} creation={c} current={c.id === loadedId} onLoad={onLoad} />
        ))}
      </ul>
    </>
  )
}

const CONFIRM_MS = 4000

function CreationItem({
  creation: c,
  current,
  onLoad,
}: {
  creation: Creation
  current: boolean
  onLoad: (c: Creation) => void
}) {
  const remove = useCreationsStore((s) => s.remove)
  const share = useCreationsStore((s) => s.share)
  const [confirming, setConfirming] = useState(false)
  const [sharing, setSharing] = useState(false)

  // An armed delete disarms itself, so a stray later click can't delete.
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), CONFIRM_MS)
    return () => clearTimeout(t)
  }, [confirming])

  const onShare = async () => {
    setSharing(true)
    const slug = c.shareSlug ?? (await share(c.id))
    setSharing(false)
    if (!slug) return
    const url = `${window.location.origin}${window.location.pathname}?share=${slug}`
    try {
      await navigator.clipboard.writeText(url)
      toast('공유 링크를 복사했어요', 'success')
    } catch {
      // Clipboard blocked (insecure origin, permissions): let them copy it.
      window.prompt('아래 링크를 복사하세요', url)
    }
  }

  const onDelete = async () => {
    setConfirming(false)
    if (await remove(c.id)) toast(`'${c.title}'을(를) 삭제했어요`)
  }

  return (
    <li className="lib-item" data-current={current}>
      <button type="button" className="lib-load" onClick={() => onLoad(c)} aria-label={`${c.title} 불러오기`}>
        <span className="lib-color" style={{ background: toCssHex(c.color) }} aria-hidden />
        <span className="lib-text">
          <span className="lib-title">{c.title}</span>
          <span className="lib-meta">
            {current ? '편집 중 · ' : ''}
            {c.toppings.length > 0 ? `토핑 ${c.toppings.length}개 · ` : ''}
            {relativeTime(c.updatedAt)}
          </span>
        </span>
      </button>
      {confirming ? (
        <span className="lib-confirm">
          <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>
            취소
          </button>
          <button type="button" className="btn btn-sm btn-danger-solid" onClick={() => void onDelete()}>
            삭제
          </button>
        </span>
      ) : (
        <span className="lib-actions">
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            aria-label={`${c.title} 공유 링크 복사`}
            data-tip="공유 링크 복사"
            aria-busy={sharing}
            disabled={sharing}
            onClick={() => void onShare()}
          >
            {sharing ? <LoaderCircle size={15} className="spin" aria-hidden /> : <Link size={15} aria-hidden />}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm btn-danger"
            aria-label={`${c.title} 삭제`}
            data-tip="삭제"
            onClick={() => setConfirming(true)}
          >
            <Trash2 size={15} aria-hidden />
          </button>
        </span>
      )}
    </li>
  )
}

const rtf = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' })

function relativeTime(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  if (!Number.isFinite(diff)) return ''
  const abs = Math.abs(diff)
  if (abs < 60) return '방금 전'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
  return new Date(iso).toLocaleDateString('ko')
}
