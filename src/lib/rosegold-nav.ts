import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/desktop'
import { symbolAtWasm } from '@/lib/rosegold-wasm'
import type { AssetItem } from '@/types/scene'

export type RgSymbol = {
  kind: string
  name: string
  signature: string
  file: string
  line: number
  col: number
  doc?: string
}

export type NavContext = {
  fileName: string
  modules: Record<string, string>
  onJump: (info: RgSymbol) => void
}

export async function symbolAt(
  source: string,
  file: string,
  line: number,
  col: number,
  modules?: Record<string, string>,
): Promise<RgSymbol | null> {
  const moduleMap =
    modules && Object.keys(modules).length > 0 ? modules : undefined
  if (isTauri()) {
    try {
      const info = await invoke<RgSymbol | null>('def_rosegold', {
        source,
        file,
        line,
        col,
        modules: moduleMap,
      })
      return info ?? null
    } catch (err) {
      console.warn('[rosegold-nav] tauri failed', err)
      return null
    }
  }
  return (await symbolAtWasm(source, file, line, col, moduleMap)) ?? null
}

export function scriptIdForSymbolFile(
  scripts: AssetItem[],
  file: string,
  currentId: string | null,
  currentName?: string,
): string | null {
  const stem = file.replace(/\.rg$/i, '').replace(/\\/g, '/').replace(/\//g, '.')
  if (currentName) {
    const curStem = currentName.replace(/\.rg$/i, '')
    if (file === currentName || stem === curStem) return currentId
  }
  const hit = scripts.find((s) => {
    const n = s.name || ''
    const nStem = n.replace(/\.rg$/i, '')
    const rel = (s.relativePath || n).replace(/\\/g, '/')
    const dotted = rel.replace(/\.rg$/i, '').replace(/\//g, '.')
    return (
      n === file ||
      nStem === stem ||
      nStem.toLowerCase() === stem.toLowerCase() ||
      dotted === stem ||
      dotted.toLowerCase() === stem.toLowerCase()
    )
  })
  return hit?.id ?? null
}

const CRATE_STDLIB = new Set([
  'math',
  'str',
  'checks',
  'option',
  'result',
  'vec',
  'node',
])

/** Stem for crate `stdlib/*.rg` (`math.rg` → `math`). */
export function crateStdlibStem(file: string): string | null {
  const stem = file.replace(/\.rg$/i, '').replace(/\\/g, '/').split('/').pop() ?? ''
  return CRATE_STDLIB.has(stem) ? stem : null
}

export function stdlibScriptId(stem: string): string {
  return `__stdlib_${stem}`
}

export async function stdlibSource(name: string): Promise<string | null> {
  if (isTauri()) {
    try {
      const src = await invoke<string | null>('stdlib_rosegold', { name })
      return src && src.length > 0 ? src : null
    } catch (err) {
      console.warn('[rosegold-nav] stdlib failed', err)
      return null
    }
  }
  const { stdlibSourceWasm } = await import('@/lib/rosegold-wasm')
  return stdlibSourceWasm(name)
}
