/**
 * Pressure-based soft-body blob (Verlet integration).
 *
 * A ring of perimeter points held together by edge springs and an area
 * (pressure) constraint. This gives the squishy "slime" behaviour: press it and
 * it spreads, pull it and it stretches, let go and it wobbles back.
 *
 * Rigid toppings later live in Matter.js; the slime body itself is custom so we
 * can tune the feel and render it as one smooth closed shape.
 */

export type Vec2 = { x: number; y: number }

export type BlobPoint = {
  x: number
  y: number
  px: number
  py: number
  /** Set while the point is held by a grab; skipped during integration. */
  pinned: boolean
}

export type BlobOptions = {
  cx: number
  cy: number
  radius: number
  points?: number
  gravity?: number
  /** 0..1 velocity retention per step. */
  damping?: number
  /** Edge spring stiffness, 0..1. */
  edgeStiffness?: number
  /** Area-restoration stiffness, 0..1. */
  pressure?: number
  constraintIterations?: number
}

const DEFAULTS = {
  points: 28,
  gravity: 1400,
  damping: 0.86,
  edgeStiffness: 0.9,
  pressure: 0.9,
  constraintIterations: 12,
}

export class VerletBlob {
  readonly points: BlobPoint[] = []
  private readonly restLength: number
  private readonly restArea: number
  private readonly opts: Required<BlobOptions>
  private bounds: { w: number; h: number }

  constructor(options: BlobOptions, bounds: { w: number; h: number }) {
    this.opts = { ...DEFAULTS, ...options }
    this.bounds = bounds

    const { radius, points } = this.opts
    for (let i = 0; i < points; i++) {
      this.points.push({ x: 0, y: 0, px: 0, py: 0, pinned: false })
    }
    const chord = 2 * radius * Math.sin(Math.PI / points)
    this.restLength = chord
    this.restArea = Math.PI * radius * radius
    this.reset()
  }

  setBounds(w: number, h: number) {
    this.bounds = { w, h }
  }

  /** Snap every point back to the starting circle. */
  reset(center?: Vec2) {
    const { points, radius } = this.opts
    const cx = center?.x ?? this.opts.cx
    const cy = center?.y ?? this.opts.cy
    for (let i = 0; i < points; i++) {
      const a = (i / points) * Math.PI * 2
      const x = cx + Math.cos(a) * radius
      const y = cy + Math.sin(a) * radius
      const p = this.points[i]
      p.x = x
      p.y = y
      p.px = x
      p.py = y
      p.pinned = false
    }
  }

  /** Centroid of the blob. */
  center(): Vec2 {
    let x = 0
    let y = 0
    for (const p of this.points) {
      x += p.x
      y += p.y
    }
    return { x: x / this.points.length, y: y / this.points.length }
  }

  area(): number {
    const pts = this.points
    let a = 0
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length
      a += pts[i].x * pts[j].y - pts[j].x * pts[i].y
    }
    return Math.abs(a) / 2
  }

  /**
   * Displace points within `radius` of `pos` by `delta`, weighted by a smooth
   * falloff. Used to drag the slime with a pointer or a hand.
   */
  grab(pos: Vec2, delta: Vec2, radius: number) {
    const r2 = radius * radius
    for (const p of this.points) {
      const dx = p.x - pos.x
      const dy = p.y - pos.y
      const d2 = dx * dx + dy * dy
      if (d2 > r2) continue
      const w = 1 - Math.sqrt(d2) / radius
      const falloff = w * w * (3 - 2 * w)
      p.x += delta.x * falloff
      p.y += delta.y * falloff
      p.pinned = true
    }
  }

  /** Push points radially away from `pos` (a "press" / poke). */
  press(pos: Vec2, radius: number, strength: number) {
    const r2 = radius * radius
    for (const p of this.points) {
      const dx = p.x - pos.x
      const dy = p.y - pos.y
      const d2 = dx * dx + dy * dy
      if (d2 > r2 || d2 < 1e-3) continue
      const d = Math.sqrt(d2)
      const w = 1 - d / radius
      const push = (w * w * strength) / d
      p.x += dx * push
      p.y += dy * push
    }
  }

  releaseGrab() {
    for (const p of this.points) p.pinned = false
  }

  step(dtSeconds: number) {
    const dt = Math.min(Math.max(dtSeconds, 0), 1 / 30)
    this.integrate(dt)
    for (let i = 0; i < this.opts.constraintIterations; i++) {
      this.solveEdges()
      this.solvePressure()
      this.solveBounds()
    }
    this.sanitize()
  }

  /** Guard against NaN/Infinity blow-ups feeding the renderer. */
  private sanitize() {
    const { w, h } = this.bounds
    for (const p of this.points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        p.x = Math.min(Math.max(p.px, 0), w) || w / 2
        p.y = Math.min(Math.max(p.py, 0), h) || h / 2
        p.px = p.x
        p.py = p.y
      }
    }
  }

  private integrate(dt: number) {
    const { damping, gravity } = this.opts
    const g = gravity * dt * dt
    for (const p of this.points) {
      if (p.pinned) {
        p.px = p.x
        p.py = p.y
        continue
      }
      const vx = (p.x - p.px) * damping
      const vy = (p.y - p.py) * damping
      p.px = p.x
      p.py = p.y
      p.x += vx
      p.y += vy + g
    }
  }

  private solveEdges() {
    const pts = this.points
    const k = this.opts.edgeStiffness
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.hypot(dx, dy) || 1e-4
      let diff = ((dist - this.restLength) / dist) * 0.5 * k
      diff = Math.min(Math.max(diff, -0.5), 0.5)
      const ox = dx * diff
      const oy = dy * diff
      if (!a.pinned) {
        a.x += ox
        a.y += oy
      }
      if (!b.pinned) {
        b.x -= ox
        b.y -= oy
      }
    }
  }

  private solvePressure() {
    const current = this.area() || 1
    const ratio = Math.min(Math.max(this.restArea / current, 0.5), 2)
    const push = (ratio - 1) * this.opts.pressure
    if (Math.abs(push) < 1e-4) return
    const c = this.center()
    for (const p of this.points) {
      if (p.pinned) continue
      // Displacement is proportional to the vector from the centroid, so the
      // blob expands/contracts uniformly. push is already clamped to ~[-0.45, 0.9].
      p.x += (p.x - c.x) * push * 0.1
      p.y += (p.y - c.y) * push * 0.1
    }
  }

  private solveBounds() {
    const { w, h } = this.bounds
    const pad = 4
    for (const p of this.points) {
      if (p.x < pad) p.x = pad
      else if (p.x > w - pad) p.x = w - pad
      if (p.y < pad) p.y = pad
      else if (p.y > h - pad) p.y = h - pad
    }
  }
}
