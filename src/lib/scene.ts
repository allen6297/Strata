import { DEFAULT_LAYER_ID } from '@/lib/draw-order'
import { DEFAULT_TILE_SIZE, parseTiles } from '@/lib/tilemap'
import {
  DEFAULT_COIN_SCRIPT,
  DEFAULT_PLAYER_SCRIPT,
} from '@/lib/rosegold'
import { uid } from '@/lib/utils'
import type {
  AssetItem,
  Entity,
  EntityKind,
  SceneDocument,
  SceneMode,
} from '@/types/scene'
import { SCRIPTS_STORAGE_KEY } from '@/types/scene'

const COLORS = ['#d4848e', '#d4a574', '#f2c8b4', '#9a5a62', '#b76e79', '#a67c52']

export const DEFAULT_SCENE_NAME = 'main.scene'

export const COLLISION_BIT_COUNT = 8
export const DEFAULT_COLLISION_LAYER = 1
export const DEFAULT_COLLISION_MASK = (1 << COLLISION_BIT_COUNT) - 1

export const STATIC_ASSETS: AssetItem[] = [
  {
    id: 'a1',
    name: 'player.png',
    type: 'texture',
    size: '64×64',
    url: '/textures/player.png',
    relativePath: 'textures/player.png',
  },
  {
    id: 'a2',
    name: 'tileset.png',
    type: 'texture',
    size: '64×64',
    url: '/textures/tileset.png',
    relativePath: 'textures/tileset.png',
  },
  {
    id: 'a4',
    name: 'jump.wav',
    type: 'audio',
    size: '48 KB',
    relativePath: 'audio/jump.wav',
    url: '/audio/jump.wav',
  },
  {
    id: 'a5',
    name: 'main.scene',
    type: 'scene',
    size: '1.4 KB',
    relativePath: 'main.scene',
  },
  {
    id: 'a6',
    name: 'coin.png',
    type: 'texture',
    size: '32×32',
    url: '/textures/coin.png',
    relativePath: 'textures/coin.png',
  },
]

export function createDefaultScripts(): AssetItem[] {
  return [
    {
      id: 'scr_player',
      name: 'PlayerController.rg',
      type: 'script',
      language: 'rosegold',
      size: `${DEFAULT_PLAYER_SCRIPT.length} B`,
      content: DEFAULT_PLAYER_SCRIPT,
      relativePath: 'scripts/PlayerController.rg',
    },
    {
      id: 'scr_coin',
      name: 'CoinSpin.rg',
      type: 'script',
      language: 'rosegold',
      size: `${DEFAULT_COIN_SCRIPT.length} B`,
      content: DEFAULT_COIN_SCRIPT,
      relativePath: 'scripts/CoinSpin.rg',
    },
  ]
}

export function createDefaultPrefabs(): Entity[] {
  return [
    entityDefaults({
      id: 'pfb_orb',
      name: 'Orb',
      kind: 'sprite',
      x: 80,
      y: -20,
      width: 24,
      height: 24,
      depth: 8,
      color: '#61afef',
      scriptId: 'scr_coin',
      scriptPath: 'CoinSpin.rg',
      textureId: 'a6',
    }),
  ]
}

/** @deprecated use STATIC_ASSETS + scripts */
export const ASSETS = STATIC_ASSETS

export function entityDefaults(
  partial: Partial<Entity> & Pick<Entity, 'id' | 'name' | 'kind'>,
): Entity {
  const rotationZ = partial.rotationZ ?? partial.rotation ?? 0
  return {
    parentId: null,
    scriptId: null,
    textureId: null,
    audioId: null,
    x: 0,
    y: 0,
    z: 0,
    width: 48,
    height: 48,
    depth: 48,
    rotationX: 0,
    rotationY: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    color: '#d4848e',
    visible: true,
    locked: false,
    scriptPath: '',
    meshPrimitive: 'box',
    lightKind: 'point',
    layerId: DEFAULT_LAYER_ID,
    sortOrder: null,
    solid: false,
    collisionLayer: DEFAULT_COLLISION_LAYER,
    collisionMask: DEFAULT_COLLISION_MASK,
    scriptProps: {},
    connections: [],
    tileSize: DEFAULT_TILE_SIZE,
    tiles: [],
    prefabId: null,
    prefabSourceId: null,
    prefabOverrides: [],
    ...partial,
    rotation: rotationZ,
    rotationZ,
  }
}

