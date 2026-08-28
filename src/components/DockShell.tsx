import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { PanelSplit } from '@/components/PanelSplit'
import { useDock } from '@/components/DockProvider'
import { DockZone } from '@/components/DockZone'
import {
  canMovePanel,
  DEFAULT_DOCK_LAYOUT,
  PANEL_LABELS,
  type DockZoneId,
  type PanelId,
} from '@/lib/dock-layout'
import { cn } from '@/lib/utils'

interface DockShellProps {
  renderPanel: (
    panelId: PanelId,
    opts: { chromeless: boolean; zone: DockZoneId },
  ) => ReactNode
}

const ZONE_LABELS: Record<DockZoneId, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
  bottom: 'Bottom',
}

// MARK: - Drop HUD

function DockDropHud({ panelId }: { panelId: PanelId }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-10 z-50 flex justify-center">
      <div className="rounded border border-[var(--accent)] bg-[var(--bg-panel)]/95 px-3 py-2 text-[11px] text-[var(--text)] shadow-lg backdrop-blur-sm">
        Moving{' '}
        <span className="font-semibold text-[var(--accent)]">
          {PANEL_LABELS[panelId]}
        </span>
        — drop on a highlighted zone
      </div>
    </div>
  )
}

// MARK: - Edge drop overlay

function DockDropOverlay({ panelId }: { panelId: PanelId }) {
  const { dropTarget, setDropTarget, setDropInsertIndex } = useDock()

  const targets: Array<{
    zone: DockZoneId
    className: string
    label: string
  }> = [
    {
      zone: 'left',
      className: 'left-0 top-10 bottom-0 w-[22%] max-w-72',
      label: ZONE_LABELS.left,
    },
    {
      zone: 'right',
      className: 'right-0 top-10 bottom-0 w-[22%] max-w-80',
      label: ZONE_LABELS.right,
    },
    {
      zone: 'bottom',
      className: 'bottom-0 left-[18%] right-[18%] h-[28%] max-h-64',
      label: ZONE_LABELS.bottom,
    },
  ]

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {targets.map(({ zone, className, label }) => {
        if (!canMovePanel(panelId, zone)) return null
        const active = dropTarget === zone
        return (
          <div
            key={zone}
            data-testid={`dock-drop-${zone}`}
            className={cn(
              'pointer-events-auto absolute flex items-center justify-center border-2 border-dashed transition-colors',
              className,
              active
                ? 'border-[var(--accent)] bg-[var(--accent)]/15'
                : 'border-[var(--border)] bg-[var(--bg-panel)]/40 hover:border-[var(--accent)]/70 hover:bg-[var(--accent)]/10',
            )}
            onPointerEnter={() => {
              setDropTarget(zone)
              setDropInsertIndex(undefined)
            }}
          >
            <span
              className={cn(
                'rounded bg-[var(--bg-panel)]/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider shadow-sm',
                active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
              )}
            >
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// MARK: - Drop region

function DockRegion({
  zone,
  active,
  className,
  style,
  children,
}: {
  zone: DockZoneId
  active: boolean
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const { drag, setDropTarget, setDropInsertIndex } = useDock()

  return (
    <div
      data-dock-zone={zone}
      style={style}
      className={cn(
        className,
        drag && active && 'ring-2 ring-inset ring-[var(--accent)]',
      )}
      onPointerEnter={() => {
        if (drag) {
          setDropTarget(zone)
          setDropInsertIndex(undefined)
        }
      }}
    >
      {children}
    </div>
  )
}

// MARK: - Shell layout

export function DockShell({ renderPanel }: DockShellProps) {
  const {
    layout,
    drag,
    dropTarget,
    dropInsertIndex,
    updateLayout,
    dropOnZone,
    endDrag,
    setDropTarget,
  } = useDock()
  const showBottom = layout.zones.bottom.length > 0

  useEffect(() => {
    if (!drag) {
      setDropTarget(null)
      return
    }
    const onUp = () => {
      if (dropTarget) dropOnZone(dropTarget, dropInsertIndex)
      else endDrag()
      setDropTarget(null)
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [
    drag,
    dropTarget,
    dropInsertIndex,
    dropOnZone,
    endDrag,
    setDropTarget,
  ])

  return (
    <>
      <div className="flex min-h-0 flex-1">
        {/* MARK: Left column */}
        {layout.zones.left.length > 0 && (
          <>
            <DockRegion
              zone="left"
              active={dropTarget === 'left'}
              className="flex min-h-0 shrink-0 flex-col"
              style={{ width: layout.leftWidth }}
            >
              <DockZone
                zone="left"
                panels={layout.zones.left}
                active={layout.active.left}
                layout="stack"
                className="h-full"
                renderPanel={renderPanel}
              />
            </DockRegion>
            <PanelSplit
              orientation="horizontal"
              onDrag={(delta) =>
                updateLayout((prev) => ({
                  leftWidth: prev.leftWidth + delta,
                }))
              }
              onReset={() =>
                updateLayout({ leftWidth: DEFAULT_DOCK_LAYOUT.leftWidth })
              }
            />
          </>
        )}

        {/* MARK: Center + bottom */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DockRegion
            zone="center"
            active={dropTarget === 'center'}
            className="min-h-0 flex-1"
          >
            <DockZone
              zone="center"
              panels={layout.zones.center}
              active={layout.active.center}
              className="h-full"
              renderPanel={renderPanel}
            />
          </DockRegion>

          {showBottom && (
            <>
              <PanelSplit
                orientation="vertical"
                onDrag={(delta) =>
                  updateLayout((prev) => ({
                    bottomHeight: prev.bottomHeight - delta,
                  }))
                }
                onReset={() =>
                  updateLayout({
                    bottomHeight: DEFAULT_DOCK_LAYOUT.bottomHeight,
                  })
                }
              />
              <DockRegion
                zone="bottom"
                active={dropTarget === 'bottom'}
                className="flex min-h-0 shrink-0 flex-col"
                style={{ height: layout.bottomHeight }}
              >
                <DockZone
                  zone="bottom"
                  panels={layout.zones.bottom}
                  active={layout.active.bottom}
                  className="h-full"
                  renderPanel={renderPanel}
                />
              </DockRegion>
            </>
          )}
        </div>

        {/* MARK: Right column */}
        {layout.zones.right.length > 0 && (
          <>
            <PanelSplit
              orientation="horizontal"
              onDrag={(delta) =>
                updateLayout((prev) => ({
                  rightWidth: prev.rightWidth - delta,
                }))
              }
              onReset={() =>
                updateLayout({ rightWidth: DEFAULT_DOCK_LAYOUT.rightWidth })
              }
            />
            <DockRegion
              zone="right"
              active={dropTarget === 'right'}
              className="flex min-h-0 shrink-0 flex-col"
              style={{ width: layout.rightWidth }}
            >
              <DockZone
                zone="right"
                panels={layout.zones.right}
                active={layout.active.right}
                layout="stack"
                className="h-full"
                renderPanel={renderPanel}
              />
            </DockRegion>
          </>
        )}
      </div>
      {drag && (
        <>
          <DockDropOverlay panelId={drag.panelId} />
          <DockDropHud panelId={drag.panelId} />
        </>
      )}
    </>
  )
}
