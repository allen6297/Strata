import type { RoseGoldRunResult } from '@/lib/rosegold'
import type { EngineFrame, EngineInfo, EntityScriptBinding, AudioClipBinding } from '@/lib/engine'
import type { SceneDocument } from '@/types/scene'

type WasmModule = {
  run: (source: string) => {
    ok: boolean
    stdout: string
    stderr: string
    message: string
    effects?: RoseGoldRunResult['effects']
    hookEffects?: RoseGoldRunResult['hookEffects']
  }
  run_preview?: (
    source: string,
    name: string,
    x: number,
    y: number,
  ) => {
    ok: boolean
    stdout: string
    stderr: string
    message: string
    effects?: RoseGoldRunResult['effects']
    hookEffects?: RoseGoldRunResult['hookEffects']
  }
  run_preview_with_modules?: (
    source: string,
    name: string,
    x: number,
    y: number,
    modulesJson: string,
  ) => {
    ok: boolean
    stdout: string
    stderr: string
    message: string
    effects?: RoseGoldRunResult['effects']
    hookEffects?: RoseGoldRunResult['hookEffects']
  }
  run_hooks: (jobsJson: string) => {
    ok: boolean
    stdout: string
    stderr: string
    message: string
    effects?: RoseGoldRunResult['effects']
    hookEffects?: RoseGoldRunResult['hookEffects']
  }
  check?: (source: string, file: string) => Array<{
    file: string
    line: number
    col: number
    severity: string
    message: string
  }>
  check_with_modules?: (
    source: string,
    file: string,
    modulesJson: string,
  ) => Array<{
    file: string
    line: number
    col: number
    severity: string
    message: string
  }>
  engine_info?: () => EngineInfo
  engine_set_scripts?: (scriptsJson: string) => void
  engine_set_audio?: (clipsJson: string) => void
  engine_set_keys?: (keys: string, pressed: string) => void
  engine_clear_play?: () => void
  engine_load_scene?: (sceneJson: string) => EngineFrame
  engine_snapshot?: () => SceneDocument
  engine_tick?: (dt: number) => EngineFrame
  def_at?: (
    source: string,
    file: string,
    line: number,
    col: number,
    modulesJson: string,
  ) => RgSymbolWasm | null
  hover_at?: (
    source: string,
    file: string,
    line: number,
    col: number,
    modulesJson: string,
  ) => RgSymbolWasm | null
  list_exports?: (source: string) => RgExportWasm[] | null
  list_signals?: (source: string) => RgSignalWasm[] | null
  list_signals_with_modules?: (
    source: string,
    modulesJson: string,
  ) => RgSignalWasm[] | null
  list_fns?: (source: string) => RgFnWasm[] | null
  list_nodes?: (source: string) => RgNodeWasm[] | null
  format_source?: (source: string) => string
  stdlib_source?: (name: string) => string | undefined | null
}

type RgSymbolWasm = {
  kind: string
  name: string
  signature: string
  file: string
  line: number
  col: number
}

type RgExportWasm = {
  name: string
  ty: string
  group: string | null
  default: string | number | boolean | null
}

type RgSignalWasm = {
  name: string
  params: Array<{ name: string; ty: string }>
}

type RgFnWasm = {
  name: string
  params: Array<{ name: string; ty: string }>
}

type RgNodeWasm = {
  name: string
  parent: string
  kind: string
  doc?: string | null
}

let loadPromise: Promise<WasmModule | null> | null = null

async function loadWasm(): Promise<WasmModule | null> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    try {
      // Built by `npm run build:wasm` into src/wasm/rosegold
      const mod = await import('@/wasm/rosegold/rosegold_wasm.js')
      if (typeof mod.default === 'function') {
        await mod.default()
      }
      return mod as unknown as WasmModule
    } catch (err) {
      console.warn('[rosegold-wasm] unavailable, using directive preview', err)
      return null
    }
  })()
  return loadPromise
}

