import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/desktop'
import { listExportsWasm } from '@/lib/rosegold-wasm'

export type RgExportField = {
  name: string
  ty: string
  group: string | null
  default: string | number | boolean | null
  doc?: string | null
}

export async function listRoseGoldExports(
  source: string,
): Promise<RgExportField[]> {
  if (!source.trim()) return []
  if (isTauri()) {
    try {
      const fields = await invoke<RgExportField[]>('list_rosegold_exports', {
        source,
      })
      return Array.isArray(fields) ? fields : []
    } catch (err) {
      console.warn('[rosegold-exports] tauri failed', err)
      return []
    }
  }
  return (await listExportsWasm(source)) ?? []
}

export function groupExportFields(
  fields: RgExportField[],
): { title: string; fields: RgExportField[] }[] {
  const groups: { title: string; fields: RgExportField[] }[] = []
  const index = new Map<string, number>()
  for (const field of fields) {
    const title = field.group?.trim() || 'Exports'
    let i = index.get(title)
    if (i === undefined) {
      i = groups.length
      index.set(title, i)
      groups.push({ title, fields: [] })
    }
    groups[i].fields.push(field)
  }
  return groups
}
