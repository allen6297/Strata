import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/desktop'
import { listFnsWasm, listSignalsWasm } from '@/lib/rosegold-wasm'

export type RgSignalParam = {
  name: string
  ty: string
}

export type RgSignalField = {
  name: string
  params: RgSignalParam[]
}

export type RgFnMeta = {
  name: string
  params: RgSignalParam[]
}

export async function listRoseGoldSignals(
  source: string,
  modules?: Record<string, string>,
): Promise<RgSignalField[]> {
  if (!source.trim()) return []
  const moduleMap =
    modules && Object.keys(modules).length > 0 ? modules : undefined
  if (isTauri()) {
    try {
      const fields = await invoke<RgSignalField[]>('list_rosegold_signals', {
        source,
        modules: moduleMap,
      })
      return Array.isArray(fields) ? fields : []
    } catch (err) {
      console.warn('[rosegold-signals] tauri failed', err)
      return []
    }
  }
  return (await listSignalsWasm(source, moduleMap)) ?? []
}

export async function listRoseGoldFns(source: string): Promise<RgFnMeta[]> {
  if (!source.trim()) return []
  if (isTauri()) {
    try {
      const fields = await invoke<RgFnMeta[]>('list_rosegold_fns', { source })
      return Array.isArray(fields) ? fields : []
    } catch (err) {
      console.warn('[rosegold-fns] tauri failed', err)
      return []
    }
  }
  return (await listFnsWasm(source)) ?? []
}

export function signalSignature(field: RgSignalField): string {
  const params = field.params.map((p) => `${p.name}: ${p.ty}`).join(', ')
  return `${field.name}(${params})`
}
