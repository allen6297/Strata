import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/desktop'
import { entityDefaults } from '@/lib/scene'
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
  hadError?: boolean
}

export interface EntityScriptBinding {
  entityId: string
  source: string
  /** Asset/script name for spawn `script=…` library lookup */
  name?: string
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

export async function engineClearPlay(): Promise<void> {
  if (!isTauri()) return
  await invoke('engine_clear_play')
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
  const byName = new Map(
    scripts
      .filter((s) => s.type === 'script' && s.content?.trim())
      .map((s) => [s.name.toLowerCase(), s]),
  )
  const out: EntityScriptBinding[] = []
  const seen = new Set<string>()

  for (const e of entities) {
    let script = e.scriptId ? byId.get(e.scriptId) : undefined
    if (!script && e.scriptPath) {
      script = byName.get(e.scriptPath.toLowerCase())
    }
    const content = script?.content?.trim()
    if (!content) continue
    out.push({
      entityId: e.id,
      source: content,
      name: script?.name,
    })
    seen.add(e.id)
  }

  // Also register unbound script assets so spawn script=Name works
  for (const s of scripts) {
    if (s.type !== 'script' || !s.content?.trim() || !s.name) continue
    // Library entries use a synthetic entity id that won't match world entities
    if ([...out].some((b) => b.name?.toLowerCase() === s.name.toLowerCase())) {
      continue
    }
    out.push({
      entityId: `__lib_${s.id}`,
      source: s.content.trim(),
      name: s.name,
    })
  }

  return out
}

function resolveScriptId(
  scripts: AssetItem[],
  scriptPath: string | undefined,
): string | null {
  if (!scriptPath) return null
  const lower = scriptPath.toLowerCase()
  const hit = scripts.find(
    (s) =>
      s.type === 'script' &&
      (s.name.toLowerCase() === lower ||
        s.relativePath?.toLowerCase().endsWith(lower)),
  )
  return hit?.id ?? null
}

/** Merge engine entities back onto editor entities (preserve scriptId, etc.).
 * Adds spawned entities and drops destroyed ones. */
export function mergeEngineEntities(
  prev: Entity[],
  engineEntities: Entity[],
  scripts: AssetItem[] = [],
): Entity[] {
  const prevById = new Map(prev.map((e) => [e.id, e]))
  return engineEntities.map((n) => {
    const e = prevById.get(n.id)
    if (!e) {
      const scriptId =
        resolveScriptId(scripts, n.scriptPath) ??
        (n.scriptPath ? null : null)
      return entityDefaults({
        id: n.id,
        name: n.name,
        kind: n.kind,
        scriptId,
        scriptPath: n.scriptPath || '',
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
        meshPrimitive: n.meshPrimitive,
        lightKind: n.lightKind,
      })
    }
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
      name: n.name,
      kind: n.kind,
      scriptPath: n.scriptPath || e.scriptPath,
      scriptId:
        e.scriptId ??
        resolveScriptId(scripts, n.scriptPath || e.scriptPath) ??
        e.scriptId,
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
