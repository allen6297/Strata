import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useDock } from '@/components/DockProvider'
import {
  DOCK_DRAG_THRESHOLD_PX,
  IMMOBILE_PANELS,
  type DockZoneId,
  type PanelId,
} from '@/lib/dock-layout'

export function useDockPanelDrag(panelId: PanelId, zone: DockZoneId) {
  const { drag, startDrag } = useDock()
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const disabled = IMMOBILE_PANELS.has(panelId)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (disabled || e.button !== 0) return
      dragStart.current = { x: e.clientX, y: e.clientY }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [disabled],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const start = dragStart.current
      if (!start || disabled) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.hypot(dx, dy) < DOCK_DRAG_THRESHOLD_PX) return
      startDrag(panelId, zone)
      dragStart.current = null
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        /* released */
      }
    },
    [disabled, panelId, startDrag, zone],
  )

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    dragStart.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* released */
    }
  }, [])

  return {
    disabled,
    isDragging: drag?.panelId === panelId,
    handlers: disabled
      ? {}
      : {
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel: onPointerUp,
        },
  }
}
