import { useRef } from 'react'
import type { Mode } from '../components/SlimePanel'
import type { ToppingKind } from '../slime/toppings'
import type { SlimeController } from '../slime/useSlime'
import type { Vec2 } from '../slime/verletBlob'

const GRAB_RADIUS = 92

type CanvasPointerEvent = React.PointerEvent<HTMLCanvasElement>

function toLocal(e: CanvasPointerEvent): Vec2 {
  const rect = e.currentTarget.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

/**
 * Mouse/touch control of the slime canvas: drag to grab and stretch it in
 * squish mode, click to stick the selected topping in topping mode. Returns
 * handlers to spread onto the <canvas>.
 */
export function useSlimePointer(
  controller: React.RefObject<SlimeController | null>,
  mode: Mode,
  toppingKind: ToppingKind,
) {
  const dragging = useRef(false)
  const last = useRef<Vec2>({ x: 0, y: 0 })

  const onPointerDown = (e: CanvasPointerEvent) => {
    const p = toLocal(e)
    if (mode === 'topping') {
      controller.current?.addTopping(toppingKind, p)
      return
    }
    dragging.current = true
    last.current = p
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: CanvasPointerEvent) => {
    const p = toLocal(e)
    if (mode === 'topping') {
      controller.current?.setHeldTopping(toppingKind, p)
      return
    }
    if (!dragging.current) return
    controller.current?.grab(
      last.current,
      { x: p.x - last.current.x, y: p.y - last.current.y },
      GRAB_RADIUS,
    )
    last.current = p
  }

  const endDrag = () => {
    dragging.current = false
    controller.current?.release()
  }

  const onPointerLeave = () => {
    endDrag()
    if (mode === 'topping') controller.current?.setHeldTopping(null, null)
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onPointerLeave,
  }
}
