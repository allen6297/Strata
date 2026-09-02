import { StateField, type EditorState } from '@codemirror/state'
import {
  hoverTooltip,
  showTooltip,
  type EditorView,
  type Tooltip,
} from '@codemirror/view'
import { lookupDocs, type DocsEntry } from '@/lib/rosegold-docs'
import type { NavContext, RgSymbol } from '@/lib/rosegold-nav'
import { docCardDom, type DocCard } from '@/lib/rosegold-tooltip'
import { symbolAt } from '@/lib/rosegold-nav'
import {
  defAt,
  identAt,
  inStringOrComment,
  moduleBefore,
} from '@/lib/rosegold-symbols'

function docsAt(state: EditorState, pos: number): {
  entry: DocsEntry
  from: number
  to: number
} | null {
  if (inStringOrComment(state, pos)) return null
  const tok = identAt(state.doc, pos)
  if (!tok) return null
  const mod = moduleBefore(state.doc, tok.from)
  if (mod) {
    const entry = lookupDocs(`${mod}.${tok.text}`)
    if (entry) {
      return {
        entry,
        from: tok.from - mod.length - 1,
        to: tok.to,
      }
    }
  }
  const own = lookupDocs(tok.text)
  if (own) return { entry: own, from: tok.from, to: tok.to }
  return null
}

function hoverTip(from: number, to: number, card: DocCard): Tooltip {
  return {
    pos: from,
    end: to,
    above: false,
    clip: false,
    create() {
      return { dom: docCardDom(card) }
    },
  }
}

function jumpMod(): string {
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl'
}

function hoverSource(
  view: EditorView,
  pos: number,
  getNav: () => NavContext,
): Tooltip | null | Promise<Tooltip | null> {
  const hit = docsAt(view.state, pos)
  if (hit) {
    const { entry, from, to } = hit
    return hoverTip(from, to, {
      kind: entry.kind,
      detail: entry.detail,
      signature: entry.signature,
      doc: entry.doc,
    })
  }
  const tok = identAt(view.state.doc, pos)
  if (!tok || inStringOrComment(view.state, pos)) return null
  const line = view.state.doc.lineAt(tok.from)
  const col = tok.from - line.from + 1
  const nav = getNav()
  return symbolAt(
    view.state.doc.toString(),
    nav.fileName,
    line.number,
    col,
    nav.modules,
  ).then((info) => {
    if (info) return symbolHover(tok, info)
    const local = defAt(view.state, pos)
    if (!local) return null
    return hoverTip(tok.from, tok.to, {
      kind: local.kind,
      detail: 'in file',
      signature: `${local.kind} ${local.name}`,
      hint: `Line ${local.line}. ${jumpMod()}-click or F12 jumps here.`,
    })
  })
}

function symbolHover(
  tok: { from: number; to: number },
  info: RgSymbol,
): Tooltip {
  const loc =
    info.kind === 'module'
      ? `Opens ${info.file}. ${jumpMod()}-click or F12 jumps there.`
      : `Defined in ${info.file}. ${jumpMod()}-click or F12 jumps there.`
  return hoverTip(tok.from, tok.to, {
    kind: info.kind,
    detail: info.file,
    signature: info.signature,
    doc: info.doc?.trim() || undefined,
    hint: loc,
  })
}

export function roseGoldHover(getNav: () => NavContext) {
  return [
    hoverTooltip((view, pos) => hoverSource(view, pos, getNav), {
      hoverTime: 320,
      hideOnChange: true,
    }),
    signatureHelpField,
  ]
}

type CallSite = {
  entry: DocsEntry
  argIndex: number
  from: number
}

function skipStringBack(text: string, i: number): number {
  const q = text[i]
  if (q !== '"' && q !== "'") return i
  i -= 1
  while (i >= 0) {
    if (text[i] === q && (i === 0 || text[i - 1] !== '\\')) return i - 1
    i -= 1
  }
  return i
}

