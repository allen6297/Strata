import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/utils'

interface PanelSplitProps {
  orientation: 'horizontal' | 'vertical'
  onDrag: (delta: number) => void
  onReset?: () => void
  className?: string
}

export function PanelSplit({
  orientation,
  onDrag,
  onReset,
  className,
}: PanelSplitProps) {
  const dragging = useRef(false)
  const last = useRef(0)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      dragging.current = true
      last.current =
        orientation === 'horizontal' ? e.clientX : e.clientY
      e.currentTarget.setPointerCapture(e.pointerId)
      document.body.classList.add(
        orientation === 'horizontal' ? 'cursor-col-resize' : 'cursor-row-resize',
      )
      document.body.classList.add('select-none')
    },
    [orientation],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return
      const pos = orientation === 'horizontal' ? e.clientX : e.clientY
      const delta = pos - last.current
      last.current = pos
      if (delta !== 0) onDrag(delta)
    },
    [onDrag, orientation],
  )

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    document.body.classList.remove('cursor-col-resize', 'cursor-row-resize', 'select-none')
  }, [])

  useEffect(() => {
    return () => {
      document.body.classList.remove(
        'cursor-col-resize',
        'cursor-row-resize',
        'select-none',
      )
    }
  }, [])

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      className={cn(
        'group relative shrink-0 bg-[var(--border)] transition-colors hover:bg-[var(--accent-dim)] focus-visible:bg-[var(--accent-dim)] focus-visible:outline-none',
        orientation === 'horizontal'
          ? 'w-px cursor-col-resize'
          : 'h-px cursor-row-resize',
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onReset?.()}
    >
      <div
        className={cn(
          'absolute z-10',
          orientation === 'horizontal'
            ? 'inset-y-0 -left-1 w-2.5'
            : 'inset-x-0 -top-1 h-2.5',
        )}
      />
    </div>
  )
}
