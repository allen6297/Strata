import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/desktop'
import type { SceneDocument } from '@/types/scene'

export interface EngineInfo {
  version: string
  scriptHost: string
}

export async function engineInfo(): Promise<EngineInfo | null> {
  if (!isTauri()) return null
  return invoke<EngineInfo>('engine_info')
}

export async function engineLoadScene(
  scene: SceneDocument,
): Promise<SceneDocument | null> {
  if (!isTauri()) return null
  return invoke<SceneDocument>('engine_load_scene', { scene })
}

export async function engineSnapshot(): Promise<SceneDocument | null> {
  if (!isTauri()) return null
  return invoke<SceneDocument>('engine_snapshot')
}

export async function engineTick(dt: number): Promise<SceneDocument | null> {
  if (!isTauri()) return null
  return invoke<SceneDocument>('engine_tick', { dt })
}