export function callSiteAt(state: EditorState, pos: number): CallSite | null {
  if (inStringOrComment(state, pos)) return null
  const start = Math.max(0, pos - 400)
  const slice = state.doc.sliceString(start, pos)
  let depth = 0
  let argIndex = 0
  for (let i = slice.length - 1; i >= 0; i -= 1) {
    const ch = slice[i]!
    if (ch === '"' || ch === "'") {
      i = skipStringBack(slice, i)
      continue
    }
    if (ch === ')' || ch === '}' || ch === ']') {
      depth += 1
      continue
    }
    if (ch === '(' || ch === '{' || ch === '[') {
      if (depth > 0) {
        depth -= 1
        continue
      }
      if (ch !== '(') return null
      let end = i
      while (end > 0 && /\s/.test(slice[end - 1]!)) end -= 1
      let nameStart = end
      while (nameStart > 0 && /[A-Za-z0-9_]/.test(slice[nameStart - 1]!)) {
        nameStart -= 1
      }
      const name = slice.slice(nameStart, end)
      if (!/^[A-Za-z_]\w*$/.test(name)) return null
      let key = name
      let from = start + nameStart
      if (nameStart > 0 && slice[nameStart - 1] === '.') {
        let modEnd = nameStart - 1
        let modStart = modEnd
        while (modStart > 0 && /[A-Za-z0-9_]/.test(slice[modStart - 1]!)) {
          modStart -= 1
        }
        const mod = slice.slice(modStart, modEnd)
        if (/^[A-Za-z_]\w*$/.test(mod)) {
          key = `${mod}.${name}`
          from = start + modStart
        }
      }
      const entry = lookupDocs(key)
      if (!entry?.params?.length) return null
      return { entry, argIndex, from }
    }
    if (ch === ',' && depth === 0) argIndex += 1
  }
  return null
}

function signatureDom(site: CallSite): HTMLElement {
  const { entry, argIndex } = site
  const root = document.createElement('div')
  root.className = 'cm-rg-signature'
  root.dataset.testid = 'rg-signature'
  const head = document.createElement('div')
  head.className = 'cm-rg-hover-head'
  const kind = document.createElement('div')
  kind.className = 'cm-rg-hover-kind'
  kind.textContent = 'call'
  head.append(kind)
  root.append(head)
  const line = document.createElement('div')
  line.className = 'cm-rg-sig-line'
  const name = document.createElement('span')
  name.className = 'cm-rg-sig-name'
  name.textContent = `${entry.key}(`
  line.append(name)
  const params = entry.params ?? []
  params.forEach((p, i) => {
    if (i > 0) {
      const comma = document.createElement('span')
      comma.textContent = ', '
      line.append(comma)
    }
    const span = document.createElement('span')
    span.className = i === argIndex ? 'cm-rg-sig-param cm-rg-sig-active' : 'cm-rg-sig-param'
    span.textContent = p
    line.append(span)
  })
  const close = document.createElement('span')
  close.textContent = ')'
  line.append(close)
  root.append(line)
  if (entry.doc.trim()) {
    const doc = document.createElement('div')
    doc.className = 'cm-rg-hover-doc'
    doc.textContent = entry.doc
    root.append(doc)
  }
  return root
}

function signatureTooltip(state: EditorState): Tooltip | null {
  const pos = state.selection.main.head
  const site = callSiteAt(state, pos)
  if (!site) return null
  return {
    pos: site.from,
    above: false,
    clip: false,
    create() {
      const wrap = document.createElement('div')
      wrap.append(signatureDom(site))
      let current = site
      return {
        dom: wrap,
        update(update) {
          const next = callSiteAt(update.state, update.state.selection.main.head)
          if (!next) return
          if (
            next.entry.key === current.entry.key &&
            next.argIndex === current.argIndex
          ) {
            return
          }
          current = next
          wrap.replaceChildren(signatureDom(next))
        },
      }
    },
  }
}

const signatureHelpField = StateField.define<Tooltip | null>({
  create: signatureTooltip,
  update(value, tr) {
    if (!tr.docChanged && !tr.selection) return value
    return signatureTooltip(tr.state)
  },
  provide: (field) => showTooltip.from(field),
})

export { docsAt }
