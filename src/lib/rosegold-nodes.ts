import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/desktop'
import { listNodesWasm } from '@/lib/rosegold-wasm'
import type { EntityKind } from '@/types/scene'

export type RgNodeClass = {
  name: string
  parent: string
  kind: EntityKind
  doc?: string | null
}

export type ScriptNodeDef = RgNodeClass & {
  scriptId: string
  scriptPath: string
}

export async function listRoseGoldNodes(
  source: string,
): Promise<RgNodeClass[]> {
  if (!source.trim()) return []
  if (isTauri()) {
    try {
      const fields = await invoke<RgNodeClass[]>('list_rosegold_nodes', {
        source,
      })
      return Array.isArray(fields)
        ? fields.map((n) => ({ ...n, kind: asEntityKind(n.kind) }))
        : []
    } catch (err) {
      console.warn('[rosegold-nodes] tauri failed', err)
      return []
    }
  }
  return (await listNodesWasm(source))?.map((n) => ({
    ...n,
    kind: asEntityKind(n.kind),
  })) ?? []
}

export function asEntityKind(kind: string): EntityKind {
  switch (kind) {
    case 'tilemap':
    case 'empty':
    case 'camera':
    case 'mesh':
    case 'light':
    case 'script':
    case 'sprite':
      return kind
    default:
      return 'sprite'
  }
}
