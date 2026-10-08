import { useState } from 'react'
import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

type Mode = 'login' | 'signup'

const MIN_PASSWORD = 8

export function AuthForm({ onSuccess }: { onSuccess?: () => void }) {
  const status = useAuthStore((s) => s.status)
  const error = useAuthStore((s) => s.error)
  const login = useAuthStore((s) => s.login)
  const signup = useAuthStore((s) => s.signup)
  const clearError = useAuthStore((s) => s.clearError)
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const busy = status === 'loading'

  const switchMode = (next: Mode) => {
    setMode(next)
    clearError()
  }

  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    const authenticate = mode === 'login' ? login : signup
    if (await authenticate(email.trim(), password)) {
      setPassword('')
      onSuccess?.()
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <div className="tabs" role="tablist" aria-label="로그인 또는 가입">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          onClick={() => switchMode('login')}
        >
          로그인
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          onClick={() => switchMode('signup')}
        >
          가입하기
        </button>
      </div>

      <label className="field">
        <span className="field-label">이메일</span>
        <input
          className="input"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>

      <label className="field">
        <span className="field-label">비밀번호</span>
        <span className="password">
          <input
            className="input"
            type={showPassword ? 'text' : 'password'}
            placeholder={mode === 'signup' ? `${MIN_PASSWORD}자 이상` : ''}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={MIN_PASSWORD}
            required
          />
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm password-toggle"
            aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          </button>
        </span>
      </label>

      {error && (
        <p className="text-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-block" disabled={busy} aria-busy={busy}>
        {busy && <LoaderCircle size={16} className="spin" aria-hidden />}
        {mode === 'login' ? '로그인' : '가입하고 시작하기'}
      </button>
    </form>
  )
}
