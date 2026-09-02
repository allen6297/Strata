import { collectSubtreeIds, entityMap } from '@/lib/transforms'
import { uid } from '@/lib/utils'
import type { AssetItem, Entity, ScriptConnection } from '@/types/scene'

const LINK_KEYS = new Set(['prefabId', 'prefabSourceId', 'prefabOverrides'])

/** Instance-root fields that stay where you dropped / renamed the copy. */
const ROOT_LOCAL_KEYS = new Set([
  'id',
  'parentId',
  'x',
  'y',
  'z',
  'rotation',
  'rotationX',
  'rotationY',
  'rotationZ',
  'scaleX',
  'scaleY',
  'scaleZ',
  'name',
  'locked',
  'prefabId',
  'prefabSourceId',
  'prefabOverrides',
])

export function prefabRoots(catalog: Entity[]): Entity[] {
  return catalog.filter((e) => !e.parentId)
}

export function findPrefabRoot(
  catalog: Entity[],
  name: string,
): Entity | undefined {
  const lower = name.toLowerCase()
  return (
    catalog.find((p) => !p.parentId && p.name.toLowerCase() === lower) ??
    catalog.find((p) => p.name.toLowerCase() === lower)
  )
}

export function isPrefabInstanceRoot(entity: Entity): boolean {
  return Boolean(
    entity.prefabId &&
      entity.prefabSourceId &&
      entity.prefabId === entity.prefabSourceId,
  )
}

export function instanceRootOf(
  entities: Entity[],
  id: string,
): Entity | undefined {
  const byId = entityMap(entities)
  let cur = byId.get(id)
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    if (isPrefabInstanceRoot(cur)) return cur
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return undefined
}

function withScriptPath(entity: Entity, scripts: AssetItem[]): Entity {
  if (entity.scriptPath) return entity
  const s = scripts.find((s) => s.id === entity.scriptId)
  return s?.name ? { ...entity, scriptPath: s.name } : entity
}

function siblingIndex(entities: Entity[], entity: Entity): number {
  return Math.max(
    0,
    entities
      .filter((e) => e.parentId === entity.parentId && e.name === entity.name)
      .findIndex((e) => e.id === entity.id),
  )
}

/** `RootName/Child#0` path used to keep catalog child ids stable across re-saves. */
function catalogPath(entities: Entity[], rootId: string, nodeId: string): string {
  const byId = entityMap(entities)
  const parts: string[] = []
  let cur = byId.get(nodeId)
  const guard = new Set<string>()
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id)
    if (cur.id === rootId) {
      parts.push(cur.name)
      break
    }
    parts.push(`${cur.name}#${siblingIndex(entities, cur)}`)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return parts.reverse().join('/')
}

function remapConnections(
  connections: ScriptConnection[],
  idMap: Map<string, string>,
): ScriptConnection[] {
  return connections.map((c) => ({
    ...c,
    to: idMap.get(c.to) ?? c.to,
  }))
}

function stripPrefabLink(entity: Entity): Entity {
  return {
    ...entity,
    prefabId: null,
    prefabSourceId: null,
    prefabOverrides: [],
  }
}

/** Snapshot a scene subtree into the catalog (new ids, root unparented). */
export function capturePrefab(
  entities: Entity[],
  rootId: string,
  scripts: AssetItem[] = [],
): Entity[] {
  const ids = collectSubtreeIds(entities, rootId)
  const byId = new Map(entities.map((e) => [e.id, e]))
  const idMap = new Map(ids.map((id) => [id, uid('pfb')]))
  return ids.flatMap((id) => {
    const e = byId.get(id)
    if (!e) return []
    const isRoot = id === rootId
    const newId = idMap.get(id)
    if (!newId) return []
    return [
      withScriptPath(
        stripPrefabLink({
          ...e,
          id: newId,
          parentId: isRoot ? null : (idMap.get(e.parentId ?? '') ?? null),
          connections: remapConnections(e.connections ?? [], idMap),
        }),
        scripts,
      ),
    ]
  })
}

