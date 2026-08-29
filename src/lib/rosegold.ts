import type { AssetItem, Entity, EntityKind } from '@/types/scene'
import { entityDefaults } from '@/lib/scene'
import { uid } from '@/lib/utils'
import { isTauri } from '@/lib/tauri'

export const DEFAULT_PLAYER_SCRIPT = `import str;

fn on_ready(name: String, x: Float, y: Float): Int {
    print("[ready] Player — arrows/WASD move, Space jump, Q destroy Coin");
    print("strata:play_sound name=jump.wav");
    print("strata:spawn name=Orb kind=sprite x=80 y=-20 w=24 h=24 color=#61afef script=CoinSpin.rg");
    return 0;
}

fn on_update(name: String, x: Float, y: Float, dt: Float, keys: String): Int {
    if str.contains(keys, "ArrowRight") || str.contains(keys, "KeyD") {
        print("strata:move dx=3 dy=0");
    }
    if str.contains(keys, "ArrowLeft") || str.contains(keys, "KeyA") {
        print("strata:move dx=-3 dy=0");
    }
    if str.contains(keys, "ArrowUp") || str.contains(keys, "KeyW") {
        print("strata:move dx=0 dy=-3");
    }
    if str.contains(keys, "ArrowDown") || str.contains(keys, "KeyS") {
        print("strata:move dx=0 dy=3");
    }
    if str.contains(keys, "Space") {
        print("strata:play_sound name=jump.wav");
    }
    if str.contains(keys, "KeyQ") {
        print("strata:destroy name=Coin");
    }
    return 0;
}

fn main(): Int {
    return on_ready("Player", 0.0, 0.0);
}
`

export const DEFAULT_COIN_SCRIPT = `fn on_ready(name: String, x: Float, y: Float): Int {
    print(f"[ready] {name}");
    return 0;
}

fn on_update(name: String, x: Float, y: Float, dt: Float): Int {
    print("strata:rot 8");
    return 0;
}

fn main(): Int {
    return on_ready("Coin", 0.0, 0.0);
}
`

export function scriptHasHook(
  content: string,
  hook: 'on_ready' | 'on_update',
): boolean {
  const re = new RegExp(`fn\\s+${hook}\\s*\\(`)
  return re.test(content)
}

function rgFloat(n: number): string {
  if (!Number.isFinite(n)) return '0.0'
  return Number.isInteger(n) ? `${n}.0` : String(n)
}

function hookAcceptsKeys(content: string): boolean {
  const m = content.match(/fn\s+on_update\s*\(([^)]*)\)/)
  if (!m) return false
  return m[1].includes('keys')
}

/** Strip an existing main and append a hook-driving main. */
export function buildHookProgram(
  scriptContent: string,
  hook: 'on_ready' | 'on_update',
  entity: Entity,
  dt = 0.016,
  keysCsv = '',
): string {
  const withoutMain = scriptContent.replace(
    /fn\s+main\s*\([^)]*\)\s*:\s*\w+\s*\{[\s\S]*?\n\}/m,
    '',
  )
  const nameLit = JSON.stringify(entity.name)
  const fx = rgFloat(entity.x)
  const fy = rgFloat(entity.y)
  const fdt = rgFloat(dt)
  const keysLit = JSON.stringify(keysCsv)
  let body: string
  if (hook === 'on_ready') {
    body = `    return on_ready(${nameLit}, ${fx}, ${fy});`
  } else if (hookAcceptsKeys(scriptContent)) {
    body = `    return on_update(${nameLit}, ${fx}, ${fy}, ${fdt}, ${keysLit});`
  } else {
    body = `    return on_update(${nameLit}, ${fx}, ${fy}, ${fdt});`
  }

  return `${withoutMain.trim()}\n\nfn main(): Int {\n${body}\n}\n`
}

export function buildPlayDriver(
  entities: Entity[],
  scripts: AssetItem[],
): string {
  const scriptById = new Map(scripts.map((s) => [s.id, s]))
  const lines = ['fn main(): Int {', '    print("[Strata] Play");']
  for (const e of entities) {
    const script = e.scriptId ? scriptById.get(e.scriptId) : undefined
    const label = `${e.name} / ${script?.name ?? 'none'} @ (${e.x}, ${e.y})`
    lines.push(`    print(${JSON.stringify(label)});`)
  }
  lines.push('    return 0;', '}', '')
  return lines.join('\n')
}

