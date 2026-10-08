// Thin typed client for the MotionPlay backend. The core is dependency-injected
// (fetch + storage) so it can be exercised without a browser.

import { readStorage, removeStorage, writeStorage } from '../lib/storage'

export type AuthUser = {
  id: number
  email: string
  createdAt: string
  updatedAt: string
}

export type ToppingSpec = { kind: string; x: number; y: number }

/** The slime itself: what a share link exposes and what a save sends. */
export type SharedCreation = {
  title: string
  color: number
  softness: number
  toppings: ToppingSpec[]
}

export type CreationInput = SharedCreation

export type Creation = SharedCreation & {
  id: number
  shareSlug?: string
  createdAt: string
  updatedAt: string
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

/** User-facing message for any error thrown by the client. */
export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : '알 수 없는 오류가 발생했어요.'
}

export const isUnauthorized = (err: unknown) => err instanceof ApiError && err.status === 401

const TOKEN_KEY = 'mp.token'

/** Status -> message overrides for one request. */
type Messages = Partial<Record<number, string>>

// The server's error strings are English and written for developers, so the
// UI speaks in these instead, keyed by status (overridable per request).
const DEFAULT_MESSAGES: Messages = {
  0: '서버에 연결할 수 없어요. 네트워크를 확인해 주세요.',
  400: '입력한 내용을 다시 확인해 주세요.',
  401: '로그인이 필요해요.',
  404: '찾을 수 없어요. 이미 삭제되었을 수 있어요.',
  413: '데이터가 너무 커요.',
  429: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
}

function messageFor(status: number, overrides: Messages = {}): string {
  return (
    overrides[status] ??
    DEFAULT_MESSAGES[status] ??
    (status >= 500
      ? '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'
      : `요청을 처리하지 못했어요. (${status})`)
  )
}

type ClientOptions = {
  baseUrl: string
  storage: TokenStorage
  fetchImpl?: typeof fetch
}

type RequestOptions = {
  body?: unknown
  authed?: boolean
  messages?: Messages
}

export function createApiClient({ baseUrl, storage, fetchImpl }: ClientOptions) {
  const doFetch = fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const url = (path: string) => baseUrl.replace(/\/$/, '') + path
  let onUnauthorized: (() => void) | null = null

  async function request<T>(
    method: string,
    path: string,
    { body, authed = false, messages }: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (authed) {
      const token = storage.get(TOKEN_KEY)
      if (!token) throw new ApiError(401, messageFor(401, messages))
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
      throw new ApiError(0, messageFor(0, messages))
    }

    if (!res.ok) {
      // An authed request bounced means the stored token is expired or its
      // account is gone: drop it, and let the app fall back to signed-out.
      if (authed && res.status === 401) {
        storage.remove(TOKEN_KEY)
        onUnauthorized?.()
      }
      throw new ApiError(res.status, messageFor(res.status, messages))
    }
    if (res.status === 204) return undefined as T
    const data: unknown = await res.json().catch(() => null)
    // A 2xx without a JSON object (a proxy error page, say) would otherwise
    // surface later as "cannot read properties of null".
    if (data === null || typeof data !== 'object') {
      throw new ApiError(res.status, messageFor(500, messages))
    }
    return data as T
  }

  type AuthResponse = { token: string; user: AuthUser }

  async function authenticate(
    path: string,
    email: string,
    password: string,
    messages: Messages,
  ) {
    const res = await request<AuthResponse>('POST', path, {
      body: { email, password },
      messages,
    })
    storage.set(TOKEN_KEY, res.token)
    return res.user
  }

  return {
    hasToken: () => storage.get(TOKEN_KEY) !== null,
    clearToken: () => storage.remove(TOKEN_KEY),
    /** Called when the server rejects the stored token mid-session. */
    setUnauthorizedHandler: (fn: (() => void) | null) => {
      onUnauthorized = fn
    },

    signup: (email: string, password: string) =>
      authenticate('/api/auth/signup', email, password, {
        400: '올바른 이메일과 8자 이상(72바이트 이하)의 비밀번호를 입력해 주세요.',
        409: '이미 가입된 이메일이에요. 로그인해 주세요.',
      }),
    login: (email: string, password: string) =>
      authenticate('/api/auth/login', email, password, {
        400: '이메일과 비밀번호를 확인해 주세요.',
        401: '이메일 또는 비밀번호가 맞지 않아요.',
      }),
    me: () => request<{ user: AuthUser }>('GET', '/api/auth/me', { authed: true }),

    listCreations: () =>
      request<{ creations: Creation[] }>('GET', '/api/creations', { authed: true }),
    createCreation: (input: CreationInput) =>
      request<{ creation: Creation }>('POST', '/api/creations', {
        authed: true,
        body: input,
        messages: { 400: '저장할 수 없는 내용이 있어요. 이름을 확인해 주세요.' },
      }),
    updateCreation: (id: number, input: CreationInput) =>
      request<{ creation: Creation }>('PUT', `/api/creations/${id}`, {
        authed: true,
        body: input,
        messages: {
          400: '저장할 수 없는 내용이 있어요. 이름을 확인해 주세요.',
          404: '이미 삭제된 슬라임이에요. 새로 저장해 주세요.',
        },
      }),
    deleteCreation: (id: number) =>
      request<void>('DELETE', `/api/creations/${id}`, { authed: true }),
    shareCreation: (id: number) =>
      request<{ shareSlug: string }>('POST', `/api/creations/${id}/share`, { authed: true }),
    // The slug comes from the page URL, so encode it: an unencoded
    // "../creations" would otherwise resolve to a different API path.
    getShared: (slug: string) =>
      request<{ creation: SharedCreation }>('GET', `/api/share/${encodeURIComponent(slug)}`, {
        messages: { 404: '공유된 슬라임을 찾을 수 없어요. 링크가 삭제되었을 수 있어요.' },
      }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

const browserStorage: TokenStorage = {
  get: readStorage,
  set: writeStorage,
  remove: removeStorage,
}

// `||` (not `??`) so an empty VITE_API_URL falls back too — matching the CSP
// connect-src computed in vite.config.ts.
const baseUrl =
  (import.meta.env?.VITE_API_URL as string | undefined) || 'http://localhost:8080'

export const api = createApiClient({ baseUrl, storage: browserStorage })
