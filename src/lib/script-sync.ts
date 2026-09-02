import type { AssetItem } from '@/types/scene'

export function scriptFileKey(
  s: Pick<AssetItem, 'path' | 'relativePath' | 'name'>,
): string {
  return (s.relativePath || s.path || s.name).replace(/\\/g, '/').toLowerCase()
}

export function isScriptDirty(
  s: AssetItem,
  savedContents: Record<string, string>,
): boolean {
  return (s.content ?? '') !== (savedContents[s.id] ?? '')
}

/** Pull disk `.rg` into memory. Skip buffers with unsaved Strata edits. */
export function mergeDiskScripts(
  current: AssetItem[],
  disk: AssetItem[],
  savedContents: Record<string, string>,
): {
  scripts: AssetItem[]
  savedContents: Record<string, string>
  reloaded: string[]
  removed: string[]
} {
  const saved = { ...savedContents }
  const reloaded: string[] = []
  const removed: string[] = []
  const used = new Set<string>()
  const byKey = new Map<string, AssetItem>()
  for (const s of current) {
    byKey.set(scriptFileKey(s), s)
  }

  const next: AssetItem[] = []
  for (const d of disk) {
    const cur = byKey.get(scriptFileKey(d))
    if (!cur) {
      next.push(d)
      saved[d.id] = d.content ?? ''
      reloaded.push(d.name)
      continue
    }
    used.add(cur.id)
    if (isScriptDirty(cur, savedContents)) {
      next.push(cur)
      continue
    }
    const diskText = d.content ?? ''
    if (diskText !== (cur.content ?? '')) {
      next.push({
        ...cur,
        name: d.name,
        content: diskText,
        size: d.size,
        bytes: d.bytes,
        path: d.path ?? cur.path,
        relativePath: d.relativePath ?? cur.relativePath,
      })
      saved[cur.id] = diskText
      reloaded.push(cur.name)
    } else {
      next.push(cur)
    }
  }

  for (const s of current) {
    if (used.has(s.id)) continue
    if (isScriptDirty(s, savedContents) || !s.path) {
      next.push(s)
      continue
    }
    removed.push(s.name)
    delete saved[s.id]
  }

  return { scripts: next, savedContents: saved, reloaded, removed }
}
