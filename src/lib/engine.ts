import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/desktop'
import { DEFAULT_LAYER_ID } from '@/lib/draw-order'
import { entityDefaults } from '@/lib/scene'
import type { AssetItem, Entity, SceneDocument } from '@/types/scene'
import type { RuntimeSideEffect } from '@/lib/rosegold'
import {
  isWasmEngineAvailable,
  wasmEngineClearPlay,
  wasmEngineInfo,
  wasmEngineLoadScene,
  wasmEngineSetAudio,
  wasmEngineSetKeys,
  wasmEngineSetScripts,
  wasmEngineSnapshot,
  wasmEngineTick,
} from '@/lib/rosegold-wasm'

export interface EngineInfo {
  version: string
  scriptHost: string
}

export interface EngineSideEffect {
  type: 'play_sound'
  name?: string | null
  url?: string | null
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

export interface AudioClipBinding {
  name: string
  url: string
}

export async function engineAvailable(): Promise<boolean> {
  if (isTauri()) return true
  return isWasmEngineAvailable()
}

export async function engineInfo(): Promise<EngineInfo | null> {
  if (isTauri()) return invoke<EngineInfo>('engine_info')
  return wasmEngineInfo()
}

export async function engineSetScripts(
  scripts: EntityScriptBinding[],
): Promise<void> {
  if (isTauri()) {
    await invoke('engine_set_scripts', { scripts })
    return
  }
  await wasmEngineSetScripts(scripts)
}

export async function engineSetAudio(
  clips: AudioClipBinding[],
): Promise<void> {
  if (isTauri()) {
    await invoke('engine_set_audio', { clips })
    return
  }
  await wasmEngineSetAudio(clips)
}

export async function engineSetKeys(
  keys: string,
  pressed = '',
): Promise<void> {
  if (isTauri()) {
    await invoke('engine_set_keys', { keys, pressed })
    return
  }
  await wasmEngineSetKeys(keys, pressed)
}

export async function engineClearPlay(): Promise<void> {
  if (isTauri()) {
    await invoke('engine_clear_play')
    return
  }
  await wasmEngineClearPlay()
}

export async function engineLoadScene(
  scene: SceneDocument,
): Promise<EngineFrame | null> {
  if (isTauri()) {
    return invoke<EngineFrame>('engine_load_scene', { scene })
  }
  return wasmEngineLoadScene(scene)
}

export async function engineSnapshot(): Promise<SceneDocument | null> {
  if (isTauri()) {
    return invoke<SceneDocument>('engine_snapshot')
  }
  return wasmEngineSnapshot()
}

export async function engineTick(dt: number): Promise<EngineFrame | null> {
  if (isTauri()) {
    return invoke<EngineFrame>('engine_tick', { dt })
  }
  return wasmEngineTick(dt)
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

export function collectAudioClips(assets: AssetItem[]): AudioClipBinding[] {
  const out: AudioClipBinding[] = []
  const seen = new Set<string>()
  for (const a of assets) {
    if (a.type !== 'audio' || !a.url) continue
    const names = [a.name, a.relativePath].filter(Boolean) as string[]
    for (const name of names) {
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ name, url: a.url })
    }
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
      return entityDefaults({
        id: n.id,
        name: n.name,
        kind: n.kind,
        parentId: n.parentId ?? null,
        scriptId: n.scriptId ?? resolveScriptId(scripts, n.scriptPath) ?? null,
        scriptPath: n.scriptPath || '',
        textureId: n.textureId ?? null,
        audioId: n.audioId ?? null,
        layerId: n.layerId || DEFAULT_LAYER_ID,
        sortOrder: n.sortOrder ?? null,
        solid: Boolean(n.solid),
        collisionLayer: n.collisionLayer ?? 1,
        collisionMask: n.collisionMask ?? 0xff,
        tileSize: n.tileSize ?? 16,
        tiles: n.tiles ?? [],
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
        scriptProps: n.scriptProps ?? {},
        connections: n.connections ?? [],
        prefabId: n.prefabId ?? null,
        prefabSourceId: n.prefabSourceId ?? null,
        prefabOverrides: n.prefabOverrides ?? [],
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
      parentId: n.parentId ?? e.parentId,
      scriptPath: n.scriptPath || e.scriptPath,
      scriptId:
        n.scriptId ??
        e.scriptId ??
        resolveScriptId(scripts, n.scriptPath || e.scriptPath),
      textureId: n.textureId ?? e.textureId,
      audioId: n.audioId ?? e.audioId,
      layerId: n.layerId || e.layerId || DEFAULT_LAYER_ID,
      sortOrder: n.sortOrder !== undefined ? n.sortOrder : e.sortOrder,
      solid: n.solid ?? e.solid,
      collisionLayer: n.collisionLayer ?? e.collisionLayer,
      collisionMask: n.collisionMask ?? e.collisionMask,
      tileSize: n.tileSize ?? e.tileSize,
      tiles: n.tiles ?? e.tiles,
      scriptProps: n.scriptProps ?? e.scriptProps,
      connections: n.connections ?? e.connections,
      prefabId: n.prefabId ?? e.prefabId,
      prefabSourceId: n.prefabSourceId ?? e.prefabSourceId,
      prefabOverrides: n.prefabOverrides ?? e.prefabOverrides,
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
      url: e.url ?? undefined,
    }))
}
