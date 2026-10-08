import { create } from 'zustand'
import {
  api as defaultApi,
  type ApiClient,
  type AuthUser,
  errorMessage,
  isUnauthorized,
} from '../api/client'

export type AuthStatus = 'idle' | 'loading' | 'authed' | 'anon'

export type AuthState = {
  user: AuthUser | null
  status: AuthStatus
  error: string | null
  signup: (email: string, password: string) => Promise<boolean>
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  clearError: () => void
  /** Called once on startup: validate a stored token, if any. */
  restore: () => Promise<void>
}

export function createAuthStore(api: ApiClient) {
  return create<AuthState>((set) => {
    const run = async (fn: () => Promise<AuthUser>): Promise<boolean> => {
      set({ status: 'loading', error: null })
      try {
        const user = await fn()
        set({ user, status: 'authed', error: null })
        return true
      } catch (err) {
        set({ user: null, status: 'anon', error: errorMessage(err) })
        return false
      }
    }

    // Any authed request that finds the token rejected signs us out here,
    // instead of each screen showing its own "not authenticated" error.
    api.setUnauthorizedHandler(() =>
      set({
        user: null,
        status: 'anon',
        error: '로그인이 만료되었어요. 다시 로그인해 주세요.',
      }),
    )

    return {
      user: null,
      status: 'idle',
      error: null,

      signup: (email, password) => run(() => api.signup(email, password)),
      login: (email, password) => run(() => api.login(email, password)),

      logout: () => {
        api.clearToken()
        set({ user: null, status: 'anon', error: null })
      },

      clearError: () => set({ error: null }),

      restore: async () => {
        if (!api.hasToken()) {
          set({ status: 'anon' })
          return
        }
        set({ status: 'loading' })
        try {
          const { user } = await api.me()
          set({ user, status: 'authed' })
        } catch (err) {
          // Only a rejected token means "signed out" (the client has already
          // dropped it). A network blip or server error keeps the token, so
          // the next visit can still restore the session.
          set({
            user: null,
            status: 'anon',
            error: isUnauthorized(err)
              ? null
              : '서버에 연결할 수 없어 로그인 상태를 확인하지 못했어요.',
          })
        }
      },
    }
  })
}

export const useAuthStore = createAuthStore(defaultApi)
