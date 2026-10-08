import { useEffect, useEffectEvent } from 'react'

/**
 * Closes a popover/drawer on Escape or on a pointer press outside `ref`
 * (and outside any `ignore` elements, e.g. the button that toggles it, so
 * that button's own click can close it instead of reopening it).
 */
export function useDismiss(
  open: boolean,
  onClose: () => void,
  ref: React.RefObject<HTMLElement | null>,
  ignore: React.RefObject<HTMLElement | null>[] = [],
) {
  const close = useEffectEvent(onClose)
  const isInside = useEffectEvent((target: Node) =>
    [ref, ...ignore].some((r) => r.current?.contains(target)),
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onPointer = (e: PointerEvent) => {
      if (e.target instanceof Node && !isInside(e.target)) close()
    }
    window.addEventListener('keydown', onKey)
    // Capture phase, so a press that the canvas captures still counts.
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [open])
}
