import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/desktop'
import { checkRoseGoldWasm } from '@/lib/rosegold-wasm'
import type { AssetItem } from '@/types/scene'

export type RgDiagnostic = {
  file: string
  line: number
  col: number
  severity: string
  message: string
}

export function isWarningDiag(d: RgDiagnostic): boolean {
  return d.severity.toLowerCase() === 'warning'
}

/** Other project `.rg` files, keyed by asset name, stem, and dotted relative path. */
export function siblingRoseGoldModules(
  scripts: AssetItem[],
  currentId?: string,
): Record<string, string> {
  const modules: Record<string, string> = {}
  for (const s of scripts) {
    if (s.type !== 'script' || !s.content?.trim()) continue
    if (currentId && s.id === currentId) continue
    const name = s.name || 'script.rg'
    modules[name] = s.content
    const stem = name.replace(/\.rg$/i, '')
    if (stem && stem !== name) modules[stem] = s.content
    const rel = (s.relativePath || name).replace(/\\/g, '/')
    const dotted = rel.replace(/\.rg$/i, '').replace(/\//g, '.')
    if (dotted && dotted !== stem) modules[dotted] = s.content
  }
  return modules
}

export async function checkRoseGold(
  source: string,
  file = 'script.rg',
  modules?: Record<string, string>,
): Promise<RgDiagnostic[]> {
  if (!source.trim()) return []
  const moduleMap =
    modules && Object.keys(modules).length > 0 ? modules : undefined
  if (isTauri()) {
    try {
      return await invoke<RgDiagnostic[]>('check_rosegold', {
        source,
        file,
        modules: moduleMap,
      })
    } catch (err) {
      console.warn('[rosegold-check] tauri failed', err)
      return []
    }
  }
  return (await checkRoseGoldWasm(source, file, moduleMap)) ?? []
}
