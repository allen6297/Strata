import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/desktop'
import type { AssetItem, Entity, SceneDocument } from '@/types/scene'
import type { RuntimeSideEffect } from '@/lib/rosegold'

export interface EngineInfo {
  version: string
  scriptHost: string
}

export interface EngineSideEffect {
  type: 'play_sound'
  name?: string | null
}

export interface EngineFrame {
  scene: SceneDocument
  stdout: string
  sideEffects: EngineSideEffect[]
}

export interface EntityScriptBinding {
  entityId: string
  source: string
}

export async function engineInfo(): Promise<EngineInfo | null> {
  if (!isTauri()) return null
  return invoke<EngineInfo>('engine_info')
}

export async function engineSetScripts(
  scripts: EntityScriptBinding[],
): Promise<void> {
  if (!isTauri()) return
  await invoke('engine_set_scripts', { scripts })
}

export async function engineSetKeys(keys: string): Promise<void> {
  if (!isTauri()) return
  await invoke('engine_set_keys', { keys })
}

export async function engineLoadScene(
  scene: SceneDocument,
): Promise<EngineFrame | null> {
  if (!isTauri()) return null
  return invoke<EngineFrame>('engine_load_scene', { scene })
}

export async function engineSnapshot(): Promise<SceneDocument | null> {
  if (!isTauri()) return null
  return invoke<SceneDocument>('engine_snapshot')
}

export async function engineTick(dt: number): Promise<EngineFrame | null> {
  if (!isTauri()) return null
  return invoke<EngineFrame>('engine_tick', { dt })
}

/** Build entityId → RoseGold source for entities that have a script asset. */
export function collectEntityScripts(
  entities: Entity[],
  scripts: AssetItem[],
): EntityScriptBinding[] {
  const byId = new Map(scripts.map((s) => [s.id, s]))
  const out: EntityScriptBinding[] = []
  for (const e of entities) {
    if (!e.scriptId) continue
    const script = byId.get(e.scriptId)
    const content = script?.content?.trim()
    if (!content) continue
    out.push({ entityId: e.id, source: content })
  }
  return out
}

/** Merge engine transform fields back onto editor entities (preserve scriptId, etc.). */
export function mergeEngineEntities(
  prev: Entity[],
  engineEntities: Entity[],
): Entity[] {
  const byId = new Map(engineEntities.map((e) => [e.id, e]))
  return prev.map((e) => {
    const n = byId.get(e.id)
    if (!n) return e
    return {
      ...e,
      x: n.x,
      y: n.y,
      z: n.z,
      width: n.width,
      height: n.height,
      depth: n.depth,
      rotation: n.rotationZ ?? n.rotation,
      rotationX: n.rotationX,
      rotationY: n.rotationY,
      rotationZ: n.rotationZ ?? n.rotation,
      scaleX: n.scaleX,
      scaleY: n.scaleY,
      scaleZ: n.scaleZ,
      visible: n.visible,
      locked: n.locked,
      color: n.color,
    }
  })
}

export function engineSideEffectsToRuntime(
  effects: EngineSideEffect[],
): RuntimeSideEffect[] {
  return effects
    .filter((e) => e.type === 'play_sound')
    .map((e) => ({
      type: 'play_sound' as const,
      assetName: e.name ?? undefined,
    }))
}
