import type { Entity } from '@/types/scene'

export function entityMap(entities: Entity[]) {
  return new Map(entities.map((e) => [e.id, e]))
}

/** Local x/y are relative to parent; world is summed along the chain (no rotation). */
export function getWorldPosition(
  entity: Entity,
  byId: Map<string, Entity>,
): { x: number; y: number } {
  let x = entity.x
  let y = entity.y
  let current: Entity | undefined = entity
  const guard = new Set<string>()
  while (current.parentId) {
    if (guard.has(current.id)) break
    guard.add(current.id)
    const parent = byId.get(current.parentId)
    if (!parent) break
    x += parent.x
    y += parent.y
    current = parent
  }
  return { x, y }
}

export function worldToLocal(
  entity: Entity,
  worldX: number,
  worldY: number,
  byId: Map<string, Entity>,
): { x: number; y: number } {
  if (!entity.parentId) return { x: worldX, y: worldY }
  const parent = byId.get(entity.parentId)
  if (!parent) return { x: worldX, y: worldY }
  const pw = getWorldPosition(parent, byId)
  return { x: worldX - pw.x, y: worldY - pw.y }
}

export function getChildren(entities: Entity[], parentId: string) {
  return entities.filter((e) => e.parentId === parentId)
}

export function wouldCreateCycle(
  entities: Entity[],
  childId: string,
  newParentId: string | null,
): boolean {
  if (!newParentId) return false
  if (childId === newParentId) return true
  const byId = entityMap(entities)
  let cur: string | null = newParentId
  const guard = new Set<string>()
  while (cur) {
    if (cur === childId) return true
    if (guard.has(cur)) return true
    guard.add(cur)
    cur = byId.get(cur)?.parentId ?? null
  }
  return false
}

/** Depth-first list for hierarchy rendering */
export function flattenHierarchy(entities: Entity[]): Array<{
  entity: Entity
  depth: number
}> {
  const roots = entities.filter((e) => !e.parentId)
  const out: Array<{ entity: Entity; depth: number }> = []
  const visit = (e: Entity, depth: number) => {
    out.push({ entity: e, depth })
    for (const child of getChildren(entities, e.id)) visit(child, depth + 1)
  }
  for (const root of roots) visit(root, 0)
  // Orphans (broken parent refs)
  const listed = new Set(out.map((r) => r.entity.id))
  for (const e of entities) {
    if (!listed.has(e.id)) out.push({ entity: e, depth: 0 })
  }
  return out
}

export function collectSubtreeIds(entities: Entity[], rootId: string): string[] {
  const ids = [rootId]
  for (const child of getChildren(entities, rootId)) {
    ids.push(...collectSubtreeIds(entities, child.id))
  }
  return ids
}
