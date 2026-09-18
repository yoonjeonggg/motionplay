import { useEffect, useState } from 'react'
import type { Creation, CreationInput } from '../api/client'
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
    <div className="gallery-panel">
      <form className="gallery-save" onSubmit={onSave}>
        <input
          type="text"
          placeholder="슬라임 이름"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" disabled={saving || !title.trim()}>
          {saving ? '저장 중…' : '저장'}
        </button>
      </form>

      {error && <p className="gallery-error">{error}</p>}

      <div className="gallery-list">
        {status === 'loading' && <p className="gallery-empty">불러오는 중…</p>}
        {status === 'ready' && items.length === 0 && (
          <p className="gallery-empty">저장된 슬라임이 없습니다</p>
        )}
        {items.map((c) => (
          <div key={c.id} className="gallery-item">
            <span className="gallery-item-title" title={c.title}>
              {c.title}
            </span>
            <button type="button" onClick={() => onLoad(c)}>
              불러오기
            </button>
            <button type="button" onClick={() => void onShare(c)}>
              {copiedId === c.id ? '복사됨!' : '공유'}
            </button>
            <button
              type="button"
              className="gallery-del"
              aria-label={`${c.title} 삭제`}
              onClick={() => void remove(c.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
