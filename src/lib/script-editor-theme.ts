import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

export const roseGoldHighlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--accent)' },
  { tag: t.definitionKeyword, color: 'var(--accent)' },
  { tag: t.controlKeyword, color: 'var(--accent)' },
  { tag: t.moduleKeyword, color: 'var(--accent)' },
  { tag: t.typeName, color: 'var(--accent-dim)' },
  { tag: t.standard(t.typeName), color: 'var(--accent-dim)' },
  { tag: t.string, color: 'var(--syntax-string)' },
  { tag: t.special(t.string), color: 'var(--syntax-string)' },
  { tag: t.number, color: 'var(--accent-warm)' },
  { tag: t.bool, color: 'var(--accent-warm)' },
  { tag: t.null, color: 'var(--accent-dim)' },
  { tag: t.atom, color: 'var(--accent-warm)' },
  { tag: t.comment, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: t.lineComment, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: t.blockComment, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: t.docComment, color: 'var(--accent-dim)', fontStyle: 'italic' },
  { tag: t.function(t.variableName), color: 'var(--syntax-function)' },
  { tag: t.definition(t.variableName), color: 'var(--syntax-function)', fontWeight: '500' },
  { tag: t.standard(t.variableName), color: 'var(--accent-soft)' },
  { tag: t.variableName, color: 'var(--text)' },
  { tag: t.operator, color: 'var(--text-muted)' },
  { tag: t.meta, color: 'var(--syntax-directive)' },
  { tag: t.punctuation, color: 'var(--text-muted)' },
  { tag: t.invalid, color: 'var(--danger)' },
])

