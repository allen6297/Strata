import type { Entity, TileCell } from '@/types/scene'

export const DEFAULT_TILE_SIZE = 16

export function tileSizeOf(entity: Entity): number {
  const n = Number(entity.tileSize)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TILE_SIZE
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

/** Top-left + size of the tilemap in world space. `origin` is world x/y of cell (0,0). */
export function tilemapBounds(
  entity: Entity,
  origin: { x: number; y: number },
): { x: number; y: number; w: number; h: number } {
  const ts = tileSizeOf(entity)
  const tiles = entity.tiles ?? []
  if (!tiles.length) {
    return { x: origin.x, y: origin.y, w: entity.width, h: entity.height }
  }
  let minX = tiles[0]!.x
  let maxX = tiles[0]!.x
  let minY = tiles[0]!.y
  let maxY = tiles[0]!.y
  for (const t of tiles) {
    if (t.x < minX) minX = t.x
    if (t.x > maxX) maxX = t.x
    if (t.y < minY) minY = t.y
    if (t.y > maxY) maxY = t.y
  }
  return {
    x: origin.x + minX * ts,
    y: origin.y + minY * ts,
    w: (maxX - minX + 1) * ts,
    h: (maxY - minY + 1) * ts,
  }
}

export function worldToCell(
  origin: { x: number; y: number },
  tileSize: number,
  worldX: number,
  worldY: number,
): { x: number; y: number } {
  const ts = Math.max(1, tileSize)
  return {
    x: Math.floor((worldX - origin.x) / ts),
    y: Math.floor((worldY - origin.y) / ts),
  }
}

export function upsertTiles(
  tiles: TileCell[],
  x: number,
  y: number,
  index: number | null,
): TileCell[] {
  const next = tiles.filter((t) => t.x !== x || t.y !== y)
  if (index == null || index < 0) return next
  next.push({ x, y, i: index })
  return next
}

export function parseTiles(raw: unknown): TileCell[] {
  if (!Array.isArray(raw)) return []
  const out: TileCell[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const t = item as { x?: unknown; y?: unknown; i?: unknown }
    const x = Number(t.x)
    const y = Number(t.y)
    const i = Number(t.i)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(i)) continue
    out.push({ x: Math.trunc(x), y: Math.trunc(y), i: Math.max(0, Math.trunc(i)) })
  }
  return out
}
