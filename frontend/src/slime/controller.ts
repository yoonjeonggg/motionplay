import type { ToppingKind, ToppingSpec } from './toppings'
import type { Vec2 } from './verletBlob'

/** Imperative handle used to drive the slime from pointer or hand input. */
export type SlimeController = {
  grab: (pos: Vec2, delta: Vec2, radius: number) => void
  press: (pos: Vec2, radius: number, strength: number) => void
  release: () => void
  /** Snap the slime back into a blob, resting above the floor. */
  reset: () => void
  /** Fill colour as a 24-bit RGB number. */
  setColor: (rgb: number) => void
  /** 0 = firm, 1 = very soft/goopy. */
  setSoftness: (v: number) => void
  /**
   * Keep the slime above the bottom `px` of the canvas, e.g. clear of a
   * toolbar overlaid there.
   */
  setFloorInset: (px: number) => void
  /** Stick a topping at a canvas-pixel position. False once the slime is full. */
  addTopping: (kind: ToppingKind, pos: Vec2) => boolean
  clearToppings: () => void
  toppingCount: () => number
  /** Show/hide a topping being carried toward the slime (null clears it). */
  setHeldTopping: (kind: ToppingKind | null, pos: Vec2 | null) => void
  /** Current toppings as normalised (0..1) specs. */
  snapshotToppings: () => ToppingSpec[]
  /** Replace all toppings from normalised specs (e.g. loading a saved slime). */
  loadToppings: (specs: { kind: string; x: number; y: number }[]) => void
  /** Canvas size in CSS pixels. */
  size: () => { w: number; h: number }
  /** Download the current slime as a transparent PNG. */
  screenshot: () => Promise<void>
  /**
   * Record a few seconds of the current slime and download it as a GIF.
   * Resolves to false if a recording is already running or was cut short.
   */
  recordGif: (durationMs?: number, fps?: number) => Promise<boolean>
}
