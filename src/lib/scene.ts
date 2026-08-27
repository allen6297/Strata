import { uid } from '@/lib/utils'
import type { Entity, EntityKind, SceneDocument } from '@/types/scene'

const COLORS = ['#3db8a8', '#e06c75', '#61afef', '#c678dd', '#e5c07b', '#98c379']

export const DEFAULT_SCENE_NAME = 'main.scene'

export const ASSETS = [
  { id: 'a1', name: 'player.png', type: 'texture' as const, size: '64×64' },
  { id: 'a2', name: 'tileset.png', type: 'texture' as const, size: '256×256' },
  { id: 'a3', name: 'PlayerController.ts', type: 'script' as const, size: '2.1 KB' },
  { id: 'a4', name: 'jump.wav', type: 'audio' as const, size: '48 KB' },
  { id: 'a5', name: 'main.scene', type: 'scene' as const, size: '1.4 KB' },
  { id: 'a6', name: 'coin.png', type: 'texture' as const, size: '32×32' },
]

export function createDefaultEntities(): Entity[] {
  return [
    {
      id: 'ent_player',
      name: 'Player',
      kind: 'sprite',
      parentId: null,
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      rotation: 0,
      color: '#3db8a8',
      visible: true,
      locked: false,
    },
    {
      id: 'ent_platform',
      name: 'Platform',
      kind: 'sprite',
      parentId: null,
      x: 40,
      y: 120,
      width: 220,
      height: 28,
      rotation: 0,
      color: '#5b6578',
      visible: true,
      locked: false,
    },
    {
      id: 'ent_coin',
      name: 'Coin',
      kind: 'sprite',
      parentId: null,
      x: -90,
      y: -40,
      width: 28,
      height: 28,
      rotation: 15,
      color: '#e5c07b',
      visible: true,
      locked: false,
    },
    {
      id: 'ent_main_cam',
      name: 'Main Camera',
      kind: 'camera',
      parentId: null,
      x: 0,
      y: -20,
      width: 160,
      height: 90,
      rotation: 0,
      color: '#3db8a8',
      visible: true,
      locked: false,
    },
  ]
}

export function createEntity(kind: EntityKind, index: number): Entity {
  const base =
    kind === 'camera'
      ? { width: 160, height: 90, color: '#3db8a8' }
      : kind === 'empty'
        ? { width: 24, height: 24, color: '#8b93a7' }
        : {
            width: 48,
            height: 48,
            color: COLORS[index % COLORS.length],
          }

  return {
    id: uid(),
    name: `${kind[0].toUpperCase()}${kind.slice(1)} ${index}`,
    kind,
    parentId: null,
    x: Math.round((Math.random() - 0.5) * 200),
    y: Math.round((Math.random() - 0.5) * 140),
    rotation: 0,
    visible: true,
    locked: false,
    ...base,
  }
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

export function toSceneDocument(
  name: string,
  entities: Entity[],
): SceneDocument {
  return { version: 1, name, entities }
}

export function parseSceneDocument(data: unknown): SceneDocument {
  if (!data || typeof data !== 'object') {
    throw new Error('Scene file is empty or invalid')
  }
  const doc = data as Partial<SceneDocument>
  if (doc.version !== 1 || !Array.isArray(doc.entities)) {
    throw new Error('Unsupported or invalid Strata scene')
  }
  const entities = doc.entities.map((raw, i) => {
    const e = raw as Partial<Entity>
    if (!e || typeof e !== 'object' || typeof e.id !== 'string') {
      throw new Error(`Entity ${i} is invalid`)
    }
    return {
      id: e.id,
      name: typeof e.name === 'string' ? e.name : `Entity ${i}`,
      kind: (e.kind as Entity['kind']) || 'empty',
      parentId: e.parentId ?? null,
      x: Number(e.x) || 0,
      y: Number(e.y) || 0,
      width: Math.max(8, Number(e.width) || 32),
      height: Math.max(8, Number(e.height) || 32),
      rotation: Number(e.rotation) || 0,
      color: typeof e.color === 'string' ? e.color : '#3db8a8',
      visible: e.visible !== false,
      locked: Boolean(e.locked),
    } satisfies Entity
  })
  return {
    version: 1,
    name:
      typeof doc.name === 'string' && doc.name.trim()
        ? doc.name
        : DEFAULT_SCENE_NAME,
    entities,
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
    const raw = localStorage.getItem('strata.scene.v1')
    if (!raw) return null
    return parseSceneDocument(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveSceneToStorage(doc: SceneDocument) {
  localStorage.setItem('strata.scene.v1', JSON.stringify(doc))
}