export type RoseGoldRunResult = {
  ok: boolean
  stdout: string
  stderr: string
  message: string
}

export type HookJob = { label: string; source: string; entityId?: string }

export function collectReadyJobs(
  entities: Entity[],
  scripts: AssetItem[],
): HookJob[] {
  const scriptById = new Map(scripts.map((s) => [s.id, s]))
  const jobs: HookJob[] = []
  for (const e of entities) {
    if (!e.scriptId) continue
    const script = scriptById.get(e.scriptId)
    if (!script?.content?.trim()) continue
    if (!scriptHasHook(script.content, 'on_ready')) continue
    jobs.push({
      label: `${e.name} on_ready`,
      entityId: e.id,
      source: buildHookProgram(script.content, 'on_ready', e),
    })
  }
  if (!jobs.length) {
    jobs.push({
      label: 'scene driver',
      source: buildPlayDriver(entities, scripts),
    })
  }
  return jobs
}

export function collectUpdateJobs(
  entities: Entity[],
  scripts: AssetItem[],
  dt: number,
  keysCsv = '',
): HookJob[] {
  const scriptById = new Map(scripts.map((s) => [s.id, s]))
  const jobs: HookJob[] = []
  for (const e of entities) {
    if (!e.scriptId || e.locked) continue
    const script = scriptById.get(e.scriptId)
    if (!script?.content?.trim()) continue
    if (!scriptHasHook(script.content, 'on_update')) continue
    jobs.push({
      label: `${e.name} on_update`,
      entityId: e.id,
      source: buildHookProgram(script.content, 'on_update', e, dt, keysCsv),
    })
  }
  return jobs
}

/** @deprecated use collectReadyJobs / collectUpdateJobs */
export function collectHookJobs(
  entities: Entity[],
  scripts: AssetItem[],
): HookJob[] {
  return [
    ...collectReadyJobs(entities, scripts),
    ...collectUpdateJobs(entities, scripts, 0.016),
  ]
}

export type StrataDirective =
  | { type: 'move'; entityId: string; dx: number; dy: number }
  | { type: 'rot'; entityId: string; degrees: number }
  | { type: 'set'; entityId: string; x?: number; y?: number; rot?: number }
  | { type: 'spawn'; entityId: string; spec: SpawnSpec }
  | { type: 'destroy'; entityId: string; targetName?: string }
  | { type: 'play_sound'; assetId?: string; assetName?: string }
  | { type: 'get'; entityId: string }

export type SpawnSpec = {
  name: string
  kind: EntityKind
  x: number
  y: number
  width: number
  height: number
  color: string
  textureName?: string
  scriptName?: string
}

export type RuntimeSideEffect =
  | { type: 'play_sound'; assetId?: string; assetName?: string }
  | { type: 'log'; message: string }

export type ApplyResult = {
  entities: Entity[]
  sideEffects: RuntimeSideEffect[]
}

function parseKv(payload: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of payload.matchAll(/(\w+)=("([^"]*)"|[^\s]+)/g)) {
    out[m[1]] = m[3] ?? m[2]
  }
  return out
}

/** Parse `strata:...` lines from RoseGold stdout, scoped to a job's entity. */
export function parseStrataDirectives(
  stdout: string,
  jobs: HookJob[],
): StrataDirective[] {
  const out: StrataDirective[] = []
  const sections = stdout.split(/^---\s+(.+?)\s+---\s*$/m)
  // If no section headers, apply to all jobs with entityId from whole stdout
  if (sections.length === 1) {
    for (const job of jobs) {
      if (!job.entityId) continue
      out.push(...parseDirectiveBlock(stdout, job.entityId))
    }
    return out
  }

  for (let i = 1; i < sections.length; i += 2) {
    const label = sections[i]
    const body = sections[i + 1] ?? ''
    const job = jobs.find((j) => j.label === label)
    if (!job?.entityId) continue
    out.push(...parseDirectiveBlock(body, job.entityId))
  }
  return out
}

