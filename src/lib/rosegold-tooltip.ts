/** Plain-text cards for hover / complete / signature. Docs are not markdown. */

import type { DocsEntry } from '@/lib/rosegold-docs'

export type DocCard = {
  kind?: string
  detail?: string
  signature: string
  doc?: string
  hint?: string
}

export function kindLabel(kind: string): string {
  switch (kind) {
    case 'function':
    case 'fn':
      return 'fn'
    case 'namespace':
      return 'module'
    case 'variable':
      return 'var'
    default:
      return kind
  }
}

function addText(parent: HTMLElement, className: string, text: string, tag = 'div') {
  const el = document.createElement(tag)
  el.className = className
  el.textContent = text
  parent.append(el)
}

/** Inspector-style card. All copy is `textContent` — no markdown. */
export function docCardDom(card: DocCard, testId = 'rg-hover'): HTMLElement {
  const root = document.createElement('div')
  root.className = 'cm-rg-hover'
  root.dataset.testid = testId

  if (card.kind || card.detail) {
    const head = document.createElement('div')
    head.className = 'cm-rg-hover-head'
    if (card.kind) addText(head, 'cm-rg-hover-kind', kindLabel(card.kind))
    if (card.detail) addText(head, 'cm-rg-hover-meta', card.detail)
    root.append(head)
  }

  addText(root, 'cm-rg-hover-sig', card.signature)

  const doc = card.doc?.trim()
  if (doc) addText(root, 'cm-rg-hover-doc', doc)

  if (card.hint) addText(root, 'cm-rg-hover-hint', card.hint)
  return root
}

export function docsCardInfo(entry: DocsEntry): () => HTMLElement {
  return () =>
    docCardDom(
      {
        kind: entry.kind,
        detail: entry.detail,
        signature: entry.signature,
        doc: entry.doc,
      },
      'rg-complete-info',
    )
}
