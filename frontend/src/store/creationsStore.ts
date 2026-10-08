import { create } from 'zustand'
import {
  api as defaultApi,
  type ApiClient,
  type Creation,
  type CreationInput,
  errorMessage,
} from '../api/client'

export type CreationsStatus = 'idle' | 'loading' | 'ready' | 'error'

export type CreationsState = {
  items: Creation[]
  status: CreationsStatus
  error: string | null
  refresh: () => Promise<void>
  /** Save as a new creation. Resolves to it, or null on failure. */
  save: (input: CreationInput) => Promise<Creation | null>
  /** Overwrite an existing creation. Resolves to it, or null on failure. */
  update: (id: number, input: CreationInput) => Promise<Creation | null>
  /** Delete optimistically; restores the item if the server refuses. */
  remove: (id: number) => Promise<boolean>
  share: (id: number) => Promise<string | null>
  clear: () => void
}

export function createCreationsStore(api: ApiClient) {
  return create<CreationsState>((set, get) => {
    // Bumped by clear(), so a request that started before a logout can't
    // write the previous account's creations back into the store.
    let generation = 0

    /** Run fn; on failure record its message. Results from a stale generation are dropped. */
    const attempt = async <T>(fn: () => Promise<T>): Promise<T | null> => {
      const gen = generation
      set({ error: null })
      try {
        const result = await fn()
        return gen === generation ? result : null
      } catch (err) {
        if (gen === generation) set({ error: errorMessage(err) })
        return null
      }
    }

    /** Put c first (most recently updated), replacing any older copy. */
    const putFirst = (c: Creation) =>
      set({ items: [c, ...get().items.filter((x) => x.id !== c.id)], status: 'ready' })

    return {
      items: [],
      status: 'idle',
      error: null,

      refresh: async () => {
        set({ status: 'loading' })
        const res = await attempt(() => api.listCreations())
        if (res) set({ items: res.creations, status: 'ready' })
        else if (get().status === 'loading') set({ status: 'error' })
      },

      save: async (input) => {
        const res = await attempt(() => api.createCreation(input))
        if (!res) return null
        putFirst(res.creation)
        return res.creation
      },

      update: async (id, input) => {
        const res = await attempt(() => api.updateCreation(id, input))
        if (!res) return null
        putFirst(res.creation)
        return res.creation
      },

      remove: async (id) => {
        const before = get().items
        const index = before.findIndex((c) => c.id === id)
        if (index < 0) return false
        const removed = before[index]
        const gen = generation
        set({ items: before.filter((c) => c.id !== id) })
        const ok = (await attempt(() => api.deleteCreation(id))) !== null
        if (!ok && gen === generation && !get().items.some((c) => c.id === id)) {
          // Put it back where it was, without undoing anything else that
          // changed in the meantime.
          const items = [...get().items]
          items.splice(Math.min(index, items.length), 0, removed)
          set({ items })
        }
        return ok
      },

      share: async (id) => {
        const res = await attempt(() => api.shareCreation(id))
        if (!res) return null
        set({
          items: get().items.map((c) => (c.id === id ? { ...c, shareSlug: res.shareSlug } : c)),
        })
        return res.shareSlug
      },

      clear: () => {
        generation++
        set({ items: [], status: 'idle', error: null })
      },
    }
  })
}

export const useCreationsStore = createCreationsStore(defaultApi)
