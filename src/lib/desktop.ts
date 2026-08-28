import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { downloadScene, parseSceneDocument } from '@/lib/scene'
import type { SceneDocument } from '@/types/scene'

export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  )
}

function sceneFileName(doc: SceneDocument): string {
  return doc.name.endsWith('.scene') ? doc.name : `${doc.name}.scene`
}

/** Save scene; returns filesystem path in Tauri, null in browser / cancel. */
export async function saveSceneFile(
  doc: SceneDocument,
  path: string | null,
): Promise<string | null> {
  const contents = JSON.stringify(doc, null, 2)

  if (!isTauri()) {
    downloadScene(doc)
    return null
  }

  let target = path
  if (!target) {
    const picked = await save({
      defaultPath: sceneFileName(doc),
      filters: [{ name: 'Strata Scene', extensions: ['scene', 'json'] }],
    })
    if (!picked) return null
    target = picked
  }

  await writeTextFile(target, contents)
  return target
}

/** Open via native dialog. Returns null in browser (use file input) or on cancel. */
export async function openSceneFile(): Promise<{
  doc: SceneDocument
  path: string
} | null> {
  if (!isTauri()) return null

  const selected = await open({
    multiple: false,
    filters: [{ name: 'Strata Scene', extensions: ['scene', 'json'] }],
  })
  if (!selected || Array.isArray(selected)) return null

  const text = await readTextFile(selected)
  const doc = parseSceneDocument(JSON.parse(text) as unknown)
  return { doc, path: selected }
}
