export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export const clamp01 = (v: number) => clamp(v, 0, 1)