function parseDirectiveBlock(text: string, entityId: string): StrataDirective[] {
  const out: StrataDirective[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('strata:')) continue
    const payload = trimmed.slice('strata:'.length).trim()
    const cmd = payload.split(/\s+/)[0]
    const rest = payload.slice(cmd.length).trim()
    const kv = parseKv(rest)

    if (cmd === 'move') {
      const dx = Number(kv.dx ?? payload.match(/dx=(-?\d+(?:\.\d+)?)/)?.[1] ?? 0)
      const dy = Number(kv.dy ?? payload.match(/dy=(-?\d+(?:\.\d+)?)/)?.[1] ?? 0)
      out.push({ type: 'move', entityId, dx, dy })
    } else if (cmd === 'rot') {
      const degrees = Number(kv.degrees ?? payload.match(/(-?\d+(?:\.\d+)?)/)?.[1] ?? 0)
      out.push({ type: 'rot', entityId, degrees })
    } else if (cmd === 'set') {
      const x = kv.x ?? payload.match(/x=(-?\d+(?:\.\d+)?)/)?.[1]
      const y = kv.y ?? payload.match(/y=(-?\d+(?:\.\d+)?)/)?.[1]
      const rot = kv.rot ?? payload.match(/rot=(-?\d+(?:\.\d+)?)/)?.[1]
      out.push({
        type: 'set',
        entityId,
        x: x !== undefined ? Number(x) : undefined,
        y: y !== undefined ? Number(y) : undefined,
        rot: rot !== undefined ? Number(rot) : undefined,
      })
    } else if (cmd === 'spawn') {
      out.push({
        type: 'spawn',
        entityId,
        spec: {
          name: kv.name || 'Entity',
          kind: (kv.kind as EntityKind) || 'sprite',
          x: Number(kv.x ?? 0),
          y: Number(kv.y ?? 0),
          width: Number(kv.w ?? kv.width ?? 32),
          height: Number(kv.h ?? kv.height ?? 32),
          color: kv.color || '#61afef',
          textureName: kv.texture,
          scriptName: kv.script,
        },
      })
    } else if (cmd === 'destroy') {
      out.push({ type: 'destroy', entityId, targetName: kv.name })
    } else if (cmd === 'play_sound' || cmd === 'sound') {
      out.push({
        type: 'play_sound',
        assetId: kv.id,
        assetName: kv.name,
      })
    } else if (cmd === 'get') {
      out.push({ type: 'get', entityId })
    }
  }
  return out
}