/** Run labeled RoseGold jobs via WASM. Returns null if the wasm package is not built. */
export async function runRoseGoldWasm(
  jobs: { label: string; source: string }[],
): Promise<RoseGoldRunResult | null> {
  if (!jobs.length) {
    return {
      ok: true,
      stdout: '',
      stderr: '',
      message: 'No hook jobs (wasm)',
    }
  }
  const wasm = await loadWasm()
  if (!wasm) return null
  try {
    const result = wasm.run_hooks(JSON.stringify(jobs))
    return {
      ok: result.ok,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      message: result.message || 'RoseGold wasm finished',
      effects: result.effects,
      hookEffects: result.hookEffects,
    }
  } catch (err) {
    return {
      ok: false,
      stdout: '',
      stderr: String(err),
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Script-tab Run via WASM. Returns null if the wasm package is not built. */
export async function runRoseGoldPreviewWasm(
  source: string,
  name: string,
  x: number,
  y: number,
  modules?: Record<string, string>,
): Promise<RoseGoldRunResult | null> {
  const wasm = await loadWasm()
  if (!wasm?.run_preview) return null
  try {
    const result =
      modules && Object.keys(modules).length > 0 && wasm.run_preview_with_modules
        ? wasm.run_preview_with_modules(source, name, x, y, JSON.stringify(modules))
        : wasm.run_preview(source, name, x, y)
    return {
      ok: result.ok,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      message: result.message || 'RoseGold wasm finished',
      effects: result.effects,
    }
  } catch (err) {
    return {
      ok: false,
      stdout: '',
      stderr: String(err),
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function isRoseGoldWasmAvailable(): Promise<boolean> {
  return (await loadWasm()) !== null
}

/** True when the WASM package includes the cached-hook play host. */
export async function isWasmEngineAvailable(): Promise<boolean> {
  const wasm = await loadWasm()
  return typeof wasm?.engine_load_scene === 'function'
}

export async function wasmEngineInfo(): Promise<EngineInfo | null> {
  const wasm = await loadWasm()
  if (!wasm?.engine_info) return null
  try {
    return wasm.engine_info()
  } catch {
    return null
  }
}

export async function wasmEngineSetScripts(
  scripts: EntityScriptBinding[],
): Promise<void> {
  const wasm = await loadWasm()
  wasm?.engine_set_scripts?.(JSON.stringify(scripts))
}

export async function wasmEngineSetAudio(
  clips: AudioClipBinding[],
): Promise<void> {
  const wasm = await loadWasm()
  wasm?.engine_set_audio?.(JSON.stringify(clips))
}

export async function wasmEngineSetKeys(
  keys: string,
  pressed = '',
): Promise<void> {
  const wasm = await loadWasm()
  wasm?.engine_set_keys?.(keys, pressed)
}

export async function wasmEngineClearPlay(): Promise<void> {
  const wasm = await loadWasm()
  wasm?.engine_clear_play?.()
}

function coerceFrame(raw: EngineFrame | null | undefined): EngineFrame | null {
  if (!raw?.scene) return null
  return {
    scene: raw.scene,
    stdout: raw.stdout ?? '',
    sideEffects: raw.sideEffects ?? [],
    hadError: Boolean(raw.hadError),
  }
}

export async function wasmEngineLoadScene(
  scene: SceneDocument,
): Promise<EngineFrame | null> {
  const wasm = await loadWasm()
  if (!wasm?.engine_load_scene) return null
  try {
    return coerceFrame(wasm.engine_load_scene(JSON.stringify(scene)))
  } catch (err) {
    console.warn('[rosegold-wasm] engine_load_scene failed', err)
    return null
  }
}

export async function wasmEngineSnapshot(): Promise<SceneDocument | null> {
  const wasm = await loadWasm()
  if (!wasm?.engine_snapshot) return null
  try {
    return wasm.engine_snapshot()
  } catch {
    return null
  }
}

export async function wasmEngineTick(dt: number): Promise<EngineFrame | null> {
  const wasm = await loadWasm()
  if (!wasm?.engine_tick) return null
  try {
    return coerceFrame(wasm.engine_tick(dt))
  } catch (err) {
    console.warn('[rosegold-wasm] engine_tick failed', err)
    return null
  }
}

/** Typecheck/parse via WASM. Returns null if the wasm package is not built. */
export async function checkRoseGoldWasm(
  source: string,
  file = 'script.rg',
  modules?: Record<string, string>,
): Promise<
  | Array<{
      file: string
      line: number
      col: number
      severity: string
      message: string
    }>
  | null
> {
  const wasm = await loadWasm()
  if (!wasm?.check) return null
  try {
    const hasModules = modules && Object.keys(modules).length > 0
    const raw =
      hasModules && wasm.check_with_modules
        ? wasm.check_with_modules(source, file, JSON.stringify(modules))
        : wasm.check(source, file)
    return Array.isArray(raw) ? raw : []
  } catch (err) {
    console.warn('[rosegold-wasm] check failed', err)
    return null
  }
}

export async function symbolAtWasm(
  source: string,
  file: string,
  line: number,
  col: number,
  modules?: Record<string, string>,
): Promise<RgSymbolWasm | null> {
  const wasm = await loadWasm()
  if (!wasm?.def_at) return null
  try {
    const raw = wasm.def_at(
      source,
      file,
      line,
      col,
      JSON.stringify(modules ?? {}),
    )
    if (!raw || typeof raw !== 'object') return null
    return raw
  } catch (err) {
    console.warn('[rosegold-wasm] def_at failed', err)
    return null
  }
}

export async function listExportsWasm(
  source: string,
): Promise<RgExportWasm[] | null> {
  const wasm = await loadWasm()
  if (!wasm?.list_exports) return null
  try {
    const raw = wasm.list_exports(source)
    return Array.isArray(raw) ? raw : []
  } catch (err) {
    console.warn('[rosegold-wasm] list_exports failed', err)
    return null
  }
}

export async function listSignalsWasm(
  source: string,
  modules?: Record<string, string>,
): Promise<RgSignalWasm[] | null> {
  const wasm = await loadWasm()
  if (!wasm) return null
  try {
    const hasModules = modules && Object.keys(modules).length > 0
    const raw =
      hasModules && wasm.list_signals_with_modules
        ? wasm.list_signals_with_modules(source, JSON.stringify(modules))
        : wasm.list_signals
          ? wasm.list_signals(source)
          : null
    return Array.isArray(raw) ? raw : []
  } catch (err) {
    console.warn('[rosegold-wasm] list_signals failed', err)
    return null
  }
}

export async function listFnsWasm(
  source: string,
): Promise<RgFnWasm[] | null> {
  const wasm = await loadWasm()
  if (!wasm?.list_fns) return null
  try {
    const raw = wasm.list_fns(source)
    return Array.isArray(raw) ? raw : []
  } catch (err) {
    console.warn('[rosegold-wasm] list_fns failed', err)
    return null
  }
}

export async function listNodesWasm(
  source: string,
): Promise<RgNodeWasm[] | null> {
  const wasm = await loadWasm()
  if (!wasm?.list_nodes) return null
  try {
    const raw = wasm.list_nodes(source)
    return Array.isArray(raw) ? raw : []
  } catch (err) {
    console.warn('[rosegold-wasm] list_nodes failed', err)
    return null
  }
}

export async function stdlibSourceWasm(name: string): Promise<string | null> {
  const wasm = await loadWasm()
  if (!wasm?.stdlib_source) return null
  try {
    const raw = wasm.stdlib_source(name)
    return raw && raw.length > 0 ? raw : null
  } catch (err) {
    console.warn('[rosegold-wasm] stdlib_source failed', err)
    return null
  }
}
