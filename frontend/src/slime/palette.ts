export type SlimeColor = { name: string; rgb: number; css: string }

export const SLIME_COLORS: SlimeColor[] = [
  { name: '민트', rgb: 0x7cf29c, css: '#7cf29c' },
  { name: '핑크', rgb: 0xf9a8d4, css: '#f9a8d4' },
  { name: '블루', rgb: 0x93c5fd, css: '#93c5fd' },
  { name: '퍼플', rgb: 0xc4b5fd, css: '#c4b5fd' },
  { name: '옐로', rgb: 0xfde68a, css: '#fde68a' },
]

export const DEFAULT_SLIME_COLOR = SLIME_COLORS[0].rgb
export const DEFAULT_SOFTNESS = 0.4
