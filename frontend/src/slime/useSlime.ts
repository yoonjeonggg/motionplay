import { useEffect, useRef, useState } from 'react'
import type { SlimeController } from './controller'
import { createSlimeApp, type SlimeApp } from './slimeApp'

export type { SlimeController }

export type SlimeStatus = 'loading' | 'ready' | 'error'

type UseSlimeResult = {
  /** Element the slime canvas is created inside; it fills this box. */
  hostRef: React.RefObject<HTMLDivElement | null>
  controller: React.RefObject<SlimeController | null>
  status: SlimeStatus
}

export function useSlime(): UseSlimeResult {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const controller = useRef<SlimeController | null>(null)
  const [status, setStatus] = useState<SlimeStatus>('loading')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let app: SlimeApp | null = null

    createSlimeApp(host).then(
      (created) => {
        // Unmounted while initialising (StrictMode does this on purpose).
        if (disposed) {
          created.destroy()
          return
        }
        app = created
        controller.current = created.controller
        setStatus('ready')
      },
      (err: unknown) => {
        if (disposed) return
        console.error('[slime] init failed', err)
        setStatus('error')
      },
    )

    // Resizing reallocates the render surface, and a drag can report dozens
    // of sizes per second, so coalesce to one resize per frame.
    let resizeRaf = 0
    const observer = new ResizeObserver(() => {
      if (resizeRaf) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        app?.resize(host.clientWidth, host.clientHeight)
      })
    })
    observer.observe(host)

    return () => {
      disposed = true
      observer.disconnect()
      if (resizeRaf) cancelAnimationFrame(resizeRaf)
      controller.current = null
      app?.destroy()
      setStatus('loading')
    }
  }, [])

  return { hostRef, controller, status }
}