/** Replace a named prefab forest, or append. Keeps the previous root id when the name matches. */
export function upsertPrefab(catalog: Entity[], captured: Entity[]): Entity[] {
  const newRoot = captured.find((e) => !e.parentId)
  if (!newRoot) return catalog
  const oldRoot = findPrefabRoot(catalog, newRoot.name)
  if (!oldRoot) return [...catalog, ...captured]
  const remove = new Set(collectSubtreeIds(catalog, oldRoot.id))
  const oldByPath = new Map<string, string>()
  for (const id of remove) {
    oldByPath.set(catalogPath(catalog, oldRoot.id, id), id)
  }
  const idMap = new Map<string, string>()
  for (const e of captured) {
    const path = catalogPath(captured, newRoot.id, e.id)
    const reused = !e.parentId ? oldRoot.id : oldByPath.get(path)
    idMap.set(e.id, reused ?? e.id)
  }
  const remapped = captured.map((e) => {
    const isRoot = !e.parentId
    const id = idMap.get(e.id) ?? e.id
    const parentId = isRoot
      ? null
      : e.parentId
        ? (idMap.get(e.parentId) ?? e.parentId)
        : null
    return {
      ...e,
      id,
      parentId,
      connections: remapConnections(e.connections ?? [], idMap),
    }
  })
  return [...catalog.filter((e) => !remove.has(e.id)), ...remapped]
}

/** Copy a catalog subtree into the scene. Root is placed at world x/y. */
export function instantiatePrefab(
  catalog: Entity[],
  rootId: string,
  worldX: number,
  worldY: number,
): Entity[] {
  const ids = collectSubtreeIds(catalog, rootId)
  if (!ids.length) return []
  const byId = new Map(catalog.map((e) => [e.id, e]))
  const idMap = new Map(ids.map((id) => [id, uid('ent')]))
  return ids.flatMap((id) => {
    const e = byId.get(id)
    if (!e) return []
    const isRoot = id === rootId
    const newId = idMap.get(id)
    if (!newId) return []
    return [
      {
        ...e,
        id: newId,
        parentId: isRoot ? null : (idMap.get(e.parentId ?? '') ?? null),
        locked: false,
        x: isRoot ? worldX : e.x,
        y: isRoot ? worldY : e.y,
        tiles: (e.tiles ?? []).map((t) => ({ ...t })),
        scriptProps: { ...(e.scriptProps ?? {}) },
        connections: remapConnections(e.connections ?? [], idMap),
        prefabId: rootId,
        prefabSourceId: id,
        prefabOverrides: [],
      },
    ]
  })
}

export function overrideablePrefabKeys(
  entity: Entity,
  keys: string[],
): string[] {
  if (!entity.prefabSourceId) return []
  const isRoot = isPrefabInstanceRoot(entity)
  return keys.filter((key) => {
    if (LINK_KEYS.has(key) || key === 'id' || key === 'parentId') return false
    if (isRoot && ROOT_LOCAL_KEYS.has(key)) return false
    return true
  })
}

/** Stamp Inspector/move keys so a later catalog sync keeps this instance's values. */
export function withPrefabOverrides(entity: Entity, keys: string[]): Entity {
  const extra = overrideablePrefabKeys(entity, keys)
  if (!extra.length) return entity
  const seen = new Set(entity.prefabOverrides ?? [])
  const prefabOverrides = [...(entity.prefabOverrides ?? [])]
  for (const key of extra) {
    if (seen.has(key)) continue
    seen.add(key)
    prefabOverrides.push(key)
  }
  return { ...entity, prefabOverrides }
}

function mergeTemplate(
  instance: Entity | undefined,
  tmpl: Entity,
  catalogRootId: string,
  isRoot: boolean,
  instanceId: string,
  parentId: string | null,
  catalogToInstance: Map<string, string>,
): Entity {
  const overrides = new Set(instance?.prefabOverrides ?? [])
  const next: Entity = {
    ...tmpl,
    id: instanceId,
    parentId,
    locked: instance?.locked ?? false,
    tiles: overrides.has('tiles') && instance
      ? instance.tiles
      : (tmpl.tiles ?? []).map((t) => ({ ...t })),
    scriptProps: overrides.has('scriptProps') && instance
      ? instance.scriptProps
      : { ...(tmpl.scriptProps ?? {}) },
    prefabId: catalogRootId,
    prefabSourceId: tmpl.id,
    prefabOverrides: [...(instance?.prefabOverrides ?? [])],
    connections: overrides.has('connections') && instance
      ? instance.connections
      : remapConnections(tmpl.connections ?? [], catalogToInstance),
  }
  if (isRoot && instance) {
    next.x = instance.x
    next.y = instance.y
    next.z = instance.z
    next.rotation = instance.rotation
    next.rotationX = instance.rotationX
    next.rotationY = instance.rotationY
    next.rotationZ = instance.rotationZ
    next.scaleX = instance.scaleX
    next.scaleY = instance.scaleY
    next.scaleZ = instance.scaleZ
    next.name = instance.name
  }
  if (instance) {
    for (const key of overrides) {
      if (key === 'id' || key === 'parentId' || LINK_KEYS.has(key)) continue
      if (key === 'connections') continue
      if (isRoot && ROOT_LOCAL_KEYS.has(key)) continue
      if (key in instance) {
        ;(next as unknown as Record<string, unknown>)[key] = instance[
          key as keyof Entity
        ]
      }
    }
  }
  return next
}

