import { create } from 'zustand'
import { readStorage, writeStorage } from '../lib/storage'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

// Keep in sync with the pre-paint script in index.html.
const THEME_KEY = 'mp.theme'

const darkQuery = globalThis.matchMedia?.('(prefers-color-scheme: dark)')

function isPreference(v: string | null): v is ThemePreference {
  return v === 'system' || v === 'light' || v === 'dark'
}

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref !== 'system') return pref
  return darkQuery?.matches ? 'dark' : 'light'
}

function apply(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme
}

type ThemeState = {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (pref: ThemePreference) => void
}

const stored = readStorage(THEME_KEY)
const initial: ThemePreference = isPreference(stored) ? stored : 'system'

export const useThemeStore = create<ThemeState>((set) => ({
  preference: initial,
  resolved: resolve(initial),
  setPreference: (preference) => {
    writeStorage(THEME_KEY, preference)
    const resolved = resolve(preference)
    apply(resolved)
    set({ preference, resolved })
  },
}))

apply(useThemeStore.getState().resolved)

// Follow the OS setting live while the user has "system" selected.
darkQuery?.addEventListener('change', () => {
  const { preference } = useThemeStore.getState()
  if (preference !== 'system') return
  const resolved = resolve(preference)
  apply(resolved)
  useThemeStore.setState({ resolved })
})
