import { useDock } from '@/components/DockProvider'
import { HIDEABLE_PANELS, PANEL_LABELS, type PanelId } from '@/lib/dock-layout'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

interface DockPanelCloseProps {
  panelId: PanelId
  className?: string
}

export function DockPanelClose({ panelId, className }: DockPanelCloseProps) {
  const { hidePanelById } = useDock()

  if (!HIDEABLE_PANELS.has(panelId)) return null

  return (
    <button
      type="button"
      aria-label={`Close ${PANEL_LABELS[panelId]}`}
      data-testid={`dock-close-${panelId}`}
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-panel-raised)] hover:text-[var(--text)]',
        className,
      )}
      onClick={() => hidePanelById(panelId)}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <X className="h-3 w-3" />
    </button>
  )
}
