import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { SlimeController } from './controller'
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

/**
 * Hysteresis switch for a value that engages when it drops below `on` and
 * only releases once it rises above `off` (> on), so jitter around a single
 * threshold doesn't make a gesture flicker.
 */
function latch(active: boolean, value: number, on: number, off: number): boolean {
  return active ? value <= off : value < on
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

  // Whether the last reported gesture list was empty, so "no hands" is sent
  // once instead of every frame.
  let reportedEmpty = false

  const reset = () => {
    states.clear()
    const ctrl = getController()
    ctrl?.release()
    ctrl?.setHeldTopping(null, null)
  }

  /** Advance one hand's state and apply its effect. Returns its gesture. */
  const stepHand = (
    ctrl: SlimeController,
    index: number,
    sample: HandSample,
    toCanvas: (n: Vec2) => Vec2,
  ): HandGesture => {
    const cur = toCanvas(sample.palm)
    const state = states.get(index) ?? { prevPalm: cur, gripping: false, pinching: false }
    states.set(index, state)
    const delta = { x: cur.x - state.prevPalm.x, y: cur.y - state.prevPalm.y }
    const prevPalm = state.prevPalm
    state.prevPalm = cur

    // Pinch takes priority: it carries a topping instead of touching slime.
    const wasPinching = state.pinching
    state.pinching = latch(state.pinching, sample.pinch, cfg.pinchOn, cfg.pinchOff)
    if (state.pinching) {
      ctrl.setHeldTopping(selectedTopping, toCanvas(sample.pinchPoint))
    } else if (wasPinching) {
      // pinch just released -> drop the topping here
      ctrl.addTopping(selectedTopping, toCanvas(sample.pinchPoint))
      ctrl.setHeldTopping(null, null)
    } else {
      state.gripping = latch(state.gripping, sample.openness, cfg.gripOn, cfg.gripOff)
      if (state.gripping) {
        ctrl.grab(prevPalm, delta, cfg.grabRadius)
      } else {
        const speed = Math.hypot(delta.x, delta.y)
        if (speed > 0.8) {
          ctrl.press(cur, cfg.pressRadius, Math.min(speed * 0.12, 7))
        }
      }
    }

    return {
      gripping: state.gripping && !state.pinching && !wasPinching,
      pinching: state.pinching,
      openness: sample.openness,
      pinch: sample.pinch,
    }
  }

  const update = (hands: NormalizedLandmark[][]) => {
    const ctrl = getController()
    if (!ctrl) return

    if (hands.length === 0) {
      if (states.size > 0) reset()
      if (!reportedEmpty) onGestures?.([])
      reportedEmpty = true
      return
    }

    const { w, h } = ctrl.size()
    // Mirror x to match the selfie-view the user sees.
    const toCanvas = (n: Vec2): Vec2 => ({ x: (1 - n.x) * w, y: n.y * h })

    const gestures: HandGesture[] = []
    for (let i = 0; i < hands.length; i++) {
      const sample = analyzeHand(hands[i])
      if (sample) gestures.push(stepHand(ctrl, i, sample, toCanvas))
    }

    // Drop stale hands and release pins once nobody is holding on.
    for (const key of states.keys()) {
      if (key >= hands.length) states.delete(key)
    }
    if (!gestures.some((g) => g.gripping)) ctrl.release()

    reportedEmpty = gestures.length === 0
    onGestures?.(gestures)
  }

  const setSelectedTopping = (kind: ToppingKind) => {
    selectedTopping = kind
  }

  return { update, reset, setSelectedTopping }
}
