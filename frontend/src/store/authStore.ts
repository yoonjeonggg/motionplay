import { create } from 'zustand'
import { api as defaultApi, type ApiClient, type AuthUser, errorMessage } from '../api/client'

export type AuthStatus = 'idle' | 'loading' | 'authed' | 'anon'

export type AuthState = {
  user: AuthUser | null
  status: AuthStatus
  error: string | null
  signup: (email: string, password: string) => Promise<boolean>
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  /** Called once on startup: validate a stored token, if any. */
  restore: () => Promise<void>
}

export function createAuthStore(api: ApiClient) {
  return create<AuthState>((set) => {
    const run = async (
      fn: () => Promise<AuthUser>,
    ): Promise<boolean> => {
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

      restore: async () => {
        if (!api.hasToken()) {
          set({ status: 'anon' })
          return
        }
        set({ status: 'loading' })
        try {
          const { user } = await api.me()
          set({ user, status: 'authed' })
        } catch {
          api.clearToken()
          set({ user: null, status: 'anon' })
        }
      },
    }
  })
}

export const useAuthStore = createAuthStore(defaultApi)
