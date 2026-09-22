import { useEffect, useRef, useState } from 'react'
import { Application, BlurFilter, Container, Graphics } from 'pixi.js'
import { applyPalette, GIFEncoder, quantize, type Palette } from 'gifenc'
import {
  drawTopping,
  isToppingKind,
  type ToppingKind,
  TOPPING_COLORS,
  ToppingField,
  type ToppingSpec,
} from './toppings'
import { type Vec2, VerletBlob } from './verletBlob'

/** Imperative handle used to drive the slime from pointer or hand input. */
export type SlimeController = {
  grab: (pos: Vec2, delta: Vec2, radius: number) => void
  press: (pos: Vec2, radius: number, strength: number) => void
  release: () => void
  /** Snap the slime back into a blob at the centre. */
  reset: () => void
  /** Fill colour as a 24-bit RGB number. */
  setColor: (rgb: number) => void
  /** 0 = firm, 1 = very soft/goopy. */
  setSoftness: (v: number) => void
  /** Stick a topping to the slime at a canvas-pixel position. */
  addTopping: (kind: ToppingKind, pos: Vec2) => void
  clearToppings: () => void
  /** Show/hide a topping being carried toward the slime (null clears it). */
  setHeldTopping: (kind: ToppingKind | null, pos: Vec2 | null) => void
  /** Current toppings as normalised (0..1) specs. */
  snapshotToppings: () => ToppingSpec[]
  /** Replace all toppings from normalised specs (e.g. loading a saved slime). */
  loadToppings: (specs: { kind: string; x: number; y: number }[]) => void
  center: () => Vec2
  /** Canvas size in CSS pixels. */
  size: () => { w: number; h: number }
  /** Download the current slime as a transparent PNG. */
  screenshot: (filename?: string) => void
  /**
   * Record a few seconds of the current slime and download it as a GIF.
   * Resolves to false if a recording is already in progress.
   */
  recordGif: (durationMs?: number, fps?: number) => Promise<boolean>
}

const GIF_BACKGROUND = '#0a0a12'
const GIF_MAX_COLORS = 256

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type UseSlimeResult = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  controller: React.RefObject<SlimeController | null>
  ready: boolean
}

const DEFAULT_COLOR = 0x7cf29c
const SLIME_ALPHA = 0.92

/** Maps a 0..1 softness slider onto the blob's spring/damping feel. */
function softnessToParams(v: number) {
  const t = Math.min(Math.max(v, 0), 1)
  return {
    edgeStiffness: 0.95 - t * 0.42,
    pressure: 0.95 - t * 0.4,
    damping: 0.8 + t * 0.13,
  }
}

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
    let color = DEFAULT_COLOR
    const field = new ToppingField()
    let held: { kind: ToppingKind; pos: Vec2 } | null = null
    let gifBusy = false

    const recordGif = async (durationMs = 2500, fps = 8): Promise<boolean> => {
      if (gifBusy || disposed) return false
      gifBusy = true
      try {
        const frameDelay = Math.round(1000 / fps)
        const frameCount = Math.max(2, Math.round(durationMs / frameDelay))
        const gif = GIFEncoder()
        // The slime's colour set barely changes frame to frame, so quantize
        // once from the first frame and reuse it: re-quantizing every frame
        // was the dominant cost of recording and made frame colours drift.
        let palette: Palette | null = null
        for (let i = 0; i < frameCount; i++) {
          const { pixels, width, height } = app.renderer.extract.pixels({
            target: app.stage,
            resolution: 1,
            clearColor: GIF_BACKGROUND,
          })
          palette ??= quantize(pixels, GIF_MAX_COLORS)
          const index = applyPalette(pixels, palette)
          gif.writeFrame(index, width, height, { palette, delay: frameDelay })
          if (disposed) return false
          if (i < frameCount - 1) await sleep(frameDelay)
        }
        gif.finish()
        const gifBlob = new Blob([gif.bytes()], { type: 'image/gif' })
        const url = URL.createObjectURL(gifBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'motionplay-slime.gif'
        a.click()
        URL.revokeObjectURL(url)
        return true
      } finally {
        gifBusy = false
      }
    }

    const tick = (dtMs: number) => {
      if (disposed) return
      blob.step(dtMs / 1000)
      draw()
    }

    let body: Graphics
    let gloss: Graphics
    let toppingGfx: Graphics
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
      body.fill({ color, alpha: SLIME_ALPHA })

      const c = blob.center()
      gloss.clear()
      gloss.ellipse(c.x - 16, c.y - 24, 32, 19)
      gloss.fill({ color: 0xffffff, alpha: 0.16 })

      toppingGfx.clear()
      for (const t of field.list) {
        const p = field.positionOf(t, blob)
        drawTopping(toppingGfx, t.kind, p.x, p.y, t.size, TOPPING_COLORS[t.kind])
      }
      if (held) {
        drawTopping(
          toppingGfx,
          held.kind,
          held.pos.x,
          held.pos.y,
          18,
          TOPPING_COLORS[held.kind],
          0.65,
        )
      }
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
        // Toppings sit above the gooey blur layer so they stay crisp.
        toppingGfx = new Graphics()
        app.stage.addChild(layer, toppingGfx)

        app.ticker.add((t) => tick(t.deltaMS))

        controller.current = {
          grab: (pos, delta, radius) => blob.grab(pos, delta, radius),
          press: (pos, radius, strength) => blob.press(pos, radius, strength),
          release: () => blob.releaseGrab(),
          reset: () => blob.reset({ x: view.w / 2, y: view.h * 0.5 }),
          setColor: (rgb) => {
            color = rgb
          },
          setSoftness: (v) => blob.setParams(softnessToParams(v)),
          addTopping: (kind, pos) => field.add(kind, pos, blob),
          clearToppings: () => field.clear(),
          setHeldTopping: (kind, pos) => {
            held = kind && pos ? { kind, pos } : null
          },
          snapshotToppings: () => field.snapshot(blob, view.w, view.h),
          loadToppings: (specs) => {
            field.clear()
            for (const s of specs) {
              if (!isToppingKind(s.kind)) continue
              field.add(s.kind, { x: s.x * view.w, y: s.y * view.h }, blob)
            }
          },
          center: () => blob.center(),
          size: () => ({ ...view }),
          screenshot: (filename) =>
            app.renderer.extract.download({
              target: app.stage,
              filename: filename ?? 'motionplay-slime.png',
            }),
          recordGif,
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
