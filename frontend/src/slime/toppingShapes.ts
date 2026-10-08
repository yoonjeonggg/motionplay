import { GraphicsContext } from 'pixi.js'
import { TOPPING_COLORS, TOPPING_SIZE, type ToppingKind } from './toppings'

/**
 * Build one topping shape, centred on the origin, as a reusable context.
 * Renderers share one context per kind across every topping of that kind and
 * only move/scale the Graphics that display it, so the shape is tessellated
 * once instead of being rebuilt every frame.
 */
export function createToppingContext(
  kind: ToppingKind,
  size = TOPPING_SIZE,
  color = TOPPING_COLORS[kind],
): GraphicsContext {
  const g = new GraphicsContext()

  if (kind === 'pearl') {
    g.circle(0, 0, size * 0.7).fill({ color })
    g.circle(-size * 0.22, -size * 0.22, size * 0.22).fill({
      color: 0xffffff,
      alpha: 0.8,
    })
    return g
  }

  if (kind === 'star') {
    const spikes = 5
    const outer = size * 0.9
    const inner = size * 0.38
    g.moveTo(0, -outer)
    for (let i = 1; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outer : inner
      const a = -Math.PI / 2 + (i * Math.PI) / spikes
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    return g.closePath().fill({ color })
  }

  // heart — parametric curve, sampled
  const s = size / 17
  g.moveTo(0, 5 * s)
  for (let i = 1; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2
    const hx = 16 * Math.sin(t) ** 3
    const hy =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t)
    g.lineTo(hx * s, -hy * s)
  }
  return g.closePath().fill({ color })
}
