export type SceneMode = '2d' | '3d' | 'script'

export type EntityKind =
  | 'sprite'
  | 'empty'
  | 'camera'
  | 'light'
  | 'mesh'
  | 'script'

export type MeshPrimitive = 'box' | 'plane'
export type LightKind = 'point' | 'directional'

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
  z: number
  width: number
  height: number
  depth: number
  rotation: number
  rotationX: number
  rotationY: number
  rotationZ: number
  scaleX: number
  scaleY: number
  scaleZ: number
  color: string
  visible: boolean
  locked: boolean
  scriptPath: string
  meshPrimitive: MeshPrimitive
  lightKind: LightKind
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

export interface CameraReadout {
  x: number
  y: number
  z: number
  zoom: number
}

export interface SceneDocument {
  version: 2
  name: string
  mode: SceneMode
  entities: Entity[]
  scripts?: AssetItem[]
}

export const SCENE_STORAGE_KEY = 'strata.scene.v2'
export const SCRIPTS_STORAGE_KEY = 'strata.scripts.v1'
