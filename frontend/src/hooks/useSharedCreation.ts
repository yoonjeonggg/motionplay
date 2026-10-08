import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { api, type SharedCreation } from '../api/client'

type UseSharedCreationResult = {
  /** Title of the applied shared slime, until dismissed. */
  sharedTitle: string | null
  /** Hide the banner and drop ?share= from the URL. */
  dismissShared: () => void
}

/**
 * Applies the slime named by a ?share= link. It is fetched right away but can
 * only be applied once the slime renderer is `ready`. Chaining onto the
 * request promise applies it whichever finishes last — the fetch or the
 * renderer init. (Only re-checking on `ready` silently dropped a fetch slower
 * than renderer init.)
 */
export function useSharedCreation(
  ready: boolean,
  onLoad: (creation: SharedCreation) => void,
): UseSharedCreationResult {
  const [sharedTitle, setSharedTitle] = useState<string | null>(null)
  const [request] = useState(() => fetchSharedFromUrl())
  const applied = useRef(false)
  const apply = useEffectEvent((creation: SharedCreation) => {
    applied.current = true
    setSharedTitle(creation.title)
    onLoad(creation)
  })

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    void request.then((creation) => {
      if (!creation || cancelled || applied.current) return
      apply(creation)
    })
    return () => {
      cancelled = true
    }
  }, [ready, request])

  const dismissShared = () => {
    setSharedTitle(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('share')
    window.history.replaceState({}, '', url)
  }

  return { sharedTitle, dismissShared }
}

async function fetchSharedFromUrl(): Promise<SharedCreation | null> {
  const slug = new URLSearchParams(window.location.search).get('share')
  if (!slug) return null
  try {
    return (await api.getShared(slug)).creation
  } catch {
    return null // unknown/expired link: just show the default slime
  }
}
