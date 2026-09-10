import { useEffect, useRef, useState } from 'react'
import { Application, BlurFilter, Container, Graphics } from 'pixi.js'
import { type Vec2, VerletBlob } from './verletBlob'

/** Imperative handle used to drive the slime from pointer or hand input. */
export type SlimeController = {
  grab: (pos: Vec2, delta: Vec2, radius: number) => void
  press: (pos: Vec2, radius: number, strength: number) => void
  release: () => void
  /** Snap the slime back into a blob at the centre. */
  reset: () => void
  center: () => Vec2
  /** Canvas size in CSS pixels. */
  size: () => { w: number; h: number }
}

type UseSlimeResult = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  controller: React.RefObject<SlimeController | null>
  ready: boolean
}

const SLIME_COLOR = 0x7cf29c
const SLIME_ALPHA = 0.92

export function useSlime(): UseSlimeResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const controller = useRef<SlimeController | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const host = canvas.parentElement ?? canvas
    const view = { w: host.clientWidth || 800, h: host.clientHeight || 600 }
    const app = new Application()
    let disposed = false

    const blob = new VerletBlob(
      { cx: view.w / 2, cy: view.h * 0.5, radius: Math.min(view.w, view.h) * 0.22 },
      { w: view.w, h: view.h },
    )

    const tick = (dtMs: number) => {
      if (disposed) return
      blob.step(dtMs / 1000)
      draw()
    }

    let body: Graphics
    let gloss: Graphics
    const draw = () => {
      const pts = blob.points
      const last = pts[pts.length - 1]
      body.clear()
      body.moveTo((last.x + pts[0].x) / 2, (last.y + pts[0].y) / 2)
      for (let i = 0; i < pts.length; i++) {
        const cur = pts[i]
        const next = pts[(i + 1) % pts.length]
        body.quadraticCurveTo(
          cur.x,
          cur.y,
          (cur.x + next.x) / 2,
          (cur.y + next.y) / 2,
        )
      }
      body.closePath()
      body.fill({ color: SLIME_COLOR, alpha: SLIME_ALPHA })

      const c = blob.center()
      gloss.clear()
      gloss.ellipse(c.x - 16, c.y - 24, 32, 19)
      gloss.fill({ color: 0xffffff, alpha: 0.16 })
    }

    // init() returns a promise; keep a handle so teardown always runs *after*
    // init resolves, even under StrictMode's mount/unmount/remount.
    const initPromise = app
      .init({
        canvas,
        width: view.w,
        height: view.h,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      })
      .then(() => {
        if (disposed) return

        const layer = new Container()
        layer.filters = [new BlurFilter({ strength: 5, quality: 2 })]
        body = new Graphics()
        gloss = new Graphics()
        layer.addChild(body, gloss)
        app.stage.addChild(layer)

        app.ticker.add((t) => tick(t.deltaMS))

        controller.current = {
          grab: (pos, delta, radius) => blob.grab(pos, delta, radius),
          press: (pos, radius, strength) => blob.press(pos, radius, strength),
          release: () => blob.releaseGrab(),
          reset: () => blob.reset({ x: view.w / 2, y: view.h * 0.5 }),
          center: () => blob.center(),
          size: () => ({ ...view }),
        }
        setReady(true)
      })
      .catch((err) => {
        if (!disposed) console.error('[slime] init failed', err)
      })

    const onResize = () => {
      const nw = host.clientWidth
      const nh = host.clientHeight
      if (!nw || !nh || disposed) return
      view.w = nw
      view.h = nh
      app.renderer?.resize(nw, nh)
      blob.setBounds(nw, nh)
    }
    window.addEventListener('resize', onResize)

    return () => {
      disposed = true
      window.removeEventListener('resize', onResize)
      controller.current = null
      setReady(false)
      initPromise.then(() => {
        try {
          app.destroy(true, { children: true })
        } catch {
          /* already gone */
        }
      })
    }
  }, [])

  return { canvasRef, controller, ready }
}
