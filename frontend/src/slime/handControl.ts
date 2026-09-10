import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { SlimeController } from './useSlime'
import type { ToppingKind } from './toppings'
import type { Vec2 } from './verletBlob'

/** One hand reduced to the values the slime interaction needs. */
export type HandSample = {
  /** Palm centre in normalised (0..1) frame coordinates. */
  palm: Vec2
  /** Midpoint of thumb and index tips, normalised. */
  pinchPoint: Vec2
  /** Spread of the fingers, ~0.7 for a fist and ~2 for an open hand. */
  openness: number
  /** Thumb-to-index distance over palm size; < ~0.4 is a pinch. */
  pinch: number
}

const TIPS = [8, 12, 16, 20]

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function analyzeHand(lm: NormalizedLandmark[]): HandSample | null {
  if (lm.length < 21) return null
  const wrist = lm[0]
  const middleMcp = lm[9]
  const scale = dist(wrist, middleMcp) || 1e-4

  const palm: Vec2 = {
    x: (wrist.x + lm[5].x + lm[17].x) / 3,
    y: (wrist.y + lm[5].y + lm[17].y) / 3,
  }

  let spread = 0
  for (const t of TIPS) {
    spread += Math.hypot(lm[t].x - palm.x, lm[t].y - palm.y)
  }
  const openness = spread / TIPS.length / scale
  const pinch = dist(lm[4], lm[8]) / scale
  const pinchPoint: Vec2 = {
    x: (lm[4].x + lm[8].x) / 2,
    y: (lm[4].y + lm[8].y) / 2,
  }

  return { palm, pinchPoint, openness, pinch }
}

type HandState = { prevPalm: Vec2; gripping: boolean; pinching: boolean }

type DriverConfig = {
  grabRadius?: number
  pressRadius?: number
  /** openness at/below which a grip engages. */
  gripOn?: number
  /** openness at/above which a grip releases (hysteresis). */
  gripOff?: number
  /** pinch ratio at/below which a pinch engages. */
  pinchOn?: number
  /** pinch ratio at/above which a pinch releases (hysteresis). */
  pinchOff?: number
}

const DEFAULTS: Required<DriverConfig> = {
  grabRadius: 110,
  pressRadius: 96,
  gripOn: 1.15,
  gripOff: 1.45,
  pinchOn: 0.5,
  pinchOff: 0.8,
}

/** Per-hand gesture readout, surfaced for on-screen feedback. */
export type HandGesture = {
  gripping: boolean
  pinching: boolean
  openness: number
  pinch: number
}

/**
 * Turns per-frame hand landmarks into slime interactions: a closed fist grabs
 * and drags the slime, an open moving palm presses it, a pinch carries a
 * topping and drops it onto the slime. Keeps a little state per hand so motion
 * is continuous between frames.
 */
export function createHandSlimeDriver(
  getController: () => SlimeController | null,
  config: DriverConfig = {},
  onGestures?: (gestures: HandGesture[]) => void,
) {
  const cfg = { ...DEFAULTS, ...config }
  const states = new Map<number, HandState>()
  let selectedTopping: ToppingKind = 'star'

  const reset = () => {
    states.clear()
    const ctrl = getController()
    ctrl?.release()
    ctrl?.setHeldTopping(null, null)
  }

  const update = (hands: NormalizedLandmark[][]) => {
    const ctrl = getController()
    if (!ctrl) return

    if (hands.length === 0) {
      if (states.size > 0) reset()
      onGestures?.([])
      return
    }

    const { w, h } = ctrl.size()
    let anyGripping = false
    const gestures: HandGesture[] = []

    // Mirror x to match the selfie-view the user sees.
    const toCanvas = (n: Vec2): Vec2 => ({ x: (1 - n.x) * w, y: n.y * h })

    hands.forEach((lm, i) => {
      const sample = analyzeHand(lm)
      if (!sample) return

      const cur = toCanvas(sample.palm)
      const prev = states.get(i)
      const state: HandState =
        prev ?? { prevPalm: cur, gripping: false, pinching: false }

      // Pinch takes priority: it carries a topping instead of touching slime.
      const wasPinching = state.pinching
      if (!state.pinching && sample.pinch < cfg.pinchOn) state.pinching = true
      else if (state.pinching && sample.pinch > cfg.pinchOff) {
        state.pinching = false
      }

      gestures.push({
        gripping: false,
        pinching: state.pinching,
        openness: sample.openness,
        pinch: sample.pinch,
      })

      if (state.pinching || wasPinching) {
        const pt = toCanvas(sample.pinchPoint)
        if (state.pinching) {
          ctrl.setHeldTopping(selectedTopping, pt)
        } else {
          // pinch just released -> drop the topping here
          ctrl.addTopping(selectedTopping, pt)
          ctrl.setHeldTopping(null, null)
        }
        state.prevPalm = cur
        states.set(i, state)
        return
      }

      if (!state.gripping && sample.openness < cfg.gripOn) state.gripping = true
      else if (state.gripping && sample.openness > cfg.gripOff) {
        state.gripping = false
      }
      gestures[gestures.length - 1].gripping = state.gripping

      const delta = {
        x: cur.x - state.prevPalm.x,
        y: cur.y - state.prevPalm.y,
      }

      if (state.gripping) {
        anyGripping = true
        ctrl.grab(state.prevPalm, delta, cfg.grabRadius)
      } else {
        const speed = Math.hypot(delta.x, delta.y)
        if (speed > 0.8) {
          ctrl.press(cur, cfg.pressRadius, Math.min(speed * 0.12, 7))
        }
      }

      state.prevPalm = cur
      states.set(i, state)
    })

    // Drop stale hands and release pins once nobody is holding on.
    for (const key of [...states.keys()]) {
      if (key >= hands.length) states.delete(key)
    }
    if (!anyGripping) ctrl.release()

    onGestures?.(gestures)
  }

  const setSelectedTopping = (kind: ToppingKind) => {
    selectedTopping = kind
  }

  return { update, reset, setSelectedTopping }
}
