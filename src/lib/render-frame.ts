import { sortEntitiesForDraw } from '@/lib/draw-order'
import { tilemapBounds, tileSizeOf } from '@/lib/tilemap'
import { entityMap, getWorldPosition } from '@/lib/transforms'
import type { Entity, RenderLayer } from '@/types/scene'

export type ViewBounds = {
  left: number
  right: number
  top: number
  bottom: number
}

export type SpriteCmd = {
  kind: 'sprite'
  x: number
  y: number
  w: number
  h: number
  rotation: number
  color: string
  textureId: string | null
}

export type TileCmd = {
  kind: 'tile'
  x: number
  y: number
  size: number
  color: string
  textureId: string | null
  index: number
}

export type DrawCmd = SpriteCmd | TileCmd

export type RenderFrame = {
  commands: DrawCmd[]
}

const CULL_PAD = 64

export function viewOverlaps(
  left: number,
  top: number,
  right: number,
  bottom: number,
  view: ViewBounds,
  pad = CULL_PAD,
): boolean {
  return (
    right >= view.left - pad &&
    left <= view.right + pad &&
    bottom >= view.top - pad &&
    top <= view.bottom + pad
  )
}

/**
 * Cull → sort (M6) → sprite/tile commands.
 * Editor overlays (grid, gizmos, names, cameras) stay out of this list.
 */
export function buildRenderFrame(
  entities: Entity[],
  layers: RenderLayer[],
  view: ViewBounds,
): RenderFrame {
  const byId = entityMap(entities)
  const commands: DrawCmd[] = []
  for (const e of sortEntitiesForDraw(entities, layers)) {
    if (!e.visible) continue
    const world = getWorldPosition(e, byId)
    if (e.kind === 'tilemap') {
      const ts = tileSizeOf(e)
      const b = tilemapBounds(e, world)
      if (!viewOverlaps(b.x, b.y, b.x + b.w, b.y + b.h, view)) continue
      const tex = e.textureId
      for (const cell of e.tiles ?? []) {
        const x = world.x + cell.x * ts
        const y = world.y + cell.y * ts
        if (!viewOverlaps(x, y, x + ts, y + ts, view)) continue
        commands.push({
          kind: 'tile',
          x,
          y,
          size: ts,
          color: e.color,
          textureId: tex,
          index: cell.i,
        })
      }
      continue
    }
    if (e.kind !== 'sprite') continue
    const hw = Math.abs(e.width) / 2
    const hh = Math.abs(e.height) / 2
    const rad = Math.max(hw, hh)
    if (
      !viewOverlaps(
        world.x - rad,
        world.y - rad,
        world.x + rad,
        world.y + rad,
        view,
      )
    ) {
      continue
    }
    commands.push({
      kind: 'sprite',
      x: world.x,
      y: world.y,
      w: e.width,
      h: e.height,
      rotation: e.rotation,
      color: e.color,
      textureId: e.textureId,
    })
  }
  return { commands }
}

export function parseCssColor(
  color: string,
): [number, number, number, number] {
  const hex = color.trim()
  if (hex[0] === '#' && (hex.length === 7 || hex.length === 9)) {
    const r = Number.parseInt(hex.slice(1, 3), 16) / 255
    const g = Number.parseInt(hex.slice(3, 5), 16) / 255
    const b = Number.parseInt(hex.slice(5, 7), 16) / 255
    const a =
      hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) / 255 : 1
    if ([r, g, b, a].every((n) => Number.isFinite(n))) return [r, g, b, a]
  }
  return [1, 1, 1, 1]
}
