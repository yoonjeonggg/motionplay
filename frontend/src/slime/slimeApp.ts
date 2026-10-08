import { Application } from 'pixi.js'
// Swaps Pixi's runtime-generated (new Function) shader/uniform code for
// static versions, so the renderer works under our CSP without 'unsafe-eval'.
import 'pixi.js/unsafe-eval'
import { clamp01 } from '../lib/math'
import type { SlimeController } from './controller'
import { downloadBlob, recordStageGif } from './gif'
import { DEFAULT_SLIME_COLOR } from './palette'
import { type HeldTopping, SlimeScene } from './slimeScene'
import { isToppingKind, ToppingField } from './toppings'
import { VerletBlob } from './verletBlob'

const EXPORT_FILENAME = 'motionplay-slime'

/** Frames to keep drawing after the slime stops moving, so it settles cleanly. */
const SETTLE_FRAMES = 30

/** The page's current (theme) background, for exports that can't be transparent. */
function pageBackground(): string {
  return getComputedStyle(document.body).backgroundColor || '#111113'
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

export type SlimeApp = {
  controller: SlimeController
  resize: (w: number, h: number) => void
  destroy: () => void
}

/**
 * Builds the renderer, physics and scene for one slime inside `host`.
 *
 * The app creates (and on destroy removes) its own <canvas>. Rendering into a
 * React-owned canvas broke under StrictMode: the effect's mount/unmount/
 * remount gave two apps the same canvas, so the first app's destroy() took
 * the canvas out of the DOM and lost the WebGL context the second was using
 * — in development the slime never appeared.
 */
export async function createSlimeApp(host: HTMLElement): Promise<SlimeApp> {
  const view = { w: host.clientWidth || 800, h: host.clientHeight || 600 }
  let floorInset = 0
  const restCenter = () => ({ x: view.w / 2, y: (view.h - floorInset) * 0.55 })

  const app = new Application()
  await app.init({
    width: view.w,
    height: view.h,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  })

  let destroyed = false
  const blob = new VerletBlob(
    // Width-bound on portrait phones, height-bound on landscape screens.
    { cx: view.w / 2, cy: view.h * 0.5, radius: Math.min(view.w * 0.3, view.h * 0.22) },
    { w: view.w, h: view.h },
  )
  const field = new ToppingField()
  const scene = new SlimeScene(app.stage, DEFAULT_SLIME_COLOR)
  let held: HeldTopping | null = null
  let gifBusy = false

  // Physics runs every frame, but drawing only while something can change:
  // a slime at rest used to be re-rendered 60 times a second for nothing.
  // Any input or setting change wakes it (see `waking` below).
  app.ticker.remove(app.render, app)
  let stillFrames = 0
  const wake = () => {
    stillFrames = 0
  }
  app.ticker.add((t) => {
    blob.step(t.deltaMS / 1000)
    stillFrames = blob.isMoving() ? 0 : stillFrames + 1
    if (stillFrames > SETTLE_FRAMES) return
    scene.draw(blob, field, held)
    app.render()
  })
  host.appendChild(app.canvas)

  /** Wrap a controller method so calling it resumes drawing. */
  const waking =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      wake()
      return fn(...args)
    }

  const controller: SlimeController = {
    grab: waking((pos, delta, radius) => blob.grab(pos, delta, radius)),
    press: waking((pos, radius, strength) => blob.press(pos, radius, strength)),
    release: waking(() => blob.releaseGrab()),
    reset: waking(() => blob.reset(restCenter())),
    setColor: waking((rgb: number) => scene.setColor(rgb)),
    setSoftness: waking((v: number) => blob.setParams(softnessToParams(v))),
    setFloorInset: waking((px: number) => {
      floorInset = Math.max(0, Math.min(px, view.h * 0.5))
      blob.setBounds(view.w, view.h - floorInset)
    }),
    addTopping: waking((kind, pos) => field.add(kind, pos, blob)),
    clearToppings: waking(() => field.clear()),
    toppingCount: () => field.list.length,
    setHeldTopping: waking((kind, pos) => {
      held = kind && pos ? { kind, pos } : null
    }),
    snapshotToppings: () => field.snapshot(blob, view.w, view.h),
    loadToppings: waking((specs: { kind: string; x: number; y: number }[]) => {
      field.clear()
      for (const s of specs) {
        if (!isToppingKind(s.kind)) continue
        field.add(s.kind, { x: s.x * view.w, y: s.y * view.h }, blob)
      }
    }),
    size: () => ({ ...view }),
    screenshot: async () => {
      const canvas = app.renderer.extract.canvas({ target: app.stage })
      const png = await new Promise<Blob | null>((resolve) => {
        if ('toBlob' in canvas && canvas.toBlob) canvas.toBlob(resolve, 'image/png')
        else resolve(null)
      })
      if (!png) throw new Error('이미지를 만들지 못했어요')
      downloadBlob(png, `${EXPORT_FILENAME}.png`)
    },
    recordGif: async (durationMs = 2500, fps = 8) => {
      if (gifBusy || destroyed) return false
      gifBusy = true
      try {
        const gif = await recordStageGif(app, {
          durationMs,
          fps,
          background: pageBackground(),
          cancelled: () => destroyed,
        })
        if (!gif) return false
        downloadBlob(gif, `${EXPORT_FILENAME}.gif`)
        return true
      } finally {
        gifBusy = false
      }
    },
  }

  return {
    controller,
    resize: (w, h) => {
      if (!w || !h || destroyed) return
      view.w = w
      view.h = h
      wake()
      app.renderer.resize(w, h)
      floorInset = Math.min(floorInset, h * 0.5)
      blob.setBounds(w, h - floorInset)
    },
    destroy: () => {
      if (destroyed) return
      destroyed = true
      // removeView: the canvas is ours, so it leaves the DOM with the app.
      app.destroy(true, { children: true })
      scene.destroy()
    },
  }
}
