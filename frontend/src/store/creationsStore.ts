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
  save: (input: CreationInput) => Promise<boolean>
  remove: (id: number) => Promise<void>
  share: (id: number) => Promise<string | null>
  clear: () => void
}

export function createCreationsStore(api: ApiClient) {
  return create<CreationsState>((set, get) => ({
    items: [],
    status: 'idle',
    error: null,

    refresh: async () => {
      set({ status: 'loading', error: null })
      try {
        const { creations } = await api.listCreations()
        set({ items: creations, status: 'ready' })
      } catch (err) {
        set({ status: 'error', error: errorMessage(err) })
      }
    },

    save: async (input) => {
      set({ error: null })
      try {
        const { creation } = await api.createCreation(input)
        set({ items: [creation, ...get().items], status: 'ready' })
        return true
      } catch (err) {
        set({ error: errorMessage(err) })
        return false
      }
    },

    remove: async (id) => {
      const before = get().items
      set({ items: before.filter((c) => c.id !== id) })
      try {
        await api.deleteCreation(id)
      } catch (err) {
        set({ items: before, error: errorMessage(err) })
      }
    },

    share: async (id) => {
      try {
        const { shareSlug } = await api.shareCreation(id)
        set({
          items: get().items.map((c) => (c.id === id ? { ...c, shareSlug } : c)),
        })
        return shareSlug
      } catch (err) {
        set({ error: errorMessage(err) })
        return null
      }
    },

    clear: () => set({ items: [], status: 'idle', error: null }),
  }))
}

export const useCreationsStore = createCreationsStore(defaultApi)
