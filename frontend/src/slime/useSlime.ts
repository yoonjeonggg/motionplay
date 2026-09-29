import { useEffect, useRef, useState } from 'react'
import { Application } from 'pixi.js'
// Swaps Pixi's runtime-generated (new Function) shader/uniform code for
// static versions, so the renderer works under our CSP without 'unsafe-eval'.
import 'pixi.js/unsafe-eval'
import { clamp01 } from '../lib/math'
import { downloadBlob, recordStageGif } from './gif'
import { DEFAULT_SLIME_COLOR } from './palette'
import { type HeldTopping, SlimeScene } from './slimeScene'
import { isToppingKind, type ToppingKind, ToppingField, type ToppingSpec } from './toppings'
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

const EXPORT_FILENAME = 'motionplay-slime'

/** The page's current (theme) background, for exports that can't be transparent. */
function pageBackground(): string {
  return getComputedStyle(document.body).backgroundColor || '#111113'
}

type UseSlimeResult = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  controller: React.RefObject<SlimeController | null>
  ready: boolean
}

/** Maps a 0..1 softness slider onto the blob's spring/damping feel. */
function softnessToParams(v: number) {
  const t = clamp01(v)
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
    const field = new ToppingField()
    let held: HeldTopping | null = null
    let scene: SlimeScene | null = null
    let gifBusy = false

    const recordGif = async (durationMs = 2500, fps = 8): Promise<boolean> => {
      if (gifBusy || disposed) return false
      gifBusy = true
      try {
        const gif = await recordStageGif(app, {
          durationMs,
          fps,
          background: pageBackground(),
          cancelled: () => disposed,
        })
        if (!gif) return false
        downloadBlob(gif, `${EXPORT_FILENAME}.gif`)
        return true
      } finally {
        gifBusy = false
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

        const slime = new SlimeScene(app.stage, DEFAULT_SLIME_COLOR)
        scene = slime
        app.ticker.add((t) => {
          if (disposed) return
          blob.step(t.deltaMS / 1000)
          slime.draw(blob, field, held)
        })

        controller.current = {
          grab: (pos, delta, radius) => blob.grab(pos, delta, radius),
          press: (pos, radius, strength) => blob.press(pos, radius, strength),
          release: () => blob.releaseGrab(),
          reset: () => blob.reset({ x: view.w / 2, y: view.h * 0.5 }),
          setColor: (rgb) => slime.setColor(rgb),
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
          size: () => ({ ...view }),
          screenshot: (filename) =>
            app.renderer.extract.download({
              target: app.stage,
              filename: filename ?? `${EXPORT_FILENAME}.png`,
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
      initPromise.then(() => {
        try {
          app.destroy(true, { children: true })
        } catch {
          /* already gone */
        }
        scene?.destroy()
      })
    }
  }, [])

  return { canvasRef, controller, ready }
}
