import type { Entity, RenderLayer } from '@/types/scene'

export const DEFAULT_LAYER_ID = 'layer_default'

export const DEFAULT_RENDER_LAYERS: RenderLayer[] = [
  { id: DEFAULT_LAYER_ID, name: 'Default', order: 0 },
]

export function defaultLayerId(layers: RenderLayer[]): string {
  if (!layers.length) return DEFAULT_LAYER_ID
  return [...layers].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))[0]
    .id
}

function layerOrder(layers: RenderLayer[], layerId: string): number {
  return layers.find((l) => l.id === layerId)?.order ?? 0
}

/** Depth-first index: roots in array order, children in array order. */
function dfsIndex(entities: Entity[]): Map<string, number> {
  const map = new Map<string, number>()
  let next = 0
  const visit = (id: string) => {
    if (map.has(id)) return
    map.set(id, next)
    next += 1
    for (const e of entities) {
      if (e.parentId === id) visit(e.id)
    }
  }
  for (const e of entities) {
    if (!e.parentId) visit(e.id)
  }
  for (const e of entities) {
    if (!map.has(e.id)) visit(e.id)
  }
  return map
}

/**
 * Draw order: layer.order, then sortOrder (blank = 0), then hierarchy DFS, then list index.
 * Matches `strata_engine::sort_entities_for_draw`.
 */
export function sortEntitiesForDraw(
  entities: Entity[],
  layers: RenderLayer[],
): Entity[] {
  const dfs = dfsIndex(entities)
  return entities
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const layerA = a.e.layerId || DEFAULT_LAYER_ID
      const layerB = b.e.layerId || DEFAULT_LAYER_ID
      const lo = layerOrder(layers, layerA) - layerOrder(layers, layerB)
      if (lo !== 0) return lo
      const so = (a.e.sortOrder ?? 0) - (b.e.sortOrder ?? 0)
      if (so !== 0) return so
      const d = (dfs.get(a.e.id) ?? 0) - (dfs.get(b.e.id) ?? 0)
      if (d !== 0) return d
      return a.i - b.i
    })
    .map(({ e }) => e)
}
