import type { AssetItem } from '@/types/scene'

export type ScriptLogLocation = {
  line: number
  col: number
  file?: string
  entity?: string
}

export type PlayLogPart =
  | { kind: 'text'; text: string }
  | { kind: 'loc'; text: string; loc: ScriptLogLocation }

/** `Hero.rg:7:11` · `runtime error at 7:11` · `type error at 4:1` · `at 3:5` */
const LOCATION_RE =
  /(?:([\w./\\-]+\.rg):|(?:runtime|type|parse) error at |\berror at |\bat )(\d+):(\d+)/g

function entityOnLine(text: string, index: number): string | undefined {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1
  const lineEnd = text.indexOf('\n', index)
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd)
  return line.match(/\[script error ([^\]]+)\]/)?.[1]
}

export function splitPlayLog(text: string): PlayLogPart[] {
  if (!text) return []
  const re = new RegExp(LOCATION_RE.source, 'g')
  const parts: PlayLogPart[] = []
  let last = 0
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0
    if (index > last) {
      parts.push({ kind: 'text', text: text.slice(last, index) })
    }
    const file = match[1] || undefined
    const line = Number(match[2])
    const col = Number(match[3])
    parts.push({
      kind: 'loc',
      text: match[0],
      loc: {
        line,
        col,
        file,
        entity: entityOnLine(text, index),
      },
    })
    last = index + match[0].length
  }
  if (last < text.length) {
    parts.push({ kind: 'text', text: text.slice(last) })
  }
  return parts
}

export function resolveScriptIdForLocation(
  loc: ScriptLogLocation,
  scripts: AssetItem[],
  entities: { name: string; scriptId: string | null }[],
  fallbackId: string | null,
): string | null {
  if (loc.file) {
    const base = loc.file.replace(/\\/g, '/').split('/').pop() ?? loc.file
    const match = scripts.find(
      (s) =>
        s.name === loc.file ||
        s.name === base ||
        s.relativePath === loc.file ||
        s.relativePath?.endsWith(`/${base}`),
    )
    if (match) return match.id
  }
  if (loc.entity) {
    const ent = entities.find((e) => e.name === loc.entity)
    if (ent?.scriptId) return ent.scriptId
  }
  return fallbackId
}
