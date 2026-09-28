/**
 * localStorage wrappers that never throw: private mode, disabled storage or
 * a sandboxed iframe all just behave as "nothing stored".
 */
export function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    /* private mode / disabled storage */
  }
}

export function removeStorage(key: string) {
  try {
    globalThis.localStorage?.removeItem(key)
  } catch {
    /* private mode / disabled storage */
  }
}
