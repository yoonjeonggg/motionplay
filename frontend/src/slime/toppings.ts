import type { Vec2, VerletBlob } from './verletBlob'
import { clamp01 } from '../lib/math'

export const TOPPING_KINDS = ['star', 'heart', 'pearl'] as const
export type ToppingKind = (typeof TOPPING_KINDS)[number]

export const TOPPING_COLORS: Record<ToppingKind, number> = {
  star: 0xfde047,
  heart: 0xfb7185,
  pearl: 0xf5f3ff,
}

/** Size toppings are attached at; shared shape contexts are built at this size. */
export const TOPPING_SIZE = 16

/** The most a saved slime may carry; mirrors maxToppings in the backend. */
export const MAX_TOPPINGS = 200

export type Topping = {
  id: number
  kind: ToppingKind
  /** Perimeter point the topping rides on. */
  anchorIndex: number
  /** Fixed world offset from the anchor point, captured at attach time. */
  offset: Vec2
  size: number
}

/** Toppings stuck to the slime. Each one follows its anchor point as the blob deforms. */
export class ToppingField {
  readonly list: Topping[] = []
  private nextId = 1

  /** Stick a topping near `pos`. Returns false (adding nothing) once full. */
  add(kind: ToppingKind, pos: Vec2, blob: VerletBlob, size = TOPPING_SIZE): boolean {
    if (this.list.length >= MAX_TOPPINGS) return false
    const pts = blob.points
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i].x - pos.x) ** 2 + (pts[i].y - pos.y) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    const anchor = pts[best]
    // Keep the offset from where the user put it when that's on the slime.
    // Outside it, the raw offset would leave the topping floating in the air
    // (and a saved slime reloaded after the blob moved would scatter them),
    // so seat it just inside the nearest edge instead.
    let offset = { x: pos.x - anchor.x, y: pos.y - anchor.y }
    if (!blob.contains(pos)) {
      const c = blob.center()
      const dx = c.x - anchor.x
      const dy = c.y - anchor.y
      const len = Math.hypot(dx, dy) || 1
      const inset = Math.min(size * 0.8, len)
      offset = { x: (dx / len) * inset, y: (dy / len) * inset }
    }
    this.list.push({ id: this.nextId++, kind, anchorIndex: best, offset, size })
    return true
  }

  positionOf(t: Topping, blob: VerletBlob): Vec2 {
    const a = blob.points[t.anchorIndex] ?? blob.points[0]
    return { x: a.x + t.offset.x, y: a.y + t.offset.y }
  }

  /** Current toppings as canvas-normalised (0..1) specs, for persistence. */
  snapshot(blob: VerletBlob, w: number, h: number): ToppingSpec[] {
    return this.list.map((t) => {
      const p = this.positionOf(t, blob)
      return { kind: t.kind, x: clamp01(p.x / w), y: clamp01(p.y / h) }
    })
  }

  clear() {
    this.list.length = 0
  }
}

export type ToppingSpec = { kind: ToppingKind; x: number; y: number }

export function isToppingKind(v: string): v is ToppingKind {
  return (TOPPING_KINDS as readonly string[]).includes(v)
}
