import type { Graphics } from 'pixi.js'
import type { Vec2 } from './verletBlob'
import type { VerletBlob } from './verletBlob'

export const TOPPING_KINDS = ['star', 'heart', 'pearl'] as const
export type ToppingKind = (typeof TOPPING_KINDS)[number]

export const TOPPING_COLORS: Record<ToppingKind, number> = {
  star: 0xfde047,
  heart: 0xfb7185,
  pearl: 0xf5f3ff,
}

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

  add(kind: ToppingKind, pos: Vec2, blob: VerletBlob, size = 16) {
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
    this.list.push({
      id: this.nextId++,
      kind,
      anchorIndex: best,
      offset: { x: pos.x - pts[best].x, y: pos.y - pts[best].y },
      size,
    })
  }

  positionOf(t: Topping, blob: VerletBlob): Vec2 {
    const a = blob.points[t.anchorIndex] ?? blob.points[0]
    return { x: a.x + t.offset.x, y: a.y + t.offset.y }
  }

  clear() {
    this.list.length = 0
  }
}

/** Draw one topping shape onto a Graphics at (x, y). Caller sets no transform. */
export function drawTopping(
  g: Graphics,
  kind: ToppingKind,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha = 1,
) {
  if (kind === 'pearl') {
    g.circle(x, y, size * 0.7).fill({ color, alpha })
    g.circle(x - size * 0.22, y - size * 0.22, size * 0.22).fill({
      color: 0xffffff,
      alpha: alpha * 0.8,
    })
    return
  }

  if (kind === 'star') {
    const spikes = 5
    const outer = size * 0.9
    const inner = size * 0.38
    g.moveTo(x, y - outer)
    for (let i = 1; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outer : inner
      const a = -Math.PI / 2 + (i * Math.PI) / spikes
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    }
    g.closePath().fill({ color, alpha })
    return
  }

  // heart — parametric curve, sampled
  const s = size / 17
  g.moveTo(x, y + 5 * s)
  for (let i = 1; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2
    const hx = 16 * Math.sin(t) ** 3
    const hy =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t)
    g.lineTo(x + hx * s, y - hy * s)
  }
  g.closePath().fill({ color, alpha })
}
