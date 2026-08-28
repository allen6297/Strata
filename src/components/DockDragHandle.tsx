import { useDockPanelDrag } from '@/hooks/useDockPanelDrag'
import { cn } from '@/lib/utils'
import type { DockZoneId, PanelId } from '@/lib/dock-layout'
import { GripVertical } from 'lucide-react'

// MARK: - Panel drag handle

interface DockDragHandleProps {
  panelId: PanelId
  zone: DockZoneId
  className?: string
}

export function DockDragHandle({ panelId, zone, className }: DockDragHandleProps) {
  const { disabled, isDragging, handlers } = useDockPanelDrag(panelId, zone)

  if (disabled) return null

  return (
    <button
      type="button"
      aria-label={`Drag ${panelId} panel`}
      title="Drag to dock"
      data-testid={`dock-drag-${panelId}`}
      className={cn(
        'flex shrink-0 cursor-grab items-center justify-center rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-panel-raised)] hover:text-[var(--text)] active:cursor-grabbing',
        isDragging && 'opacity-50',
        className,
      )}
      {...handlers}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  )
}
