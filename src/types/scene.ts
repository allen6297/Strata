export type EntityKind = 'sprite' | 'empty' | 'camera' | 'light'

export interface Entity {
  id: string
  name: string
  kind: EntityKind
  parentId: string | null
  scriptId: string | null
  textureId: string | null
  audioId: string | null
  x: number
  y: number
  width: number
  height: number
  rotation: number
  color: string
  visible: boolean
  locked: boolean
}

export interface AssetItem {
  id: string
  name: string
  type: 'texture' | 'script' | 'audio' | 'scene'
  size: string
  /** Present for RoseGold / text scripts */
  content?: string
  language?: 'rosegold' | 'text'
  /** Object URL / Tauri convertFileSrc / public path for textures & audio */
  url?: string
  /** Absolute filesystem path when loaded from a project folder */
  path?: string
  /** Path relative to project root (for explorer folders) */
  relativePath?: string
  /** Raw byte size when known */
  bytes?: number
}

export type ToolMode = 'select' | 'move' | 'create'

export interface SceneDocument {
  version: 1
  name: string
  entities: Entity[]
  scripts?: AssetItem[]
}

export const SCENE_STORAGE_KEY = 'strata.scene.v1'
export const SCRIPTS_STORAGE_KEY = 'strata.scripts.v1'
