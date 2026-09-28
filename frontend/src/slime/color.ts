/** Blend a 24-bit RGB colour toward `target` by `t` (0..1). */
export function mixColor(rgb: number, target: number, t: number): number {
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

export const lighten = (rgb: number, t: number) => mixColor(rgb, 0xffffff, t)
export const darken = (rgb: number, t: number) => mixColor(rgb, 0x000000, t)

/** 24-bit RGB number -> "#rrggbb". */
export const toCssHex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`
