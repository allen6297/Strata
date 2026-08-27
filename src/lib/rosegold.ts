import type { AssetItem, Entity } from '@/types/scene'
import { isTauri } from '@/lib/tauri'

export const DEFAULT_PLAYER_SCRIPT = `fn on_ready(name: Str, x: Float, y: Float): Int {
    print("[Strata] entity ready");
    print(name);
    return 0;
}

fn main(): Int {
    return on_ready("Player", 0.0, 0.0);
}
`

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

export async function runRoseGoldSource(
  source: string,
): Promise<RoseGoldRunResult> {
  if (!isTauri()) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      message:
        'RoseGold Play runs in the desktop app (npm run tauri:dev) with `rosegold` on PATH.',
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