function syncOneInstance(
  entities: Entity[],
  catalog: Entity[],
  instanceRootId: string,
): Entity[] {
  const root = entities.find((e) => e.id === instanceRootId)
  if (!root?.prefabId || root.prefabSourceId !== root.prefabId) return entities
  const catalogIds = collectSubtreeIds(catalog, root.prefabId)
  if (!catalogIds.length) return entities
  const catalogById = entityMap(catalog)
  const instanceIds = new Set(collectSubtreeIds(entities, instanceRootId))
  const linked = entities.filter(
    (e) =>
      instanceIds.has(e.id) &&
      e.prefabSourceId &&
      e.prefabId === root.prefabId,
  )
  const bySource = new Map(
    linked.flatMap((e) =>
      e.prefabSourceId ? [[e.prefabSourceId, e] as const] : [],
    ),
  )

  const catalogToInstance = new Map<string, string>()
  for (const sourceId of catalogIds) {
    const existing = bySource.get(sourceId)
    catalogToInstance.set(sourceId, existing?.id ?? uid('ent'))
  }

  const produced: Entity[] = []
  const producedIds = new Set<string>()
  for (const sourceId of catalogIds) {
    const tmpl = catalogById.get(sourceId)
    if (!tmpl) continue
    const isRoot = sourceId === root.prefabId
    const instanceId = catalogToInstance.get(sourceId)
    if (!instanceId) continue
    const parentId = isRoot
      ? root.parentId
      : tmpl.parentId
        ? (catalogToInstance.get(tmpl.parentId) ?? root.id)
        : root.parentId
    produced.push(
      mergeTemplate(
        isRoot ? root : bySource.get(sourceId),
        tmpl,
        root.prefabId,
        isRoot,
        instanceId,
        parentId,
        catalogToInstance,
      ),
    )
    producedIds.add(instanceId)
  }

  const extras = entities.filter((e) => {
    if (!instanceIds.has(e.id) || producedIds.has(e.id)) return false
    if (e.prefabSourceId && e.prefabId === root.prefabId) return false
    return true
  })
  const keptIds = new Set([...producedIds, ...extras.map((e) => e.id)])
  const extrasFixed = extras.map((e) =>
    e.parentId && !keptIds.has(e.parentId) ? { ...e, parentId: root.id } : e,
  )

  const insertAt = entities.findIndex((e) => e.id === instanceRootId)
  const without = entities.filter((e) => !instanceIds.has(e.id))
  const at = insertAt < 0 ? without.length : Math.min(insertAt, without.length)
  without.splice(at, 0, ...produced, ...extrasFixed)
  return without
}

/** Rebuild linked instance subtrees from the catalog. Root placement stays put. */
export function applyPrefabToInstances(
  entities: Entity[],
  catalog: Entity[],
): Entity[] {
  const catalogRootIds = new Set(prefabRoots(catalog).map((e) => e.id))
  const roots = entities.filter(
    (e) => isPrefabInstanceRoot(e) && catalogRootIds.has(e.prefabId as string),
  )
  let next = entities
  for (const root of roots) {
    next = syncOneInstance(next, catalog, root.id)
  }
  return next
}

export function resetPrefabInstance(
  entities: Entity[],
  catalog: Entity[],
  nodeId: string,
): Entity[] {
  const root = instanceRootOf(entities, nodeId)
  if (!root) return entities
  const ids = new Set(collectSubtreeIds(entities, root.id))
  const cleared = entities.map((e) =>
    ids.has(e.id) && e.prefabSourceId ? { ...e, prefabOverrides: [] } : e,
  )
  return applyPrefabToInstances(cleared, catalog)
}

export function detachPrefabInstances(
  entities: Entity[],
  prefabRootId: string,
): Entity[] {
  return entities.map((e) =>
    e.prefabId === prefabRootId ? stripPrefabLink(e) : e,
  )
}

export function removePrefabSubtree(catalog: Entity[], rootId: string): Entity[] {
  const remove = new Set(collectSubtreeIds(catalog, rootId))
  return catalog
    .filter((e) => !remove.has(e.id))
    .map((e) =>
      e.parentId && remove.has(e.parentId) ? { ...e, parentId: null } : e,
    )
}

export function prefabRootCount(catalog: Entity[]): number {
  return prefabRoots(catalog).length
}
