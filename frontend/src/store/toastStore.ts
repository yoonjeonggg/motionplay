import { create } from 'zustand'

export type ToastTone = 'info' | 'success' | 'error'

export type Toast = {
  id: number
  tone: ToastTone
  text: string
}

type ToastState = {
  toasts: Toast[]
  show: (text: string, tone?: ToastTone) => void
  dismiss: (id: number) => void
}

const DURATION_MS: Record<ToastTone, number> = { info: 3000, success: 2500, error: 5000 }
// A burst of the same notice (e.g. tapping "copy link" repeatedly) shouldn't
// stack up more than a couple of cards.
const MAX_TOASTS = 3

let nextId = 1

/** Short, self-dismissing notices: "saved", "link copied", failures. */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (text, tone = 'info') => {
    const id = nextId++
    const rest = get().toasts.filter((t) => t.text !== text)
    set({ toasts: [...rest, { id, tone, text }].slice(-MAX_TOASTS) })
    setTimeout(() => get().dismiss(id), DURATION_MS[tone])
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

/** Shorthand for non-React callers and event handlers. */
export const toast = (text: string, tone?: ToastTone) => useToastStore.getState().show(text, tone)
