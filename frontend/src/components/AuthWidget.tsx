import { useEffect, useState } from 'react'
import { LoaderCircle, LogOut, User } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import './AuthWidget.css'

export function AuthWidget() {
  const { user, status, error, login, signup, logout, restore } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    void restore()
  }, [restore])

  const busy = status === 'loading'
  const authed = status === 'authed' && user !== null

  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    const authenticate = mode === 'login' ? login : signup
    const ok = await authenticate(email.trim(), password)
    if (ok) {
      setOpen(false)
      setPassword('')
    }
  }

  return (
    <div className="auth-widget">
      {open && authed && (
        <div className="panel auth-pop">
          <p className="text-muted auth-email" title={user.email}>
            {user.email}
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              logout()
              setOpen(false)
            }}
          >
            <LogOut size={16} aria-hidden />
            로그아웃
          </button>
        </div>
      )}

      {open && !authed && (
        <form className="panel auth-pop" onSubmit={submit}>
          <div className="segmented auth-tabs">
            <button
              type="button"
              aria-pressed={mode === 'login'}
              onClick={() => setMode('login')}
            >
              로그인
            </button>
            <button
              type="button"
              aria-pressed={mode === 'signup'}
              onClick={() => setMode('signup')}
            >
              가입
            </button>
          </div>
          <input
            className="input"
            type="email"
            placeholder="이메일"
            aria-label="이메일"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="비밀번호 (8자 이상)"
            aria-label="비밀번호"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          {error && <p className="text-error">{error}</p>}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy}
            aria-busy={busy}
          >
            {busy && <LoaderCircle size={16} className="spin" aria-hidden />}
            {mode === 'login' ? '로그인' : '가입하기'}
          </button>
        </form>
      )}

      <button
        type="button"
        className="btn auth-pill"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <User size={16} aria-hidden />
        <span className="auth-pill-label">{authed ? user.email : '로그인'}</span>
      </button>
    </div>
  )
}
