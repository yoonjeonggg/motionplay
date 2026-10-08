import { BlurFilter, Container, FillGradient, Graphics, GraphicsContext } from 'pixi.js'
import { darken, lighten } from './color'
import { createToppingContext } from './toppingShapes'
import { type ToppingField, type ToppingKind, TOPPING_KINDS, TOPPING_SIZE } from './toppings'
import type { Vec2, VerletBlob } from './verletBlob'

/** A topping being carried toward the slime, not yet stuck to it. */
export type HeldTopping = { kind: ToppingKind; pos: Vec2 }

const SLIME_ALPHA = 0.92
const HELD_TOPPING_SIZE = 18
const HELD_TOPPING_ALPHA = 0.65

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

/**
 * The Pixi display tree for one slime: shadow, gradient body, gloss, the
 * sockets toppings sit in, and the toppings themselves. Knows nothing about
 * physics or input; draw() just mirrors a blob and its toppings each frame.
 */
export class SlimeScene {
  private color: number
  private bodyGradient: FillGradient

  private readonly shadow = new Graphics()
  private readonly body = new Graphics()
  private readonly gloss = new Graphics()
  private readonly socketLayer = new Container()
  private readonly toppingLayer = new Container()
  private readonly heldIcon: Graphics

  // One shared shape per topping kind; each stuck topping is a Graphics
  // that only gets moved per frame. Clearing and re-drawing every topping
  // each frame (re-tessellating it) measured ~18x slower at 40 toppings.
  private readonly toppingContexts = Object.fromEntries(
    TOPPING_KINDS.map((k) => [k, createToppingContext(k)]),
  ) as Record<ToppingKind, GraphicsContext>
  // White, so the socket layer's tint gives it the slime's colour.
  private readonly socketContext = new GraphicsContext()
    .ellipse(0, 0, TOPPING_SIZE * 1.3, TOPPING_SIZE * 1.05)
    .fill({ color: 0xffffff, alpha: 0.4 })
  private readonly toppingIcons: Graphics[] = []
  private readonly toppingSockets: Graphics[] = []

  constructor(stage: Container, color: number) {
    this.color = color
    this.bodyGradient = createBodyGradient(color)

    const layer = new Container()
    layer.filters = [new BlurFilter({ strength: 5, quality: 2 })]
    // Toppings sit in a soft, blurred "socket" — the same colour family as
    // the body, folded around the topping's footprint — so they look pressed
    // into the goo instead of stuck on top like stickers.
    this.socketLayer.tint = darken(color, 0.3)
    layer.addChild(this.shadow, this.body, this.socketLayer, this.gloss)

    // Topping icons sit above the gooey blur layer so they stay crisp.
    this.heldIcon = new Graphics(this.toppingContexts[TOPPING_KINDS[0]])
    this.heldIcon.alpha = HELD_TOPPING_ALPHA
    this.heldIcon.scale.set(HELD_TOPPING_SIZE / TOPPING_SIZE)
    this.heldIcon.visible = false
    this.toppingLayer.addChild(this.heldIcon)

    stage.addChild(layer, this.toppingLayer)
  }

  setColor(rgb: number) {
    if (rgb === this.color) return
    this.color = rgb
    this.bodyGradient.destroy()
    this.bodyGradient = createBodyGradient(rgb)
    this.socketLayer.tint = darken(rgb, 0.3)
  }

  draw(blob: VerletBlob, field: ToppingField, held: HeldTopping | null) {
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

    // Soft contact shadow so the blob reads as resting on a surface instead
    // of floating like a rendered-out ball.
    this.shadow
      .clear()
      .ellipse(cx, maxY + ry * 0.18, rx * 0.85, ry * 0.22)
      .fill({ color: 0x000000, alpha: 0.32 })

    const body = this.body
    const last = pts[pts.length - 1]
    body.clear()
    body.moveTo((last.x + pts[0].x) / 2, (last.y + pts[0].y) / 2)
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i]
      const next = pts[(i + 1) % pts.length]
      body.quadraticCurveTo(cur.x, cur.y, (cur.x + next.x) / 2, (cur.y + next.y) / 2)
    }
    body.closePath().fill({ fill: this.bodyGradient, alpha: SLIME_ALPHA })

    // Wide soft sheen plus a small tight highlight for a wet-glass shine,
    // both scaled to the blob's current (squished) size.
    const hlX = cx - rx * 0.32
    const hlY = cy - ry * 0.42
    this.gloss
      .clear()
      .ellipse(hlX, hlY, rx * 0.42, ry * 0.28)
      .fill({ color: 0xffffff, alpha: 0.13 })
      .ellipse(hlX - rx * 0.06, hlY - ry * 0.08, rx * 0.1, ry * 0.07)
      .fill({ color: 0xffffff, alpha: 0.55 })

    this.syncToppings(blob, field, held)
  }

  /** Position (and lazily create) one icon + socket per topping; hide the rest. */
  private syncToppings(blob: VerletBlob, field: ToppingField, held: HeldTopping | null) {
    const list = field.list
    for (let i = 0; i < list.length; i++) {
      const t = list[i]
      const ctx = this.toppingContexts[t.kind]
      let icon = this.toppingIcons[i]
      let socket = this.toppingSockets[i]
      if (!icon) {
        icon = this.toppingLayer.addChild(new Graphics(ctx))
        socket = this.socketLayer.addChild(new Graphics(this.socketContext))
        this.toppingIcons.push(icon)
        this.toppingSockets.push(socket)
      }
      if (icon.context !== ctx) icon.context = ctx
      // Inlined rather than field.positionOf(), which allocates a Vec2 per
      // topping per frame.
      const a = blob.points[t.anchorIndex] ?? blob.points[0]
      const x = a.x + t.offset.x
      const y = a.y + t.offset.y
      const scale = t.size / TOPPING_SIZE
      icon.position.set(x, y)
      icon.scale.set(scale)
      icon.visible = true
      socket.position.set(x, y)
      socket.scale.set(scale)
      socket.visible = true
    }
    for (let i = list.length; i < this.toppingIcons.length; i++) {
      this.toppingIcons[i].visible = false
      this.toppingSockets[i].visible = false
    }

    this.heldIcon.visible = held !== null
    if (held) {
      const ctx = this.toppingContexts[held.kind]
      if (this.heldIcon.context !== ctx) this.heldIcon.context = ctx
      this.heldIcon.position.set(held.pos.x, held.pos.y)
    }
  }

  /**
   * Free the resources no single Graphics owns. Call after the stage (and so
   * every Graphics referencing these) has been destroyed.
   */
  destroy() {
    this.bodyGradient.destroy()
    for (const ctx of Object.values(this.toppingContexts)) ctx.destroy()
    this.socketContext.destroy()
  }
}
