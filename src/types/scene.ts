export type SceneMode = '2d' | '3d' | 'script'

export type EntityKind =
  | 'sprite'
  | 'empty'
  | 'camera'
  | 'light'
  | 'mesh'
  | 'script'
  | 'tilemap'

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
  layerId: string
  /** Blank in the Inspector means hierarchy wins; treated as 0 when sorting. */
  sortOrder: number | null
  /** Solid bodies block other solids; areas only fire overlap hooks. */
  solid: boolean
  /** Bitmask of collision layers this body occupies (bit 0 = layer 1). */
  collisionLayer: number
  /** Bitmask of layers this body scans. Default: all 8. */
  collisionMask: number
  /** Per-entity `@export var` overrides. Missing key → script default. */
  scriptProps: Record<string, string | number | boolean>
  /** Inspector signal wiring: this entity's signal → other entity method. */
  connections: ScriptConnection[]
  /** Pixel size of one tile (tilemap nodes). */
  tileSize: number
  /** Sparse painted cells. `i` is the tileset index. */
  tiles: TileCell[]
  /** Catalog root id when this node is a live prefab instance. */
  prefabId: string | null
  /** Catalog node this clone was stamped from. Root instances use the catalog root id. */
  prefabSourceId: string | null
  /** Inspector/move keys to keep when the catalog template syncs. */
  prefabOverrides: string[]
}

export type ScriptConnection = {
  signal: string
  to: string
  method: string
}

export interface TileCell {
  x: number
  y: number
  i: number
}

export interface RenderLayer {
  id: string
  name: string
  order: number
}

export interface ProjectSettings {
  renderLayers: RenderLayer[]
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
  prefabs?: Entity[]
  scripts?: AssetItem[]
}

export const SCENE_STORAGE_KEY = 'strata.scene.v2'
export const SCRIPTS_STORAGE_KEY = 'strata.scripts.v1'
