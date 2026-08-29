import type { RoseGoldRunResult } from '@/lib/rosegold'

type WasmModule = {
  run: (source: string) => {
    ok: boolean
    stdout: string
    stderr: string
    message: string
  }
  run_hooks: (jobsJson: string) => {
    ok: boolean
    stdout: string
    stderr: string
    message: string
  }
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
    } catch {
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
