import { useRef } from 'react'
import type { SlimeController } from '../slime/controller'
import { isToppingTool, type Tool } from '../slime/tools'
import type { Vec2 } from '../slime/verletBlob'

const GRAB_RADIUS = 92

type HostPointerEvent = React.PointerEvent<HTMLElement>

function toLocal(e: HostPointerEvent): Vec2 {
  const rect = e.currentTarget.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

/**
 * Mouse/touch control of the slime: drag to grab and stretch it with the
 * squish tool, click to stick the selected topping with a topping tool.
 * Returns handlers to spread onto the element hosting the slime canvas.
 */
export function useSlimePointer(
  controller: React.RefObject<SlimeController | null>,
  tool: Tool,
  onToppingRejected?: () => void,
) {
  const dragging = useRef(false)
  const last = useRef<Vec2>({ x: 0, y: 0 })

  const onPointerDown = (e: HostPointerEvent) => {
    if (e.button !== 0) return
    const p = toLocal(e)
    if (isToppingTool(tool)) {
      const added = controller.current?.addTopping(tool, p)
      if (added === false) onToppingRejected?.()
      return
    }
    dragging.current = true
    last.current = p
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: HostPointerEvent) => {
    const p = toLocal(e)
    if (isToppingTool(tool)) {
      // Touch has no hover, so a preview would just stick where the finger
      // lifted.
      if (e.pointerType === 'mouse') controller.current?.setHeldTopping(tool, p)
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
    controller.current?.setHeldTopping(null, null)
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onPointerLeave,
  }
}