export function scriptEditorTheme(dark: boolean) {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: 'var(--bg-input)',
        color: 'var(--text)',
        fontSize: '13px',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-scroller': {
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        lineHeight: '1.55',
        overflow: 'auto',
      },
      '.cm-content': {
        caretColor: 'var(--accent)',
        padding: '8px 0',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--accent)',
      },
      '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground':
        {
          backgroundColor: 'var(--select) !important',
        },
      '.cm-activeLine': {
        backgroundColor: 'color-mix(in srgb, var(--bg-hover) 70%, transparent)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'color-mix(in srgb, var(--bg-hover) 70%, transparent)',
        color: 'var(--text)',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--bg-panel)',
        color: 'var(--text-muted)',
        borderRight: '1px solid var(--border)',
      },
      '.cm-lineNumbers .cm-gutterElement': {
        minWidth: '2.4em',
        padding: '0 8px 0 6px',
      },
      '.cm-lintGutter': {
        width: '10px',
      },
      '.cm-matchingBracket': {
        backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent)',
        outline: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
      },
      '.cm-nonmatchingBracket': {
        backgroundColor: 'color-mix(in srgb, var(--danger) 22%, transparent)',
      },
      '.cm-panels': {
        backgroundColor: 'var(--bg-panel)',
        color: 'var(--text)',
      },
      '.cm-panels.cm-panels-top': {
        borderBottom: '1px solid var(--border)',
      },
      '.cm-panels.cm-panels-bottom': {
        borderTop: '1px solid var(--border)',
      },
      '.cm-searchMatch': {
        backgroundColor: 'color-mix(in srgb, var(--accent-warm) 35%, transparent)',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'color-mix(in srgb, var(--accent) 40%, transparent)',
      },
      '.cm-selectionMatch': {
        backgroundColor: 'color-mix(in srgb, var(--accent) 16%, transparent)',
      },
      '.cm-textfield': {
        backgroundColor: 'var(--bg-input)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: '12px',
        padding: '2px 6px',
      },
      '.cm-button': {
        backgroundColor: 'var(--bg-panel-raised)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontSize: '11px',
      },
      '.cm-panel.cm-search label': {
        fontSize: '11px',
        color: 'var(--text-muted)',
      },
      '.cm-tooltip': {
        zIndex: '40',
        backgroundColor: 'var(--bg-panel)',
        color: 'var(--text)',
        border: '1px solid var(--border-strong)',
        borderRadius: '6px',
        boxShadow: '0 12px 32px color-mix(in srgb, #000 45%, transparent)',
        overflow: 'hidden',
      },
      '.cm-tooltip.cm-tooltip-hover': {
        backgroundColor: 'var(--bg-panel)',
        color: 'var(--text)',
        border: '1px solid var(--border-strong)',
        borderRadius: '6px',
        padding: '0',
      },
      '.cm-rg-hover, .cm-rg-signature': {
        minWidth: '16rem',
        maxWidth: '22rem',
        padding: '0',
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontSize: '12px',
        lineHeight: '1.45',
      },
      '.cm-rg-hover-head': {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 10px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'color-mix(in srgb, var(--bg-panel-raised) 70%, transparent)',
      },
      '.cm-rg-hover-kind': {
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      },
      '.cm-rg-hover-meta': {
        marginLeft: 'auto',
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: '9px',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      },
      '.cm-rg-hover-sig': {
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: '12px',
        fontWeight: 500,
        color: 'var(--accent)',
        padding: '8px 10px 0',
      },
      '.cm-rg-hover-sig:last-child': {
        paddingBottom: '8px',
      },
      '.cm-rg-hover-doc': {
        color: 'var(--text-muted)',
        whiteSpace: 'pre-wrap',
        padding: '6px 10px 8px',
      },
      '.cm-rg-hover-hint': {
        padding: '6px 10px 8px',
        borderTop: '1px solid var(--border)',
        fontSize: '10px',
        color: 'var(--text-muted)',
      },
      '.cm-rg-signature': {
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: '12px',
        color: 'var(--text)',
      },
      '.cm-rg-sig-line': {
        padding: '8px 10px 8px',
      },
      '.cm-rg-sig-name': {
        color: 'var(--accent)',
      },
      '.cm-rg-sig-param': {
        color: 'var(--text-muted)',
      },
      '.cm-rg-sig-active': {
        color: 'var(--text)',
        fontWeight: 600,
        textDecoration: 'underline',
        textUnderlineOffset: '2px',
        textDecorationColor: 'var(--accent)',
      },
      '.cm-tooltip-autocomplete': {
        backgroundColor: 'var(--bg-panel)',
        color: 'var(--text)',
        border: '1px solid var(--border-strong)',
      },
      '.cm-tooltip-autocomplete > ul': {
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: '12px',
        minWidth: '14rem',
        maxHeight: '16rem',
        padding: '4px 0',
      },
      '.cm-tooltip-autocomplete > ul > li': {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px 3px 8px',
        lineHeight: '1.4',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'color-mix(in srgb, var(--accent) 16%, transparent)',
        color: 'var(--text)',
        boxShadow: 'inset 2px 0 0 var(--accent)',
      },
      '.cm-completionLabel': {
        color: 'var(--text)',
      },
      '.cm-completionDetail': {
        marginLeft: 'auto',
        paddingLeft: '12px',
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontSize: '9px',
        fontStyle: 'normal',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      },
      '.cm-completionMatchedText': {
        color: 'var(--accent)',
        textDecoration: 'none',
        fontWeight: 600,
      },
      '.cm-completionInfo': {
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontSize: '12px',
        padding: '0',
        maxWidth: '20rem',
        borderLeft: '1px solid var(--border)',
        backgroundColor: 'var(--bg-panel)',
        color: 'var(--text-muted)',
      },
      '.cm-completionInfo .cm-rg-hover': {
        minWidth: '14rem',
      },
      '.cm-snippetField': {
        backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)',
      },
      '.cm-completionIcon': {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        width: '1.35rem',
        height: '1.35rem',
        marginRight: '4px',
        padding: '0',
        borderRadius: '4px',
        border: '1px solid var(--border-strong)',
        backgroundColor: 'var(--bg-input)',
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontSize: '11px',
        fontWeight: 700,
        lineHeight: '1',
        letterSpacing: '0',
        opacity: '1',
        color: 'var(--accent)',
      },
      '.cm-completionIcon:after': {
        display: 'block',
        width: '100%',
        textAlign: 'center',
        lineHeight: '1',
        content: '"·"',
      },
      '.cm-completionIcon-function:after': { content: '"fn"' },
      '.cm-completionIcon-method:after': { content: '"mt"' },
      '.cm-completionIcon-keyword:after': { content: '"kw"' },
      '.cm-completionIcon-type:after': { content: '"ty"' },
      '.cm-completionIcon-class:after': { content: '"cl"' },
      '.cm-completionIcon-namespace:after': { content: '"ns"' },
      '.cm-completionIcon-variable:after': { content: '"va"' },
      '.cm-completionIcon-constant:after': { content: '"co"' },
      '.cm-completionIcon-snippet:after': { content: '"sn"' },
      '.cm-completionIcon-text:after': { content: '"tx"' },
      '.cm-completionIcon-property:after': { content: '"pr"' },
      '.cm-completionIcon-interface:after': { content: '"in"' },
      '.cm-completionIcon-enum:after': { content: '"em"' },
      '.cm-completionIcon-function': { color: 'var(--accent)' },
      '.cm-completionIcon-method': { color: 'var(--accent)' },
      '.cm-completionIcon-keyword': { color: 'var(--accent-dim)' },
      '.cm-completionIcon-type': { color: 'var(--accent-warm)' },
      '.cm-completionIcon-class': { color: 'var(--accent-warm)' },
      '.cm-completionIcon-namespace': { color: 'var(--accent)' },
      '.cm-completionIcon-variable': { color: 'var(--text)' },
      '.cm-completionIcon-constant': { color: 'var(--accent-warm)' },
      '.cm-completionIcon-snippet': { color: 'var(--accent-dim)' },
      '.cm-diagnostic': {
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontSize: '12px',
      },
      '.cm-diagnostic-error': {
        borderLeftColor: 'var(--danger)',
      },
      '.cm-diagnostic-warning': {
        borderLeftColor: 'var(--warn)',
      },
      '.cm-lintRange-error': {
        backgroundImage: 'none',
        textDecoration: 'underline wavy var(--danger)',
        textUnderlineOffset: '2px',
      },
      '.cm-lintRange-warning': {
        backgroundImage: 'none',
        textDecoration: 'underline wavy var(--warn)',
        textUnderlineOffset: '2px',
      },
      '.cm-lint-marker-error': {
        color: 'var(--danger)',
      },
      '.cm-lint-marker-warning': {
        color: 'var(--warn)',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: 'var(--bg-panel-raised)',
        color: 'var(--text-muted)',
        border: 'none',
      },
    },
    { dark },
  )
}

export const roseGoldHighlighting = syntaxHighlighting(roseGoldHighlight)
