import { useEffect, useRef, useState } from 'react'
import { Application, BlurFilter, Container, FillGradient, Graphics } from 'pixi.js'
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

/** Blend a 24-bit RGB colour toward `target` by `t` (0..1). */
function mixColor(rgb: number, target: number, t: number): number {
  const r1 = (rgb >> 16) & 0xff
  const g1 = (rgb >> 8) & 0xff
  const b1 = rgb & 0xff
  const r2 = (target >> 16) & 0xff
  const g2 = (target >> 8) & 0xff
  const b2 = target & 0xff
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return (r << 16) | (g << 8) | b
}
const lighten = (rgb: number, t: number) => mixColor(rgb, 0xffffff, t)
const darken = (rgb: number, t: number) => mixColor(rgb, 0x000000, t)

/**
 * A radial gradient standing in for subsurface light scattering: bright near
 * the (fixed) light corner, the base colour through the middle, deeper and
 * more saturated at the rim — the cue that reads as "translucent gooey mass"
 * instead of "flat-shaded ball". `textureSpace: 'local'` re-fits it to the
 * shape's current bounds on every fill, so it tracks the blob as it wobbles
 * without being rebuilt each frame.
 */
function createBodyGradient(rgb: number): FillGradient {
  return new FillGradient({
    type: 'radial',
    center: { x: 0.34, y: 0.24 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.56 },
    outerRadius: 0.8,
    colorStops: [
      { offset: 0, color: lighten(rgb, 0.55) },
      { offset: 0.45, color: rgb },
      { offset: 1, color: darken(rgb, 0.4) },
    ],
    textureSpace: 'local',
  })
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
    let bodyGradient = createBodyGradient(color)
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

    let shadow: Graphics
    let body: Graphics
    let socket: Graphics
    let gloss: Graphics
    let toppingGfx: Graphics
    const draw = () => {
      const pts = blob.points
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const p of pts) {
        if (p.x < minX) minX = p.x
        if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y
        if (p.y > maxY) maxY = p.y
      }
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      const rx = (maxX - minX) / 2
      const ry = (maxY - minY) / 2

      // Soft contact shadow so the blob reads as resting on a surface
      // instead of floating like a rendered-out ball.
      shadow.clear()
      shadow.ellipse(cx, maxY + ry * 0.18, rx * 0.85, ry * 0.22)
      shadow.fill({ color: 0x000000, alpha: 0.32 })

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
      // Radial gradient (bright core -> deeper rim) instead of a flat fill:
      // reads as translucent goo with some thickness rather than a painted ball.
      body.fill({ fill: bodyGradient, alpha: SLIME_ALPHA })

      // Toppings sit in a soft, blurred "socket" — the same colour family as
      // the body, folded around the topping's footprint — so they look
      // pressed into the goo instead of stuck on top like stickers. This
      // lives in the blurred layer, under the crisp topping icons.
      socket.clear()
      for (const t of field.list) {
        const p = field.positionOf(t, blob)
        socket.ellipse(p.x, p.y, t.size * 1.3, t.size * 1.05)
        socket.fill({ color: darken(color, 0.3), alpha: 0.4 })
      }

      // Wide soft sheen plus a small tight highlight for a wet-glass shine,
      // both scaled to the blob's current (squished) size.
      const hlX = cx - rx * 0.32
      const hlY = cy - ry * 0.42
      gloss.clear()
      gloss.ellipse(hlX, hlY, rx * 0.42, ry * 0.28)
      gloss.fill({ color: 0xffffff, alpha: 0.13 })
      gloss.ellipse(hlX - rx * 0.06, hlY - ry * 0.08, rx * 0.1, ry * 0.07)
      gloss.fill({ color: 0xffffff, alpha: 0.55 })

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
        shadow = new Graphics()
        body = new Graphics()
        socket = new Graphics()
        gloss = new Graphics()
        layer.addChild(shadow, body, socket, gloss)
        // Toppings sit above the gooey blur layer so their icons stay crisp
        // (the soft "socket" halo that makes them look embedded lives in
        // `layer` above, so it gets blurred together with the body).
        toppingGfx = new Graphics()
        app.stage.addChild(layer, toppingGfx)

        app.ticker.add((t) => tick(t.deltaMS))

        controller.current = {
          grab: (pos, delta, radius) => blob.grab(pos, delta, radius),
          press: (pos, radius, strength) => blob.press(pos, radius, strength),
          release: () => blob.releaseGrab(),
          reset: () => blob.reset({ x: view.w / 2, y: view.h * 0.5 }),
          setColor: (rgb) => {
            if (rgb === color) return
            color = rgb
            bodyGradient.destroy()
            bodyGradient = createBodyGradient(rgb)
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

    // A resize drag can fire dozens of 'resize' events per second; renderer
    // resize reallocates the render surface, so coalesce to one per frame
    // instead of doing that work on every event.
    let resizeRaf = 0
    const applyResize = () => {
      resizeRaf = 0
      const nw = host.clientWidth
      const nh = host.clientHeight
      if (!nw || !nh || disposed) return
      view.w = nw
      view.h = nh
      app.renderer?.resize(nw, nh)
      blob.setBounds(nw, nh)
    }
    const onResize = () => {
      if (resizeRaf) return
      resizeRaf = requestAnimationFrame(applyResize)
    }
    window.addEventListener('resize', onResize)

    return () => {
      disposed = true
      if (resizeRaf) cancelAnimationFrame(resizeRaf)
      window.removeEventListener('resize', onResize)
      controller.current = null
      setReady(false)
      bodyGradient.destroy()
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