function parseEntity(raw: unknown, i: number): Entity {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Entity ${i} is invalid`)
  }
  const e = raw as Partial<Entity> & { rotation?: number }
  if (typeof e.id !== 'string') {
    throw new Error(`Entity ${i} is invalid`)
  }
  const rotZ = Number(e.rotationZ ?? e.rotation) || 0
  return entityDefaults({
    id: e.id,
    name: typeof e.name === 'string' ? e.name : `Entity ${i}`,
    kind: (e.kind as Entity['kind']) || 'empty',
    parentId: e.parentId ?? null,
    scriptId: e.scriptId ?? null,
    textureId: e.textureId ?? null,
    audioId: e.audioId ?? null,
    x: Number(e.x) || 0,
    y: Number(e.y) || 0,
    z: Number(e.z) || 0,
    width: Math.max(8, Number(e.width) || 32),
    height: Math.max(8, Number(e.height) || 32),
    depth: Math.max(1, Number(e.depth) || 8),
    rotation: rotZ,
    rotationX: Number(e.rotationX) || 0,
    rotationY: Number(e.rotationY) || 0,
    rotationZ: rotZ,
    scaleX: Number(e.scaleX) || 1,
    scaleY: Number(e.scaleY) || 1,
    scaleZ: Number(e.scaleZ) || 1,
    color: typeof e.color === 'string' ? e.color : '#d4848e',
    visible: e.visible !== false,
    locked: Boolean(e.locked),
    scriptPath: typeof e.scriptPath === 'string' ? e.scriptPath : '',
    meshPrimitive: e.meshPrimitive === 'plane' ? 'plane' : 'box',
    lightKind: e.lightKind === 'directional' ? 'directional' : 'point',
    layerId:
      typeof e.layerId === 'string' && e.layerId.trim()
        ? e.layerId
        : DEFAULT_LAYER_ID,
    sortOrder:
      e.sortOrder == null || Number.isNaN(Number(e.sortOrder))
        ? null
        : Number(e.sortOrder),
    solid: Boolean(e.solid),
    collisionLayer: collisionBits(e.collisionLayer, DEFAULT_COLLISION_LAYER),
    collisionMask: collisionBits(e.collisionMask, DEFAULT_COLLISION_MASK),
    scriptProps: parseScriptProps((e as { scriptProps?: unknown }).scriptProps),
    connections: parseConnections((e as { connections?: unknown }).connections),
    tileSize: Math.max(1, Number((e as { tileSize?: unknown }).tileSize) || DEFAULT_TILE_SIZE),
    tiles: parseTiles((e as { tiles?: unknown }).tiles),
    prefabId: parsePrefabLink((e as { prefabId?: unknown }).prefabId),
    prefabSourceId: parsePrefabLink((e as { prefabSourceId?: unknown }).prefabSourceId),
    prefabOverrides: parsePrefabOverrides(
      (e as { prefabOverrides?: unknown }).prefabOverrides,
    ),
  })
}

function parsePrefabLink(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw : null
}

function parsePrefabOverrides(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string' || !item || seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

function collisionBits(raw: unknown, fallback: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n >>> 0
}

function parseScriptProps(
  raw: unknown,
): Record<string, string | number | boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' || typeof value === 'boolean') {
      out[key] = value
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value
    }
  }
  return out
}

function parseConnections(raw: unknown): Entity['connections'] {
  if (!Array.isArray(raw)) return []
  const out: Entity['connections'] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as { signal?: unknown; to?: unknown; method?: unknown }
    if (typeof c.signal !== 'string' || !c.signal.trim()) continue
    if (typeof c.to !== 'string' || !c.to.trim()) continue
    if (typeof c.method !== 'string' || !c.method.trim()) continue
    out.push({ signal: c.signal, to: c.to, method: c.method })
  }
  return out
}

export function createDefaultEntities(): Entity[] {
  return [
    entityDefaults({
      id: 'ent_player',
      name: 'Player',
      kind: 'sprite',
      scriptId: 'scr_player',
      textureId: 'a1',
      audioId: 'a4',
      width: 64,
      height: 64,
      depth: 8,
      color: '#d4848e',
      solid: true,
    }),
    entityDefaults({
      id: 'ent_ground',
      name: 'Ground',
      kind: 'tilemap',
      textureId: 'a2',
      x: -64,
      y: 28,
      width: 256,
      height: 16,
      depth: 8,
      color: '#8b6b5c',
      solid: true,
      tileSize: 16,
      tiles: Array.from({ length: 16 }, (_, x) => ({ x, y: 0, i: 0 })),
    }),
    entityDefaults({
      id: 'ent_coin',
      name: 'Coin',
      kind: 'sprite',
      scriptId: 'scr_coin',
      textureId: 'a6',
      x: 140,
      y: 0,
      width: 28,
      height: 28,
      depth: 8,
      rotation: 15,
      rotationZ: 15,
      color: '#d4a574',
      connections: [
        { signal: 'collected', to: 'ent_player', method: 'on_coin' },
      ],
    }),
    entityDefaults({
      id: 'ent_coin_fast',
      name: 'Coin Fast',
      kind: 'sprite',
      scriptId: 'scr_coin',
      textureId: 'a6',
      x: 180,
      y: 0,
      width: 28,
      height: 28,
      depth: 8,
      rotation: 15,
      rotationZ: 15,
      color: '#d4a574',
      scriptProps: { spin: 20 },
      connections: [
        { signal: 'collected', to: 'ent_player', method: 'on_coin' },
      ],
    }),
    entityDefaults({
      id: 'ent_star',
      name: 'Star',
      kind: 'sprite',
      x: 40,
      y: 0,
      width: 24,
      height: 24,
      depth: 8,
      color: '#e8c48a',
    }),
    entityDefaults({
      id: 'ent_main_cam',
      name: 'Main Camera',
      kind: 'camera',
      y: -20,
      width: 160,
      height: 90,
      depth: 8,
    }),
  ]
}

export function createDefault3dEntities(): Entity[] {
  return [
    entityDefaults({
      id: 'ent_cube',
      name: 'Cube',
      kind: 'mesh',
      meshPrimitive: 'box',
      width: 48,
      height: 48,
      depth: 48,
      color: '#d4848e',
    }),
    entityDefaults({
      id: 'ent_ground',
      name: 'Ground',
      kind: 'mesh',
      meshPrimitive: 'plane',
      y: -40,
      width: 280,
      height: 280,
      depth: 4,
      rotationX: -90,
      color: '#8b6b5c',
    }),
    entityDefaults({
      id: 'ent_key_light',
      name: 'Key Light',
      kind: 'light',
      lightKind: 'directional',
      x: 80,
      y: 120,
      z: 80,
      width: 16,
      height: 16,
      depth: 16,
      color: '#f2c8b4',
    }),
    entityDefaults({
      id: 'ent_main_cam',
      name: 'Main Camera',
      kind: 'camera',
      x: 0,
      y: 40,
      z: 180,
      width: 160,
      height: 90,
      depth: 8,
    }),
  ]
}

export function createEntity(kind: EntityKind, index: number): Entity {
  const base: Partial<Entity> =
    kind === 'camera'
      ? { width: 160, height: 90, depth: 8, color: '#d4848e' }
      : kind === 'empty'
        ? { width: 24, height: 24, depth: 24, color: '#c4a39a' }
        : kind === 'mesh'
          ? {
              width: 48,
              height: 48,
              depth: 48,
              meshPrimitive: 'box',
              color: COLORS[index % COLORS.length],
            }
          : kind === 'light'
            ? {
                width: 16,
                height: 16,
                depth: 16,
                lightKind: 'point',
                color: '#f2c8b4',
                y: 80,
              }
            : kind === 'script'
              ? {
                  width: 24,
                  height: 24,
                  depth: 24,
                  scriptPath: 'scripts/main.rg',
                  color: '#9a5a62',
                }
              : kind === 'tilemap'
                ? {
                    width: 256,
                    height: 128,
                    depth: 8,
                    color: '#8b6b5c',
                    solid: true,
                    tileSize: DEFAULT_TILE_SIZE,
                    tiles: [],
                  }
              : {
                  width: 48,
                  height: 48,
                  depth: 8,
                  color: COLORS[index % COLORS.length],
                }

  return entityDefaults({
    id: uid(),
    name: `${kind[0].toUpperCase()}${kind.slice(1)} ${index}`,
    kind,
    x: Math.round((Math.random() - 0.5) * 200),
    y: Math.round((Math.random() - 0.5) * 140),
    z: kind === 'mesh' || kind === 'light' ? Math.round((Math.random() - 0.5) * 80) : 0,
    ...base,
  })
}

export function duplicateEntity(entity: Entity): Entity {
  return {
    ...entity,
    id: uid(),
    name: `${entity.name} Copy`,
    x: entity.x + 24,
    y: entity.y + 24,
    locked: false,
  }
}

export function getChildren(entities: Entity[], parentId: string | null): Entity[] {
  return entities.filter((e) => e.parentId === parentId)
}

export function isAncestorOf(
  entities: Entity[],
  ancestorId: string,
  nodeId: string | null,
): boolean {
  let current = nodeId
  const byId = new Map(entities.map((e) => [e.id, e]))
  while (current) {
    if (current === ancestorId) return true
    current = byId.get(current)?.parentId ?? null
  }
  return false
}

export type HierarchyDropKind = 'before' | 'after' | 'into'

/** Reparent and/or reorder within the flat entity list (sibling order = array order). */
export function applyHierarchyDrop(
  entities: Entity[],
  draggedId: string,
  targetId: string | null,
  kind: HierarchyDropKind,
): Entity[] {
  if (draggedId === targetId) return entities
  const dragged = entities.find((e) => e.id === draggedId)
  if (!dragged) return entities

  let nextParentId: string | null
  let beforeSiblingId: string | null = null

  if (targetId === null) {
    nextParentId = null
  } else if (kind === 'into') {
    if (isAncestorOf(entities, draggedId, targetId)) return entities
    nextParentId = targetId
  } else {
    const target = entities.find((e) => e.id === targetId)
    if (!target) return entities
    if (isAncestorOf(entities, draggedId, target.parentId)) return entities
    nextParentId = target.parentId
    beforeSiblingId = kind === 'before' ? targetId : null
    if (kind === 'after') {
      const siblings = getChildren(entities, nextParentId).filter(
        (e) => e.id !== draggedId,
      )
      const idx = siblings.findIndex((e) => e.id === targetId)
      beforeSiblingId = siblings[idx + 1]?.id ?? null
    }
  }

  const updated: Entity = { ...dragged, parentId: nextParentId }
  const without = entities.filter((e) => e.id !== draggedId)

  let insertAt = without.length
  if (beforeSiblingId) {
    const i = without.findIndex((e) => e.id === beforeSiblingId)
    if (i >= 0) insertAt = i
  } else {
    const siblings = without.filter((e) => e.parentId === nextParentId)
    if (siblings.length > 0) {
      const last = siblings[siblings.length - 1]
      insertAt = without.findIndex((e) => e.id === last.id) + 1
    } else if (nextParentId) {
      const parentIdx = without.findIndex((e) => e.id === nextParentId)
      insertAt = parentIdx >= 0 ? parentIdx + 1 : without.length
    }
  }

  const next = [...without]
  next.splice(insertAt, 0, updated)
  return next
}

export function deleteEntityKeepChildren(
  entities: Entity[],
  id: string,
): Entity[] {
  const victim = entities.find((e) => e.id === id)
  if (!victim) return entities
  return entities
    .filter((e) => e.id !== id)
    .map((e) =>
      e.parentId === id ? { ...e, parentId: victim.parentId } : e,
    )
}

export function toSceneDocument(
  name: string,
  entities: Entity[],
  scripts: AssetItem[] = [],
  mode: SceneMode = '2d',
  prefabs: Entity[] = [],
): SceneDocument {
  const withPath = (e: Entity): Entity => {
    if (e.scriptPath) return e
    const s = scripts.find((s) => s.id === e.scriptId)
    return s?.name ? { ...e, scriptPath: s.name } : e
  }
  return {
    version: 2,
    name,
    mode,
    entities: entities.map(withPath),
    prefabs: prefabs.map(withPath),
    scripts: scripts.filter((s) => s.type === 'script'),
  }
}

export function parseSceneDocument(data: unknown): SceneDocument {
  if (!data || typeof data !== 'object') {
    throw new Error('Scene file is empty or invalid')
  }
  const doc = data as {
    version?: number
    name?: string
    mode?: SceneMode
    entities?: unknown[]
    prefabs?: unknown[]
    scripts?: AssetItem[]
  }
  if (!Array.isArray(doc.entities) || (doc.version !== 1 && doc.version !== 2)) {
    throw new Error('Unsupported or invalid Strata scene')
  }
  const entities = doc.entities.map((raw, i) => parseEntity(raw, i))
  const prefabs = Array.isArray(doc.prefabs)
    ? doc.prefabs.map((raw, i) => parseEntity(raw, i))
    : []
  const scripts = Array.isArray(doc.scripts)
    ? doc.scripts
        .filter((s) => s && s.type === 'script')
        .map((s) => ({
          ...s,
          language: s.language ?? ('rosegold' as const),
          content: s.content ?? '',
          size: s.size || `${(s.content ?? '').length} B`,
        }))
    : undefined
  return {
    version: 2,
    name:
      typeof doc.name === 'string' && doc.name.trim()
        ? doc.name
        : DEFAULT_SCENE_NAME,
    mode:
      doc.version === 1
        ? '2d'
        : doc.mode === '3d'
          ? '3d'
          : doc.mode === 'script'
            ? 'script'
            : '2d',
    entities,
    prefabs,
    scripts,
  }
}

export function downloadScene(doc: SceneDocument) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = doc.name.endsWith('.scene') ? doc.name : `${doc.name}.scene`
  a.click()
  URL.revokeObjectURL(url)
}

export function loadSceneFromStorage(): SceneDocument | null {
  try {
    const raw =
      localStorage.getItem('strata.scene.v2') ??
      localStorage.getItem('strata.scene.v1')
    if (!raw) return null
    return parseSceneDocument(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveSceneToStorage(doc: SceneDocument) {
  localStorage.setItem('strata.scene.v2', JSON.stringify(doc))
}

export function ensure3dContent(entities: Entity[]): Entity[] {
  const hasMesh = entities.some((e) => e.kind === 'mesh')
  const hasLight = entities.some((e) => e.kind === 'light')
  if (hasMesh && hasLight) return entities
  const extras = createDefault3dEntities().filter((e) => {
    if (e.kind === 'mesh' && hasMesh) return false
    if (e.kind === 'light' && hasLight) return false
    if (e.kind === 'camera' && entities.some((x) => x.kind === 'camera')) return false
    if (entities.some((x) => x.id === e.id)) return false
    return true
  })
  return [...entities, ...extras]
}

export function loadScriptsFromStorage(): AssetItem[] | null {
  try {
    const raw = localStorage.getItem(SCRIPTS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AssetItem[]
    if (!Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveScriptsToStorage(scripts: AssetItem[]) {
  localStorage.setItem(SCRIPTS_STORAGE_KEY, JSON.stringify(scripts))
}