/** Browser / fallback for on_ready directives embedded in script source. */
export function previewReadyDirectives(
  entities: Entity[],
  scripts: AssetItem[],
): StrataDirective[] {
  const scriptById = new Map(scripts.map((s) => [s.id, s]))
  const out: StrataDirective[] = []
  for (const e of entities) {
    if (!e.scriptId) continue
    const script = scriptById.get(e.scriptId)
    if (!script?.content || !scriptHasHook(script.content, 'on_ready')) continue
    const m = script.content.match(/fn\s+on_ready[^{]*\{([\s\S]*?)\n\}/)
    const body = m?.[1] ?? script.content
    out.push(...parseDirectiveBlock(body, e.id))
  }
  return out
}

/** Browser / fallback preview when RoseGold isn't available. */
export function previewUpdateDirectives(
  entities: Entity[],
  scripts: AssetItem[],
  keysCsv = '',
): StrataDirective[] {
  const scriptById = new Map(scripts.map((s) => [s.id, s]))
  const keys = keysCsv.split(',').filter(Boolean)
  const out: StrataDirective[] = []

  for (const e of entities) {
    if (!e.scriptId || e.locked) continue
    const script = scriptById.get(e.scriptId)
    if (!script?.content || !scriptHasHook(script.content, 'on_update')) continue

    const lines = script.content.split('\n')
    const activeLines: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.includes('strata:')) continue
      let gated = false
      let allowed = true
      for (let j = i; j >= Math.max(0, i - 4); j--) {
        const keyMatch = lines[j].match(/str\.contains\(keys,\s*"([^"]+)"\)/)
        if (keyMatch) {
          gated = true
          allowed = keys.includes(keyMatch[1])
          break
        }
      }
      if (!gated || allowed) activeLines.push(line.trim())
    }

    if (activeLines.length) {
      out.push(...parseDirectiveBlock(activeLines.join('\n'), e.id))
      continue
    }

    if (!script.content.includes('str.contains(keys,')) {
      const embedded = [...script.content.matchAll(/strata:[^"'\n]+/g)].map(
        (m) => m[0],
      )
      if (embedded.length) {
        out.push(...parseDirectiveBlock(embedded.join('\n'), e.id))
      } else {
        out.push({ type: 'rot', entityId: e.id, degrees: 4 })
      }
    }
  }
  return out
}

function resolveAssetId(
  assets: AssetItem[],
  type: AssetItem['type'],
  name?: string,
): string | null {
  if (!name) return null
  const lower = name.toLowerCase()
  const hit = assets.find(
    (a) =>
      a.type === type &&
      (a.name.toLowerCase() === lower ||
        a.relativePath?.toLowerCase().endsWith(lower)),
  )
  return hit?.id ?? null
}

export function applyDirectives(
  entities: Entity[],
  directives: StrataDirective[],
  assets: AssetItem[] = [],
): ApplyResult {
  const sideEffects: RuntimeSideEffect[] = []
  if (!directives.length) return { entities, sideEffects }

  let list = entities.map((e) => ({ ...e }))
  const byId = () => new Map(list.map((e) => [e.id, e]))
  const byName = () => new Map(list.map((e) => [e.name.toLowerCase(), e]))

  for (const d of directives) {
    if (d.type === 'play_sound') {
      sideEffects.push({
        type: 'play_sound',
        assetId: d.assetId,
        assetName: d.assetName,
      })
      continue
    }
    if (d.type === 'get') {
      const e = byId().get(d.entityId)
      if (e) {
        sideEffects.push({
          type: 'log',
          message: `strata:state name=${e.name} x=${e.x} y=${e.y} rot=${e.rotation} w=${e.width} h=${e.height}`,
        })
      }
      continue
    }
    if (d.type === 'destroy') {
      const targetId = d.targetName
        ? byName().get(d.targetName.toLowerCase())?.id
        : d.entityId
      if (targetId) list = list.filter((e) => e.id !== targetId)
      continue
    }
    if (d.type === 'spawn') {
      const spec = d.spec
      list.push(
        entityDefaults({
          id: uid('ent'),
          name: spec.name,
          kind: spec.kind,
          scriptId: resolveAssetId(assets, 'script', spec.scriptName),
          textureId: resolveAssetId(assets, 'texture', spec.textureName),
          x: spec.x,
          y: spec.y,
          width: spec.width,
          height: spec.height,
          color: spec.color,
        }),
      )
      continue
    }

    const e = byId().get(d.entityId)
    if (!e || e.locked) continue
    if (d.type === 'move') {
      e.x = Math.round((e.x + d.dx) * 100) / 100
      e.y = Math.round((e.y + d.dy) * 100) / 100
    } else if (d.type === 'rot') {
      e.rotation = Math.round((e.rotation + d.degrees) * 100) / 100
    } else if (d.type === 'set') {
      if (d.x !== undefined) e.x = d.x
      if (d.y !== undefined) e.y = d.y
      if (d.rot !== undefined) e.rotation = d.rot
    }
  }

  return { entities: list, sideEffects }
}

export async function runRoseGoldSource(
  source: string,
): Promise<RoseGoldRunResult> {
  if (!isTauri()) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      message:
        'RoseGold hooks run in the desktop app (npm run tauri:dev) with `rosegold` on PATH.',
    }
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<RoseGoldRunResult>('run_rosegold', { source })
  } catch (err) {
    return {
      ok: false,
      stdout: '',
      stderr: String(err),
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function runRoseGoldHooks(
  jobs: HookJob[],
): Promise<RoseGoldRunResult> {
  if (!jobs.length) {
    return { ok: true, stdout: '', stderr: '', message: 'No hook jobs' }
  }
  if (!isTauri()) {
    const preview = jobs.map((j) => j.label).join(', ')
    return {
      ok: false,
      stdout: `Would run: ${preview}`,
      stderr: '',
      message:
        'RoseGold hooks run in the desktop app (npm run tauri:dev) with `rosegold` on PATH.',
    }
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<RoseGoldRunResult>('run_rosegold_hooks', { jobs })
  } catch (err) {
    return {
      ok: false,
      stdout: '',
      stderr: String(err),
      message: err instanceof Error ? err.message : String(err),
    }
  }
}
