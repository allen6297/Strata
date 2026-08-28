import { Button } from '@/components/ui/button'
import { DockDragHandle } from '@/components/DockDragHandle'
import { DockPanelClose } from '@/components/DockPanelClose'
import { flattenHierarchy } from '@/lib/transforms'
import type { DockZoneId } from '@/lib/dock-layout'
import { cn } from '@/lib/utils'
import type { Entity } from '@/types/scene'
import {
  Camera,
  Circle,
  CornerDownRight,
  Eye,
  EyeOff,
  Lock,
  Square,
  Unlock,
} from 'lucide-react'

interface HierarchyProps {
  entities: Entity[]
  selectedIds: string[]
  onSelect: (id: string, opts?: { additive?: boolean; range?: boolean }) => void
  onToggleVisible: (id: string) => void
  onToggleLocked: (id: string) => void
  onReparent: (childId: string, parentId: string | null) => void
  chromeless?: boolean
  dockZone?: DockZoneId
}

function kindIcon(kind: Entity['kind']) {
  switch (kind) {
    case 'sprite':
      return Square
    case 'camera':
      return Camera
    default:
      return Circle
  }
}

export function Hierarchy({
  entities,
  selectedIds,
  onSelect,
  onToggleVisible,
  onToggleLocked,
  onReparent,
  chromeless = false,
  dockZone,
}: HierarchyProps) {
  const rows = flattenHierarchy(entities)
  const primary = selectedIds[selectedIds.length - 1] ?? null

  return (
    <aside className="panel-animate flex h-full min-h-0 w-full flex-col bg-[var(--bg-panel)]">
      {!chromeless && (
        <div className="flex h-8 items-center gap-1 border-b border-[var(--border)] px-2">
          {dockZone && (
            <DockDragHandle panelId="hierarchy" zone={dockZone} />
          )}
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Hierarchy
          </h2>
          <span className="ml-auto font-mono text-[10px] text-[var(--text-muted)]">
            {entities.length}
            {selectedIds.length > 1 ? ` · ${selectedIds.length} sel` : ''}
          </span>
          <DockPanelClose panelId="hierarchy" />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-[var(--text-muted)]">
            No entities yet. Add a sprite from the toolbar.
          </p>
        ) : (
          rows.map(({ entity, depth }) => {
            const Icon = kindIcon(entity.kind)
            const selected = selectedIds.includes(entity.id)
            return (
              <div
                key={entity.id}
                role="button"
                tabIndex={0}
                data-testid={`hierarchy-${entity.id}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/strata-entity', entity.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const childId = e.dataTransfer.getData('text/strata-entity')
                  if (childId && childId !== entity.id) {
                    onReparent(childId, entity.id)
                  }
                }}
                className={cn(
                  'group flex cursor-pointer items-center gap-1 rounded-md py-1.5 pr-1.5 text-xs transition-colors',
                  selected
                    ? 'bg-[var(--select)] text-[var(--text)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-panel-raised)] hover:text-[var(--text)]',
                )}
                style={{ paddingLeft: 6 + depth * 12 }}
                onClick={(e) =>
                  onSelect(entity.id, {
                    additive: e.metaKey || e.ctrlKey,
                    range: e.shiftKey,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelect(entity.id)
                  }
                }}
              >
                {depth > 0 ? (
                  <CornerDownRight className="h-3 w-3 shrink-0 opacity-40" />
                ) : (
                  <span className="w-3" />
                )}
                <Icon className="h-3 w-3 shrink-0 opacity-70" />
                <span className="min-w-0 flex-1 truncate">{entity.name}</span>
                {entity.scriptId && (
                  <span className="rounded bg-[var(--bg-input)] px-1 font-mono text-[9px] text-[var(--accent)]">
                    .rg
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleVisible(entity.id)
                  }}
                  title={entity.visible ? 'Hide' : 'Show'}
                >
                  {entity.visible ? (
                    <Eye className="h-3 w-3" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleLocked(entity.id)
                  }}
                  title={entity.locked ? 'Unlock' : 'Lock'}
                >
                  {entity.locked ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <Unlock className="h-3 w-3" />
                  )}
                </Button>
              </div>
            )
          })
        )}
      </div>
      {primary && (
        <div className="border-t border-[var(--border)] p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            data-testid="unparent"
            onClick={() => onReparent(primary, null)}
            disabled={!entities.find((e) => e.id === primary)?.parentId}
          >
            Unparent selected
          </Button>
          <p className="mt-1 px-1 text-[10px] text-[var(--text-muted)]">
            Drag onto another row to parent. ⌘/Ctrl click multi-select.
          </p>
        </div>
      )}
    </aside>
  )
}
