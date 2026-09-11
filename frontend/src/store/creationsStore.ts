import { create } from 'zustand'
import {
  api as defaultApi,
  ApiError,
  type ApiClient,
  type Creation,
  type CreationInput,
} from '../api/client'

export type CreationsStatus = 'idle' | 'loading' | 'ready' | 'error'

export type CreationsState = {
  items: Creation[]
  status: CreationsStatus
  error: string | null
  refresh: () => Promise<void>
  save: (input: CreationInput) => Promise<boolean>
  remove: (id: number) => Promise<void>
  clear: () => void
}

function message(err: unknown): string {
  return err instanceof ApiError ? err.message : '알 수 없는 오류가 발생했습니다.'
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
        set({ status: 'error', error: message(err) })
      }
    },

    save: async (input) => {
      set({ error: null })
      try {
        const { creation } = await api.createCreation(input)
        set({ items: [creation, ...get().items], status: 'ready' })
        return true
      } catch (err) {
        set({ error: message(err) })
        return false
      }
    },

    remove: async (id) => {
      const before = get().items
      set({ items: before.filter((c) => c.id !== id) })
      try {
        await api.deleteCreation(id)
      } catch (err) {
        set({ items: before, error: message(err) })
      }
    },

    clear: () => set({ items: [], status: 'idle', error: null }),
  }))
}

export const useCreationsStore = createCreationsStore(defaultApi)
