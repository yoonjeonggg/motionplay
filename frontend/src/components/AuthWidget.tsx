import { useEffect, useState } from 'react'
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

  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    const ok =
      mode === 'login'
        ? await login(email.trim(), password)
        : await signup(email.trim(), password)
    if (ok) {
      setOpen(false)
      setPassword('')
    }
  }

  if (status === 'authed' && user) {
    return (
      <div className="auth-widget">
        <button
          type="button"
          className="auth-pill"
          onClick={() => setOpen((v) => !v)}
        >
          {user.email}
        </button>
        {open && (
          <div className="auth-pop">
            <button type="button" className="auth-submit" onClick={logout}>
              로그아웃
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="auth-widget">
      <button
        type="button"
        className="auth-pill"
        onClick={() => setOpen((v) => !v)}
      >
        로그인
      </button>
      {open && (
        <form className="auth-pop" onSubmit={submit}>
          <div className="auth-tabs">
            <button
              type="button"
              data-active={mode === 'login'}
              onClick={() => setMode('login')}
            >
              로그인
            </button>
            <button
              type="button"
              data-active={mode === 'signup'}
              onClick={() => setMode('signup')}
            >
              가입
            </button>
          </div>
          <input
            type="email"
            placeholder="이메일"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="비밀번호 (8자 이상)"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? '처리 중…' : mode === 'login' ? '로그인' : '가입하기'}
          </button>
        </form>
      )}
    </div>
  )
}
