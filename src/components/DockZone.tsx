import {
  Fragment,
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  DOCK_DRAG_THRESHOLD_PX,
  equalZoneSplits,
  PANEL_LABELS,
  resizeZoneSplit,
  type DockZoneId,
  type PanelId,
  type SplitDockZoneId,
} from '@/lib/dock-layout'
import { cn } from '@/lib/utils'
import { useDock } from '@/components/DockProvider'
import { DockPanelClose } from '@/components/DockPanelClose'
import { PanelSplit } from '@/components/PanelSplit'

interface DockZoneProps {
  zone: DockZoneId
  panels: PanelId[]
  active: PanelId
  className?: string
  layout?: 'stack' | 'tabs'
  renderPanel: (
    panelId: PanelId,
    opts: { chromeless: boolean; zone: DockZoneId },
  ) => ReactNode
}

// MARK: - Tab

function DockTab({
  panelId,
  zone,
  selected,
  index,
}: {
  panelId: PanelId
  zone: DockZoneId
  selected: boolean
  index: number
}) {
  const {
    drag,
    startDrag,
    setActive,
    setDropTarget,
    setDropInsertIndex,
    dropTarget,
    dropInsertIndex,
  } = useDock()
  const dragStart = useRef<{ x: number; y: number; panelId: PanelId } | null>(
    null,
  )

  const onTabPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      dragStart.current = { x: e.clientX, y: e.clientY, panelId }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [panelId],
  )

  const onTabPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const start = dragStart.current
      if (!start) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.hypot(dx, dy) < DOCK_DRAG_THRESHOLD_PX) return
      startDrag(start.panelId, zone)
      dragStart.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* released */
      }
    },
    [startDrag, zone],
  )

  const clearTabDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const start = dragStart.current
      dragStart.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* released */
      }
      if (start && !drag) setActive(zone, start.panelId)
    },
    [drag, setActive, zone],
  )

  const isDropBefore =
    drag != null &&
    dropTarget === zone &&
    dropInsertIndex === index &&
    drag.panelId !== panelId

  return (
    <div
      role="tab"
      tabIndex={0}
      aria-selected={selected}
      data-testid={`dock-tab-${panelId}`}
      className={cn(
        'dock-tab relative flex h-full max-w-[8rem] cursor-grab items-center gap-0.5 border-b-2 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] active:cursor-grabbing',
        selected
          ? 'border-b-[var(--accent)] text-[var(--text)]'
          : 'border-b-transparent text-[var(--text-muted)] hover:bg-[var(--bg-panel-raised)] hover:text-[var(--text)]',
        drag?.panelId === panelId && 'opacity-50',
        isDropBefore &&
          'before:absolute before:-left-0.5 before:top-1 before:bottom-1 before:w-0.5 before:rounded-full before:bg-[var(--accent)]',
      )}
      onPointerDown={onTabPointerDown}
      onPointerMove={onTabPointerMove}
      onPointerUp={clearTabDrag}
      onPointerCancel={clearTabDrag}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setActive(zone, panelId)
        }
      }}
      onPointerEnter={() => {
        if (drag) {
          setDropTarget(zone)
          setDropInsertIndex(index)
        }
      }}
    >
      <span className="min-w-0 truncate">{PANEL_LABELS[panelId]}</span>
      <DockPanelClose panelId={panelId} className="h-4 w-4" />
    </div>
  )
}

// MARK: - Stacked L/R panels

function StackedDockPanels({
  zone,
  panels,
  renderPanel,
}: {
  zone: SplitDockZoneId
  panels: PanelId[]
  renderPanel: DockZoneProps['renderPanel']
}) {
  const {
    layout,
    drag,
    dropTarget,
    dropInsertIndex,
    updateLayout,
    setDropTarget,
    setDropInsertIndex,
  } = useDock()
  const stackRef = useRef<HTMLDivElement>(null)
  const weights = layout.splits[zone]

  return (
    <div ref={stackRef} className="flex h-full min-h-0 flex-col">
      {panels.map((panelId, index) => {
        const dropping =
          drag != null &&
          dropTarget === zone &&
          dropInsertIndex === index &&
          drag.panelId !== panelId
        return (
          <Fragment key={panelId}>
            {index > 0 && (
              <PanelSplit
                orientation="vertical"
                onDrag={(delta) => {
                  const height = stackRef.current?.clientHeight ?? 0
                  updateLayout((prev) =>
                    resizeZoneSplit(prev, zone, index - 1, delta, height),
                  )
                }}
                onReset={() =>
                  updateLayout((prev) => ({
                    splits: {
                      ...prev.splits,
                      [zone]: equalZoneSplits(prev.zones[zone].length),
                    },
                  }))
                }
              />
            )}
            <div
              className={cn(
                'flex min-h-0 min-w-0 flex-col overflow-hidden',
                dropping && 'ring-2 ring-inset ring-[var(--accent)]',
              )}
              style={{ flex: `${weights[index] ?? 1} 1 80px` }}
              onPointerEnter={() => {
                if (drag) {
                  setDropTarget(zone)
                  setDropInsertIndex(index)
                }
              }}
            >
              {renderPanel(panelId, { chromeless: false, zone })}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

// MARK: - Zone

export function DockZone({
  zone,
  panels,
  active,
  className,
  layout = 'tabs',
  renderPanel,
}: DockZoneProps) {
  const { drag, setDropTarget, setDropInsertIndex } = useDock()
  const tabbed = layout === 'tabs' && panels.length > 1

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col bg-[var(--bg-panel)]', className)}>
      {tabbed && (
        <div
          className="flex h-8 shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-panel)] px-2"
          role="tablist"
        >
          {panels.map((panelId, index) => (
            <DockTab
              key={panelId}
              panelId={panelId}
              zone={zone}
              selected={panelId === active}
              index={index}
            />
          ))}
          {drag && (
            <div
              className="min-h-6 min-w-6 flex-1"
              onPointerEnter={() => {
                setDropTarget(zone)
                setDropInsertIndex(panels.length)
              }}
            />
          )}
        </div>
      )}

      <div className="relative min-h-0 min-w-0 flex-1">
        {panels.length === 0 ? (
          <div className="flex h-full min-h-[4rem] items-center justify-center m-2 rounded border border-dashed border-[var(--border)] text-[10px] text-[var(--text-muted)]">
            Drop panel here
          </div>
        ) : layout === 'stack' ? (
          <StackedDockPanels
            zone={zone as SplitDockZoneId}
            panels={panels}
            renderPanel={renderPanel}
          />
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            {panels.map((panelId) => (
              <div
                key={panelId}
                className={cn(
                  'min-h-0 min-w-0',
                  panelId === active ? 'flex min-h-0 flex-1 flex-col' : 'hidden',
                )}
              >
                {renderPanel(panelId, { chromeless: tabbed, zone })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
