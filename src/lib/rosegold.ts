import type { AssetItem, Entity } from '@/types/scene'
import { isTauri } from '@/lib/tauri'

export const DEFAULT_PLAYER_SCRIPT = `fn on_ready(name: Str, x: Float, y: Float): Int {
    print("[ready]");
    print(name);
    return 0;
}

fn on_update(name: Str, x: Float, y: Float, dt: Float): Int {
    print("[update]");
    print(name);
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
    print("[update] coin");
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

function rgFloat(n: number): string {
  if (!Number.isFinite(n)) return '0.0'
  return Number.isInteger(n) ? `${n}.0` : String(n)
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

export type HookJob = { label: string; source: string }

export function collectHookJobs(
  entities: Entity[],
  scripts: AssetItem[],
): HookJob[] {
  const scriptById = new Map(scripts.map((s) => [s.id, s]))
  const jobs: HookJob[] = []

  for (const e of entities) {
    if (!e.scriptId) continue
    const script = scriptById.get(e.scriptId)
    if (!script?.content?.trim()) continue
    if (scriptHasHook(script.content, 'on_ready')) {
      jobs.push({
        label: `${e.name} on_ready`,
        source: buildHookProgram(script.content, 'on_ready', e),
      })
    }
    if (scriptHasHook(script.content, 'on_update')) {
      // Smoke a few update ticks at play start
      for (const tick of [0, 1, 2]) {
        jobs.push({
          label: `${e.name} on_update#${tick}`,
          source: buildHookProgram(
            script.content,
            'on_update',
            e,
            0.016 * (tick + 1),
          ),
        })
      }
    }
  }

  if (!jobs.length) {
    jobs.push({
      label: 'scene driver',
      source: buildPlayDriver(entities, scripts),
    })
  }
  return jobs
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
