import { Button } from '@/components/ui/button'
import { DockDragHandle } from '@/components/DockDragHandle'
import { DockPanelClose } from '@/components/DockPanelClose'
import { entityMap, flattenHierarchy } from '@/lib/transforms'
import { isPrefabInstanceRoot, prefabRootCount } from '@/lib/prefab'
import { nodeKindIcon } from '@/lib/node-kind-icon'
import type { DockZoneId } from '@/lib/dock-layout'
import { cn } from '@/lib/utils'
import type { Entity } from '@/types/scene'
import {
  Boxes,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  Plus,
  Unlock,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

interface HierarchyProps {
  entities: Entity[]
  selectedIds: string[]
  onSelect: (id: string, opts?: { additive?: boolean; range?: boolean }) => void
  onToggleVisible: (id: string) => void
  onToggleLocked: (id: string) => void
  onReparent: (childId: string, parentId: string | null) => void
  onOpenMenu: (menu: {
    x: number
    y: number
    entityId: string | null
  }) => void
  onAddNode?: (anchor: HTMLElement) => void
  prefabs?: Entity[]
  selectedPrefabId?: string | null
  onSelectPrefab?: (id: string | null) => void
  onTogglePrefabVisible?: (id: string) => void
  onTogglePrefabLocked?: (id: string) => void
  chromeless?: boolean
  dockZone?: DockZoneId
}

function parentIdsWithChildren(list: Entity[]): Set<string> {
  const ids = new Set<string>()
  for (const e of list) {
    if (e.parentId) ids.add(e.parentId)
  }
  return ids
}

/** DFS flatten lists parents before children, so a collapsed parent hides the rest of its branch. */
function visibleRows(
  rows: Array<{ entity: Entity; depth: number }>,
  collapsed: Set<string>,
): Array<{ entity: Entity; depth: number }> {
  const hidden = new Set<string>()
  return rows.filter(({ entity }) => {
    if (
      entity.parentId &&
      (collapsed.has(entity.parentId) || hidden.has(entity.parentId))
    ) {
      hidden.add(entity.id)
      return false
    }
    return true
  })
}

function ExpandToggle({
  hasChildren,
  expanded,
  testId,
  onToggle,
}: {
  hasChildren: boolean
  expanded: boolean
  testId: string
  onToggle: () => void
}) {
  if (!hasChildren) {
    return <span className="w-3 shrink-0" />
  }
  return (
    <button
      type="button"
      data-testid={testId}
      title={expanded ? 'Collapse' : 'Expand'}
      className="flex h-4 w-3 shrink-0 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)]"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
    >
      <ChevronRight
        className={cn(
          'h-3 w-3 transition-transform',
          expanded && 'rotate-90',
        )}
      />
    </button>
  )
}

export function Hierarchy({
  entities,
  selectedIds,
  onSelect,
  onToggleVisible,
  onToggleLocked,
  onReparent,
  onOpenMenu,
  onAddNode,
  prefabs = [],
  selectedPrefabId = null,
  onSelectPrefab,
  onTogglePrefabVisible,
  onTogglePrefabLocked,
  chromeless = false,
  dockZone,
}: HierarchyProps) {
  const rows = flattenHierarchy(entities)
  const prefabRows = flattenHierarchy(prefabs)
  const primary = selectedIds[selectedIds.length - 1] ?? null
  const rootCount = prefabRootCount(prefabs)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [collapsedPrefabs, setCollapsedPrefabs] = useState<Set<string>>(
    () => new Set(),
  )
  const prevSelected = useRef<string[]>([])
  const hasKids = useMemo(() => parentIdsWithChildren(entities), [entities])
  const prefabHasKids = useMemo(() => parentIdsWithChildren(prefabs), [prefabs])
  const shown = useMemo(
    () => visibleRows(rows, collapsed),
    [rows, collapsed],
  )
  const shownPrefabs = useMemo(
    () => visibleRows(prefabRows, collapsedPrefabs),
    [prefabRows, collapsedPrefabs],
  )

  useEffect(() => {
    const newly = selectedIds.filter((id) => !prevSelected.current.includes(id))
    prevSelected.current = selectedIds
    if (!newly.length) return
    const byId = entityMap(entities)
    setCollapsed((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const id of newly) {
        let p = byId.get(id)?.parentId ?? null
        while (p) {
          if (next.delete(p)) changed = true
          p = byId.get(p)?.parentId ?? null
        }
      }
      return changed ? next : prev
    })
  }, [selectedIds, entities])

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const togglePrefabCollapsed = (id: string) => {
    setCollapsedPrefabs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <aside
      className="panel-animate flex h-full min-h-0 w-full flex-col bg-[var(--bg-panel)]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {!chromeless && (
        <div className="flex h-8 items-center gap-1 border-b border-[var(--border)] px-2">
          {dockZone && (
            <DockDragHandle panelId="hierarchy" zone={dockZone} />
          )}
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Hierarchy
          </h2>
          <span className="ml-auto font-mono text-[10px] text-[var(--text-muted)]">
            {entities.length}
            {selectedIds.length > 1 ? ` · ${selectedIds.length} sel` : ''}
          </span>
          {onAddNode && (
            <Button
              variant="toolbar"
              size="icon"
              title="Add node (Shift+A)"
              data-testid="add-node-hierarchy"
              onClick={(e) => {
                e.stopPropagation()
                onAddNode(e.currentTarget)
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          <DockPanelClose panelId="hierarchy" />
        </div>
      )}
      <div
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1.5"
        onContextMenu={(e) => {
          e.preventDefault()
          onOpenMenu({ x: e.clientX, y: e.clientY, entityId: null })
        }}
      >
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-[var(--text-muted)]">
            No nodes yet. Use + Node or Shift+A.
          </p>
        ) : (
          shown.map(({ entity, depth }) => {
            const Icon = nodeKindIcon(entity.kind)
            const selected = selectedIds.includes(entity.id)
            const hasChildren = hasKids.has(entity.id)
            const expanded = !collapsed.has(entity.id)
            return (
              <div
                key={entity.id}
                role="button"
                tabIndex={0}
                data-testid={`hierarchy-${entity.id}`}
                data-prefab-id={entity.prefabId ?? undefined}
                data-prefab-source={entity.prefabSourceId ?? undefined}
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
                  'group flex min-w-0 cursor-pointer items-center gap-1 overflow-hidden rounded-md py-1.5 pr-1 text-xs transition-colors',
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
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (!selectedIds.includes(entity.id)) {
                    onSelect(entity.id)
                  }
                  onOpenMenu({
                    x: e.clientX,
                    y: e.clientY,
                    entityId: entity.id,
                  })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelect(entity.id)
                    return
                  }
                  if (e.key === 'ArrowRight' && hasChildren && !expanded) {
                    e.preventDefault()
                    toggleCollapsed(entity.id)
                    return
                  }
                  if (e.key === 'ArrowLeft' && hasChildren && expanded) {
                    e.preventDefault()
                    toggleCollapsed(entity.id)
                  }
                }}
              >
                <ExpandToggle
                  hasChildren={hasChildren}
                  expanded={expanded}
                  testId={`hierarchy-toggle-${entity.id}`}
                  onToggle={() => toggleCollapsed(entity.id)}
                />
                <Icon className="h-3 w-3 shrink-0 opacity-70" />
                <span className="min-w-0 flex-1 truncate">{entity.name}</span>
                {isPrefabInstanceRoot(entity) && (
                  <span
                    className="shrink-0 rounded bg-[var(--bg-input)] px-1 font-mono text-[9px] leading-4 text-[var(--accent)] group-hover:hidden"
                    data-testid={`hierarchy-instance-${entity.id}`}
                  >
                    pfb
                  </span>
                )}
                {entity.scriptId && (
                  <span className="shrink-0 rounded bg-[var(--bg-input)] px-1 font-mono text-[9px] leading-4 text-[var(--accent)] group-hover:hidden">
                    .rg
                  </span>
                )}
                <div className="hidden shrink-0 group-hover:flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
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
                    className="h-5 w-5"
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
              </div>
            )
          })
        )}
        {onSelectPrefab ? (
          <div className="mt-2 border-t border-[var(--border)] pt-1.5">
            <div className="flex items-center gap-1 px-1.5 py-1">
              <Boxes className="h-3 w-3 text-[var(--text-muted)]" />
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Prefabs
              </h3>
              <span className="ml-auto font-mono text-[10px] text-[var(--text-muted)]">
                {rootCount}
              </span>
            </div>
            {prefabRows.length === 0 ? (
              <p className="px-2 py-2 text-[10px] text-[var(--text-muted)]">
                Save a node as a prefab from the Inspector, then drag it into
                the viewport.
              </p>
            ) : (
              shownPrefabs.map(({ entity, depth }) => {
                const Icon = nodeKindIcon(entity.kind)
                const selected = selectedPrefabId === entity.id
                const hasChildren = prefabHasKids.has(entity.id)
                const expanded = !collapsedPrefabs.has(entity.id)
                return (
                  <div
                    key={entity.id}
                    role="button"
                    tabIndex={0}
                    data-testid={`hierarchy-prefab-${entity.id}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/strata-prefab', entity.id)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    className={cn(
                      'group flex min-w-0 cursor-grab items-center gap-1 overflow-hidden rounded-md py-1.5 pr-1 text-xs transition-colors',
                      selected
                        ? 'bg-[var(--select)] text-[var(--text)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--bg-panel-raised)] hover:text-[var(--text)]',
                    )}
                    style={{ paddingLeft: 6 + depth * 12 }}
                    onClick={() => onSelectPrefab(entity.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        onSelectPrefab(entity.id)
                        return
                      }
                      if (e.key === 'ArrowRight' && hasChildren && !expanded) {
                        e.preventDefault()
                        togglePrefabCollapsed(entity.id)
                        return
                      }
                      if (e.key === 'ArrowLeft' && hasChildren && expanded) {
                        e.preventDefault()
                        togglePrefabCollapsed(entity.id)
                      }
                    }}
                  >
                    <ExpandToggle
                      hasChildren={hasChildren}
                      expanded={expanded}
                      testId={`hierarchy-prefab-toggle-${entity.id}`}
                      onToggle={() => togglePrefabCollapsed(entity.id)}
                    />
                    <Icon className="h-3 w-3 shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1 truncate">{entity.name}</span>
                    <div className="hidden shrink-0 group-hover:flex">
                      {onTogglePrefabVisible ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={(e) => {
                            e.stopPropagation()
                            onTogglePrefabVisible(entity.id)
                          }}
                          title={entity.visible ? 'Hide' : 'Show'}
                        >
                          {entity.visible ? (
                            <Eye className="h-3 w-3" />
                          ) : (
                            <EyeOff className="h-3 w-3" />
                          )}
                        </Button>
                      ) : null}
                      {onTogglePrefabLocked ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={(e) => {
                            e.stopPropagation()
                            onTogglePrefabLocked(entity.id)
                          }}
                          title={entity.locked ? 'Unlock' : 'Lock'}
                        >
                          {entity.locked ? (
                            <Lock className="h-3 w-3" />
                          ) : (
                            <Unlock className="h-3 w-3" />
                          )}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : null}
      </div>
      {primary && (
        <div className="shrink-0 border-t border-[var(--border)] px-2 py-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-full justify-start"
            data-testid="unparent"
            title="Drag onto another row to parent. ⌘/Ctrl click multi-select."
            onClick={() => onReparent(primary, null)}
            disabled={!entities.find((e) => e.id === primary)?.parentId}
          >
            Unparent selected
          </Button>
        </div>
      )}
    </aside>
  )
}
