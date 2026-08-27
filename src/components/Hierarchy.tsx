import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Entity } from '@/types/scene'
import { Camera, Circle, Eye, EyeOff, Lock, Square, Unlock } from 'lucide-react'

interface HierarchyProps {
  entities: Entity[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onToggleLocked: (id: string) => void
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
  selectedId,
  onSelect,
  onToggleVisible,
  onToggleLocked,
}: HierarchyProps) {
  const roots = entities.filter((e) => !e.parentId)

  return (
    <aside className="panel-animate flex h-full min-h-0 w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]">
      <div className="flex h-8 items-center border-b border-[var(--border)] px-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Hierarchy
        </h2>
        <span className="ml-auto font-mono text-[10px] text-[var(--text-muted)]">
          {entities.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {roots.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-[var(--text-muted)]">
            No entities yet. Add a sprite from the toolbar.
          </p>
        ) : (
          roots.map((entity) => {
            const Icon = kindIcon(entity.kind)
            const selected = entity.id === selectedId
            return (
              <div
                key={entity.id}
                role="button"
                tabIndex={0}
                data-testid={`hierarchy-${entity.id}`}
                className={cn(
                  'group flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1.5 text-xs transition-colors',
                  selected
                    ? 'bg-[var(--select)] text-[var(--text)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-panel-raised)] hover:text-[var(--text)]',
                )}
                onClick={() => onSelect(entity.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelect(entity.id)
                }}
              >
                <Icon className="h-3 w-3 shrink-0 opacity-70" />
                <span className="min-w-0 flex-1 truncate">{entity.name}</span>
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
    </aside>
  )
}
