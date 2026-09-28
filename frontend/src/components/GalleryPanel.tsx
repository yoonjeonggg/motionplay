import { useEffect, useState } from 'react'
import { Check, FolderOpen, Share2, Trash2 } from 'lucide-react'
import type { Creation, CreationInput } from '../api/client'
import { toCssHex } from '../slime/color'
import { useAuthStore } from '../store/authStore'
import { useCreationsStore } from '../store/creationsStore'
import './GalleryPanel.css'

type Props = {
  /** Builds a save payload from the live slime (title filled in by the panel). */
  getCurrent: () => CreationInput
  onLoad: (creation: Creation) => void
}

export function GalleryPanel({ getCurrent, onLoad }: Props) {
  const authStatus = useAuthStore((s) => s.status)
  const { items, status, error, refresh, save, remove, share, clear } =
    useCreationsStore()
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const authed = authStatus === 'authed'

  useEffect(() => {
    if (authed) void refresh()
    else clear()
  }, [authed, refresh, clear])

  if (!authed) return null

  const onSave = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    const name = title.trim()
    if (!name) return
    setSaving(true)
    const ok = await save({ ...getCurrent(), title: name })
    setSaving(false)
    if (ok) setTitle('')
  }

  const onShare = async (c: Creation) => {
    const slug = c.shareSlug ?? (await share(c.id))
    if (!slug) return
    const url = `${window.location.origin}${window.location.pathname}?share=${slug}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('링크를 복사하세요', url)
      return
    }
    setCopiedId(c.id)
    setTimeout(() => setCopiedId((cur) => (cur === c.id ? null : cur)), 1500)
  }

  return (
    <section className="panel gallery-panel" aria-label="내 슬라임">
      <h2 className="panel-title">내 슬라임</h2>

      <form className="gallery-save" onSubmit={onSave}>
        <input
          className="input"
          type="text"
          placeholder="이름을 입력하세요"
          aria-label="슬라임 이름"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || !title.trim()}
          aria-busy={saving}
        >
          저장
        </button>
      </form>

      {error && <p className="text-error">{error}</p>}

      <ul className="gallery-list">
        {status === 'loading' && <li className="text-muted">불러오는 중</li>}
        {status === 'ready' && items.length === 0 && (
          <li className="text-muted">저장된 슬라임이 없습니다</li>
        )}
        {items.map((c) => (
          <li key={c.id} className="gallery-item">
            <span
              className="gallery-item-color"
              style={{ background: toCssHex(c.color) }}
              aria-hidden
            />
            <span className="gallery-item-title" title={c.title}>
              {c.title}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              title="불러오기"
              aria-label={`${c.title} 불러오기`}
              onClick={() => onLoad(c)}
            >
              <FolderOpen size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              title={copiedId === c.id ? '링크 복사됨' : '공유 링크 복사'}
              aria-label={`${c.title} 공유 링크 복사`}
              onClick={() => void onShare(c)}
            >
              {copiedId === c.id ? (
                <Check size={14} className="gallery-copied" aria-hidden />
              ) : (
                <Share2 size={14} aria-hidden />
              )}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm btn-danger"
              title="삭제"
              aria-label={`${c.title} 삭제`}
              onClick={() => void remove(c.id)}
            >
              <Trash2 size={14} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
