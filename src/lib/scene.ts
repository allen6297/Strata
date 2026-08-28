import {
  DEFAULT_COIN_SCRIPT,
  DEFAULT_PLAYER_SCRIPT,
} from '@/lib/rosegold'
import { uid } from '@/lib/utils'
import type { AssetItem, Entity, EntityKind, SceneDocument } from '@/types/scene'
import { SCRIPTS_STORAGE_KEY } from '@/types/scene'

const COLORS = ['#3db8a8', '#e06c75', '#61afef', '#c678dd', '#e5c07b', '#98c379']

export const DEFAULT_SCENE_NAME = 'main.scene'

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
    size: '256×256',
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

/** @deprecated use STATIC_ASSETS + scripts */
export const ASSETS = STATIC_ASSETS

export function createDefaultEntities(): Entity[] {
  return [
    {
      id: 'ent_player',
      name: 'Player',
      kind: 'sprite',
      parentId: null,
      scriptId: 'scr_player',
      textureId: 'a1',
      audioId: 'a4',
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
      scriptId: null,
      textureId: null,
      audioId: null,
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
      parentId: 'ent_player',
      scriptId: 'scr_coin',
      textureId: 'a6',
      audioId: null,
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
      scriptId: null,
      textureId: null,
      audioId: null,
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
    scriptId: null,
    textureId: null,
    audioId: null,
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
  scripts: AssetItem[] = [],
): SceneDocument {
  return {
    version: 1,
    name,
    entities,
    scripts: scripts.filter((s) => s.type === 'script'),
  }
}

function normalizeEntity(raw: Partial<Entity>, i: number): Entity {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') {
    throw new Error(`Entity ${i} is invalid`)
  }
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : `Entity ${i}`,
    kind: (raw.kind as Entity['kind']) || 'empty',
    parentId: raw.parentId ?? null,
    scriptId: raw.scriptId ?? null,
    textureId: raw.textureId ?? null,
    audioId: raw.audioId ?? null,
    x: Number(raw.x) || 0,
    y: Number(raw.y) || 0,
    width: Math.max(8, Number(raw.width) || 32),
    height: Math.max(8, Number(raw.height) || 32),
    rotation: Number(raw.rotation) || 0,
    color: typeof raw.color === 'string' ? raw.color : '#3db8a8',
    visible: raw.visible !== false,
    locked: Boolean(raw.locked),
  }
}

export function parseSceneDocument(data: unknown): SceneDocument {
  if (!data || typeof data !== 'object') {
    throw new Error('Scene file is empty or invalid')
  }
  const doc = data as Partial<SceneDocument>
  if (doc.version !== 1 || !Array.isArray(doc.entities)) {
    throw new Error('Unsupported or invalid Strata scene')
  }
  const entities = doc.entities.map((raw, i) =>
    normalizeEntity(raw as Partial<Entity>, i),
  )
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
    version: 1,
    name:
      typeof doc.name === 'string' && doc.name.trim()
        ? doc.name
        : DEFAULT_SCENE_NAME,
    entities,
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
