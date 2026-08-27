import type { AssetItem, Entity } from '@/types/scene'
import { isTauri } from '@/lib/tauri'

export const DEFAULT_PLAYER_SCRIPT = `fn on_ready(name: Str, x: Float, y: Float): Int {
    print("[ready]");
    print(name);
    return 0;
}

fn on_update(name: Str, x: Float, y: Float, dt: Float): Int {
    print("strata:move dx=1.5 dy=0");
    return 0;
}

fn main(): Int {
    return on_ready("Player", 0.0, 0.0);
}
`

export const DEFAULT_COIN_SCRIPT = `fn on_ready(name: Str, x: Float, y: Float): Int {
    print("[ready] coin");
    print(name);
    return 0;
}

fn on_update(name: Str, x: Float, y: Float, dt: Float): Int {
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

/** Strip an existing main and append a hook-driving main. */
export function buildHookProgram(
  scriptContent: string,
  hook: 'on_ready' | 'on_update',
  entity: Entity,
  dt = 0.016,
): string {
  const withoutMain = scriptContent.replace(
    /fn\s+main\s*\([^)]*\)\s*:\s*\w+\s*\{[\s\S]*?\n\}/m,
    '',
  )
  const nameLit = JSON.stringify(entity.name)
  const fx = rgFloat(entity.x)
  const fy = rgFloat(entity.y)
  const fdt = rgFloat(dt)
  const body =
    hook === 'on_ready'
      ? `    return on_ready(${nameLit}, ${fx}, ${fy});`
      : `    return on_update(${nameLit}, ${fx}, ${fy}, ${fdt});`

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
      source: buildHookProgram(script.content, 'on_update', e, dt),
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
    if (payload.startsWith('move')) {
      const dx = Number(payload.match(/dx=(-?\d+(?:\.\d+)?)/)?.[1] ?? 0)
      const dy = Number(payload.match(/dy=(-?\d+(?:\.\d+)?)/)?.[1] ?? 0)
      out.push({ type: 'move', entityId, dx, dy })
    } else if (payload.startsWith('rot')) {
      const degrees = Number(payload.match(/(-?\d+(?:\.\d+)?)/)?.[1] ?? 0)
      out.push({ type: 'rot', entityId, degrees })
    } else if (payload.startsWith('set')) {
      const x = payload.match(/x=(-?\d+(?:\.\d+)?)/)?.[1]
      const y = payload.match(/y=(-?\d+(?:\.\d+)?)/)?.[1]
      const rot = payload.match(/rot=(-?\d+(?:\.\d+)?)/)?.[1]
      out.push({
        type: 'set',
        entityId,
        x: x !== undefined ? Number(x) : undefined,
        y: y !== undefined ? Number(y) : undefined,
        rot: rot !== undefined ? Number(rot) : undefined,
      })
    }
  }
  return out
}

/** Browser / fallback preview when RoseGold isn't available. */
export function previewUpdateDirectives(
  entities: Entity[],
  scripts: AssetItem[],
): StrataDirective[] {
  const scriptById = new Map(scripts.map((s) => [s.id, s]))
  const out: StrataDirective[] = []
  for (const e of entities) {
    if (!e.scriptId || e.locked) continue
    const script = scriptById.get(e.scriptId)
    if (!script?.content || !scriptHasHook(script.content, 'on_update')) continue
    const embedded = [
      ...script.content.matchAll(/strata:(?:move|rot|set)[^"'\n]*/g),
    ].map((m) => m[0])
    if (embedded.length) {
      out.push(...parseDirectiveBlock(embedded.join('\n'), e.id))
      continue
    }
    out.push({ type: 'rot', entityId: e.id, degrees: 4 })
  }
  return out
}

export function applyDirectives(
  entities: Entity[],
  directives: StrataDirective[],
): Entity[] {
  if (!directives.length) return entities
  const map = new Map(entities.map((e) => [e.id, { ...e }]))
  for (const d of directives) {
    const e = map.get(d.entityId)
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
  return entities.map((e) => map.get(e.id) ?? e)
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
