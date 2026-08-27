export type EntityKind = 'sprite' | 'empty' | 'camera' | 'light'

export interface Entity {
  id: string
  name: string
  kind: EntityKind
  parentId: string | null
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
}

export type ToolMode = 'select' | 'move' | 'create'

export interface SceneDocument {
  version: 1
  name: string
  entities: Entity[]
}

export const SCENE_STORAGE_KEY = 'strata.scene.v1'
