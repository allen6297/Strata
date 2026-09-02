import { syntaxTree } from '@codemirror/language'
import { EditorSelection, type EditorState, type Text } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import type { NavContext } from '@/lib/rosegold-nav'
import { symbolAt } from '@/lib/rosegold-nav'
import { scanSource, type ScanKind } from '@/lib/rosegold-scan'

const IDENT = /[A-Za-z_]\w*/

export type LocalKind = ScanKind

export type LocalSymbol = {
  name: string
  kind: LocalKind
  from: number
  to: number
  line: number
  col: number
}

export function inStringOrComment(state: EditorState, pos: number): boolean {
  const node = syntaxTree(state).resolveInner(pos, -1)
  const name = node.name.toLowerCase()
  return name.includes('comment') || name.includes('string')
}

export function identAt(
  doc: Text,
  pos: number,
): { from: number; to: number; text: string } | null {
  const line = doc.lineAt(pos)
  const text = line.text
  let i = pos - line.from
  if (i > 0 && i === text.length) i -= 1
  if (i < 0 || i >= text.length || !/[A-Za-z0-9_]/.test(text[i]!)) {
    if (i > 0 && /[A-Za-z0-9_]/.test(text[i - 1]!)) i -= 1
    else return null
  }
  let start = i
  let end = i + 1
  while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1]!)) start -= 1
  while (end < text.length && /[A-Za-z0-9_]/.test(text[end]!)) end += 1
  const word = text.slice(start, end)
  if (!IDENT.test(word)) return null
  return { from: line.from + start, to: line.from + end, text: word }
}

export function moduleBefore(doc: Text, identFrom: number): string | null {
  if (identFrom < 1) return null
  const line = doc.lineAt(identFrom)
  const local = identFrom - line.from
  if (local < 1 || line.text[local - 1] !== '.') return null
  let start = local - 1
  while (start > 0 && /[A-Za-z0-9_]/.test(line.text[start - 1]!)) start -= 1
  const mod = line.text.slice(start, local - 1)
  return IDENT.test(mod) ? mod : null
}

export function scanLocalSymbols(doc: Text): LocalSymbol[] {
  const file = scanSource(doc.toString())
  return file.symbols.map((s) => {
    const line = doc.lineAt(s.from)
    return {
      name: s.name,
      kind: s.kind,
      from: s.from,
      to: s.to,
      line: line.number,
      col: s.from - line.from + 1,
    }
  })
}

export function outlineFns(doc: Text): LocalSymbol[] {
  return scanLocalSymbols(doc).filter((s) => s.kind === 'fn')
}

export function enclosingFn(
  fns: LocalSymbol[],
  pos: number,
): LocalSymbol | null {
  let current: LocalSymbol | null = null
  for (const fn of fns) {
    if (fn.from <= pos) current = fn
    else break
  }
  return current
}

/** Definition of the identifier at `pos` in this buffer. Not cross-file. */
export function defAt(state: EditorState, pos: number): LocalSymbol | null {
  if (inStringOrComment(state, pos)) return null
  const tok = identAt(state.doc, pos)
  if (!tok) return null
  if (moduleBefore(state.doc, tok.from)) return null
  const matches = scanLocalSymbols(state.doc).filter((s) => s.name === tok.text)
  return matches[0] ?? null
}

export function jumpToDef(view: EditorView, pos?: number): boolean {
  const dest = defAt(view.state, pos ?? view.state.selection.main.head)
  if (!dest) return false
  view.dispatch({
    selection: EditorSelection.cursor(dest.from),
    effects: EditorView.scrollIntoView(dest.from, { y: 'center' }),
  })
  return true
}

function queryRemote(view: EditorView, pos: number, getNav: () => NavContext) {
  const line = view.state.doc.lineAt(pos)
  const col = pos - line.from + 1
  const nav = getNav()
  void symbolAt(
    view.state.doc.toString(),
    nav.fileName,
    line.number,
    col,
    nav.modules,
  ).then((info) => {
    if (info) nav.onJump(info)
  })
}

export function roseGoldJump(getNav: () => NavContext) {
  return [
    keymap.of([
      {
        key: 'F12',
        run: (view) => {
          if (jumpToDef(view)) return true
          queryRemote(view, view.state.selection.main.head, getNav)
          return true
        },
      },
    ]),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (event.button !== 0) return false
        if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
          return false
        }
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos == null) return false
        if (jumpToDef(view, pos)) {
          event.preventDefault()
          return true
        }
        queryRemote(view, pos, getNav)
        event.preventDefault()
        return true
      },
    }),
  ]
}
