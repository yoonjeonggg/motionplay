// Thin typed client for the MotionPlay backend. The core is dependency-injected
// (fetch + storage) so it can be exercised without a browser.

export type AuthUser = {
  id: number
  email: string
  createdAt: string
  updatedAt: string
}

export type ToppingSpec = { kind: string; x: number; y: number }

export type Creation = {
  id: number
  title: string
  color: number
  softness: number
  toppings: ToppingSpec[]
  shareSlug?: string
  createdAt: string
  updatedAt: string
}

export type CreationInput = {
  title: string
  color: number
  softness: number
  toppings: ToppingSpec[]
}

export type SharedCreation = {
  title: string
  color: number
  softness: number
  toppings: ToppingSpec[]
}

export type TokenStorage = {
  get: (key: string) => string | null
  set: (key: string, value: string) => void
  remove: (key: string) => void
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const TOKEN_KEY = 'mp.token'

type ClientOptions = {
  baseUrl: string
  storage: TokenStorage
  fetchImpl?: typeof fetch
}

export function createApiClient({ baseUrl, storage, fetchImpl }: ClientOptions) {
  const doFetch = fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const url = (path: string) => baseUrl.replace(/\/$/, '') + path

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    authed = false,
  ): Promise<T> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (authed) {
      const token = storage.get(TOKEN_KEY)
      if (!token) throw new ApiError(401, '로그인이 필요합니다.')
      headers.Authorization = `Bearer ${token}`
    }

    let res: Response
    try {
      res = await doFetch(url(path), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError(0, '서버에 연결할 수 없습니다.')
    }

    if (res.status === 204) return undefined as T
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const message =
        (data && typeof data === 'object' && 'error' in data
          ? String((data as { error: unknown }).error)
          : null) ?? `요청 실패 (${res.status})`
      throw new ApiError(res.status, message)
    }
    return data as T
  }

  type AuthResponse = { token: string; user: AuthUser }

  async function authenticate(path: string, email: string, password: string) {
    const res = await request<AuthResponse>('POST', path, { email, password })
    storage.set(TOKEN_KEY, res.token)
    return res.user
  }

  return {
    hasToken: () => storage.get(TOKEN_KEY) !== null,
    clearToken: () => storage.remove(TOKEN_KEY),

    signup: (email: string, password: string) =>
      authenticate('/api/auth/signup', email, password),
    login: (email: string, password: string) =>
      authenticate('/api/auth/login', email, password),
    me: () => request<{ user: AuthUser }>('GET', '/api/auth/me', undefined, true),

    listCreations: () =>
      request<{ creations: Creation[] }>(
        'GET',
        '/api/creations',
        undefined,
        true,
      ),
    createCreation: (input: CreationInput) =>
      request<{ creation: Creation }>('POST', '/api/creations', input, true),
    updateCreation: (id: number, input: CreationInput) =>
      request<{ creation: Creation }>(
        'PUT',
        `/api/creations/${id}`,
        input,
        true,
      ),
    deleteCreation: (id: number) =>
      request<void>('DELETE', `/api/creations/${id}`, undefined, true),
    shareCreation: (id: number) =>
      request<{ shareSlug: string }>(
        'POST',
        `/api/creations/${id}/share`,
        undefined,
        true,
      ),
    getShared: (slug: string) =>
      request<{ creation: SharedCreation }>(
        'GET',
        `/api/share/${slug}`,
        undefined,
        false,
      ),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

const browserStorage: TokenStorage = {
  get: (key) => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null
    } catch {
      return null
    }
  },
  set: (key, value) => {
    try {
      globalThis.localStorage?.setItem(key, value)
    } catch {
      /* private mode / disabled storage */
    }
  },
  remove: (key) => {
    try {
      globalThis.localStorage?.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

const baseUrl =
  (import.meta.env?.VITE_API_URL as string | undefined) ??
  'http://localhost:8080'

export const api = createApiClient({ baseUrl, storage: browserStorage })
