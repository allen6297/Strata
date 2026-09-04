import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  toggleComment,
} from '@codemirror/commands'
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
} from '@codemirror/language'
import {
  lintGutter,
  setDiagnostics,
  type Diagnostic,
} from '@codemirror/lint'
import { gotoLine, highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import {
  EditorSelection,
  Compartment,
  EditorState,
  Prec,
  Transaction,
} from '@codemirror/state'
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
  tooltips,
} from '@codemirror/view'
import { isWarningDiag, type RgDiagnostic } from '@/lib/rosegold-check'
import { completeRoseGold } from '@/lib/rosegold-complete'
import { roseGoldHover } from '@/lib/rosegold-hover'
import { roseGoldLanguage } from '@/lib/rosegold-language'
import type { RgSymbol } from '@/lib/rosegold-nav'
import {
  enclosingFn,
  outlineFns,
  roseGoldJump,
  type LocalSymbol,
} from '@/lib/rosegold-symbols'
import {
  getScriptSession,
  setScriptSession,
  type ScriptReveal,
} from '@/lib/script-editor-session'
import {
  roseGoldHighlighting,
  scriptEditorTheme,
} from '@/lib/script-editor-theme'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

interface ScriptEditorProps {
  scriptId: string
  fileName?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  onRun?: () => void
  diagnostics?: RgDiagnostic[]
  diagnosticsReady?: boolean
  reveal?: ScriptReveal | null
  modules?: Record<string, string>
  fontSize?: number
  onJumpSymbol?: (info: RgSymbol) => void
}

function posAt(state: EditorState, line: number, col: number): number {
  const n = Math.min(Math.max(line, 1), state.doc.lines)
  const info = state.doc.line(n)
  return Math.min(info.from + Math.max(col - 1, 0), info.to)
}

function tokenRange(
  state: EditorState,
  line: number,
  col: number,
): { from: number; to: number } {
  const n = Math.min(Math.max(line, 1), state.doc.lines)
  const info = state.doc.line(n)
  const from = Math.min(info.from + Math.max(col - 1, 0), info.to)
  const text = info.text
  let i = Math.max(col - 1, 0)
  if (i < text.length && /[A-Za-z0-9_]/.test(text[i]!)) {
    while (i < text.length && /[A-Za-z0-9_]/.test(text[i]!)) i += 1
    return { from, to: info.from + i }
  }
  let to = Math.min(from + 1, info.to)
  if (to <= from) {
    if (from > info.from) return { from: from - 1, to: from }
    to = Math.min(from + 1, state.doc.length)
  }
  return { from, to }
}

function toCmDiagnostics(
  state: EditorState,
  diags: RgDiagnostic[],
): Diagnostic[] {
  return diags.map((d) => {
    const { from, to } = tokenRange(state, d.line, d.col)
    return {
      from,
      to: Math.max(to, from),
      severity: (isWarningDiag(d) ? 'warning' : 'error') as Diagnostic['severity'],
      message: `${isWarningDiag(d) ? 'warning' : 'error'} at ${d.line}:${d.col}: ${d.message}`,
      source: 'rosegold',
    }
  })
}

function revealPos(view: EditorView, line: number, col: number) {
  const pos = posAt(view.state, line, col)
  view.dispatch({
    selection: EditorSelection.cursor(pos),
    effects: EditorView.scrollIntoView(pos, { y: 'center' }),
  })
  view.focus()
  return pos
}

function useDarkTheme() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute('data-theme') !== 'light',
  )
  useEffect(() => {
    const el = document.documentElement
    const sync = () =>
      setDark(el.getAttribute('data-theme') !== 'light')
    const obs = new MutationObserver(sync)
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

export function ScriptEditor({
  scriptId,
  fileName = 'script.rg',
  value,
  onChange,
  disabled,
  onRun,
  diagnostics = [],
  diagnosticsReady = false,
  reveal = null,
  modules = {},
  fontSize = 13,
  onJumpSymbol,
}: ScriptEditorProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onRunRef = useRef(onRun)
  const valueRef = useRef(value)
  const applyingExternal = useRef(false)
  const navRef = useRef({
    fileName,
    modules,
    onJump: (_info: RgSymbol) => {},
  })
  const readOnlyComp = useRef(new Compartment())
  const themeComp = useRef(new Compartment())
  const dark = useDarkTheme()
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [fns, setFns] = useState<LocalSymbol[]>([])
  const [problemsOpen, setProblemsOpen] = useState(true)
  const diagCycle = useRef(-1)

  onChangeRef.current = onChange
  onRunRef.current = onRun
  valueRef.current = value
  navRef.current.fileName = fileName
  navRef.current.modules = modules
  navRef.current.onJump = (info) => {
    const view = viewRef.current
    const same =
      fileName.replace(/\.rg$/i, '') === info.file.replace(/\.rg$/i, '')
    if (same && view) {
      const pos = revealPos(view, info.line, info.col)
      const line = view.state.doc.lineAt(pos)
      setCursor({ line: line.number, col: pos - line.from + 1 })
      return
    }
    onJumpSymbol?.(info)
  }

  useEffect(() => {
    const parent = parentRef.current
    if (!parent) return

    const runKey = {
      key: 'Mod-Enter',
      run: () => {
        onRunRef.current?.()
        return true
      },
    }

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          history(),
          indentOnInput(),
          indentUnit.of('  '),
          bracketMatching(),
          closeBrackets(),
          lintGutter(),
          search({ top: true }),
          highlightSelectionMatches(),
          roseGoldLanguage,
          roseGoldHighlighting,
          tooltips({
            tooltipSpace(view) {
              const rect = view.dom.getBoundingClientRect()
              return {
                top: rect.top + 8,
                left: rect.left + 8,
                bottom: rect.bottom - 8,
                right: rect.right - 8,
              }
            },
          }),
          autocompletion({
            override: [
              (context) => completeRoseGold(context, navRef.current.modules),
            ],
            activateOnTyping: true,
            optionClass: (c) => (c.type ? `cm-rg-opt-${c.type}` : ''),
          }),
          roseGoldHover(() => navRef.current),
          roseGoldJump(() => navRef.current),
          themeComp.current.of(scriptEditorTheme(dark, fontSize)),
          readOnlyComp.current.of(EditorState.readOnly.of(!!disabled)),
          EditorView.editorAttributes.of({
            'data-testid': 'script-editor',
            class: 'script-cm',
          }),
          Prec.high(
            keymap.of([
              { key: 'Tab', run: acceptCompletion },
              { key: 'Mod-g', run: gotoLine },
              ...completionKeymap,
            ]),
          ),
          keymap.of([
            runKey,
            { key: 'Mod-/', run: toggleComment },
            indentWithTab,
            ...closeBracketsKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applyingExternal.current) {
              onChangeRef.current(update.state.doc.toString())
            }
            if (update.docChanged || update.selectionSet) {
              const head = update.state.selection.main.head
              const line = update.state.doc.lineAt(head)
              setCursor({
                line: line.number,
                col: head - line.from + 1,
              })
            }
            if (update.docChanged) {
              setFns(outlineFns(update.state.doc))
            }
          }),
        ],
      }),
    })
    viewRef.current = view
    setFns(outlineFns(view.state.doc))
    const session = getScriptSession(scriptId)
    // Cross-file jump sets `reveal` before remount; don't restore the old
    // caret/scroll or it undoes scrollIntoView on the next frame.
    const honorReveal = reveal?.scriptId === scriptId
    if (session && !honorReveal) {
      const len = view.state.doc.length
      const anchor = Math.min(Math.max(session.anchor, 0), len)
      const head = Math.min(Math.max(session.head, 0), len)
      view.dispatch({
        selection: EditorSelection.create([EditorSelection.range(anchor, head)]),
      })
      requestAnimationFrame(() => {
        view.scrollDOM.scrollTop = session.scrollTop
        view.scrollDOM.scrollLeft = session.scrollLeft
      })
      const line = view.state.doc.lineAt(head)
      setCursor({ line: line.number, col: head - line.from + 1 })
    }
    view.focus()
    return () => {
      const sel = view.state.selection.main
      setScriptSession(scriptId, {
        anchor: sel.anchor,
        head: sel.head,
        scrollTop: view.scrollDOM.scrollTop,
        scrollLeft: view.scrollDOM.scrollLeft,
      })
      view.destroy()
      viewRef.current = null
    }
  }, [scriptId])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.state.doc.toString() !== value) {
      applyingExternal.current = true
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: [Transaction.addToHistory.of(false)],
      })
      applyingExternal.current = false
    }
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: readOnlyComp.current.reconfigure(
        EditorState.readOnly.of(!!disabled),
      ),
    })
  }, [disabled])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: themeComp.current.reconfigure(scriptEditorTheme(dark, fontSize)),
    })
  }, [dark, fontSize])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch(setDiagnostics(view.state, toCmDiagnostics(view.state, diagnostics)))
  }, [diagnostics])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !reveal || reveal.scriptId !== scriptId) return
    const pos = revealPos(view, reveal.line, reveal.col)
    const line = view.state.doc.lineAt(pos)
    setCursor({ line: line.number, col: pos - line.from + 1 })
  }, [reveal, scriptId])

  const errors = diagnostics.filter((d) => !isWarningDiag(d))
  const warnings = diagnostics.filter(isWarningDiag)

  const jumpToDiag = (items: RgDiagnostic[]) => {
    const view = viewRef.current
    if (!view || !items.length) return
    diagCycle.current = (diagCycle.current + 1) % items.length
    const d = items[diagCycle.current]!
    const pos = revealPos(view, d.line, d.col)
    const line = view.state.doc.lineAt(pos)
    setCursor({ line: line.number, col: pos - line.from + 1 })
  }

  const firstError = errors[0]
  const viewPos = viewRef.current
    ? posAt(viewRef.current.state, cursor.line, cursor.col)
    : 0
  const currentFn = enclosingFn(fns, viewPos)

  const goTo = (line: number, col: number) => {
    const view = viewRef.current
    if (!view) return
    const pos = revealPos(view, line, col)
    const info = view.state.doc.lineAt(pos)
    setCursor({ line: info.number, col: pos - info.from + 1 })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={parentRef} className="min-h-0 min-w-0 flex-1 overflow-hidden" />
      {diagnostics.length > 0 ? (
        <details
          open={problemsOpen}
          onToggle={(e) =>
            setProblemsOpen((e.currentTarget as HTMLDetailsElement).open)
          }
          data-testid="script-problems"
          className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-panel)]"
        >
          <summary className="cursor-pointer px-3 py-1 font-mono text-[10px] text-[var(--text-muted)]">
            Problems · {errors.length}{' '}
            {errors.length === 1 ? 'error' : 'errors'}
            {warnings.length > 0
              ? ` · ${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`
              : ''}
          </summary>
          <ul className="max-h-[7.5rem] overflow-y-auto border-t border-[var(--border)]">
            {diagnostics.map((d, i) => (
              <li key={`${d.line}:${d.col}:${i}`}>
                <button
                  type="button"
                  data-testid="script-problem"
                  data-line={d.line}
                  data-col={d.col}
                  className={cn(
                    'flex w-full items-baseline gap-2 px-3 py-0.5 text-left font-mono text-[10px] hover:bg-[var(--bg-hover)]',
                    isWarningDiag(d)
                      ? 'text-[var(--warn)]'
                      : 'text-[var(--danger)]',
                  )}
                  onClick={() => goTo(d.line, d.col)}
                >
                  <span className="shrink-0 opacity-70">
                    {d.line}:{d.col}
                  </span>
                  <span className="min-w-0 truncate">{d.message}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div
        className="flex h-6 shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--bg-panel)] px-3 text-[10px] text-[var(--text-muted)]"
        data-testid="script-status"
      >
        <span className="font-mono">
          Ln {cursor.line}, Col {cursor.col}
        </span>
        {fns.length > 0 ? (
          <select
            data-testid="script-outline"
            aria-label="Functions in this file"
            className="h-5 max-w-[10rem] truncate border-0 bg-transparent font-mono text-[10px] text-[var(--text-muted)] outline-none"
            value={
              currentFn
                ? `${currentFn.line}:${currentFn.col}`
                : `${fns[0]!.line}:${fns[0]!.col}`
            }
            onChange={(e) => {
              const [ln, col] = e.target.value.split(':').map(Number)
              if (ln && col) goTo(ln, col)
            }}
          >
            {fns.map((fn) => (
              <option
                key={`${fn.line}:${fn.col}:${fn.name}`}
                value={`${fn.line}:${fn.col}`}
              >
                {fn.name}
              </option>
            ))}
          </select>
        ) : null}
        <span className="font-mono">{value.length} chars</span>
        <span className="font-mono">RoseGold</span>
        <span className="font-mono">spaces:2</span>
        {errors.length > 0 ? (
          <button
            type="button"
            data-testid="script-diag-errors"
            title="Go to next error"
            className="font-mono text-[var(--danger)] hover:underline"
            onClick={() => jumpToDiag(errors)}
          >
            {errors.length} {errors.length === 1 ? 'error' : 'errors'}
          </button>
        ) : null}
        {warnings.length > 0 ? (
          <button
            type="button"
            data-testid="script-diag-warnings"
            title="Go to next warning"
            className="font-mono text-[var(--warn)] hover:underline"
            onClick={() => jumpToDiag(warnings)}
          >
            {warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}
          </button>
        ) : null}
        {diagnostics.length === 0 && diagnosticsReady ? (
          <span className="font-mono" data-testid="script-diag-clean">
            No problems
          </span>
        ) : null}
        {firstError ? (
          <button
            type="button"
            data-testid="script-diag-first"
            className="min-w-0 truncate font-mono text-[var(--danger)] hover:underline"
            title={`${firstError.line}:${firstError.col}: ${firstError.message}`}
            onClick={() => goTo(firstError.line, firstError.col)}
          >
            {firstError.line}:{firstError.col}: {firstError.message}
          </button>
        ) : null}
        <span className="ml-auto font-mono">
          {`${isMac ? 'Cmd' : 'Ctrl'}-click / F12 def · ${isMac ? 'Cmd' : 'Ctrl'}+G line`}
          {onRun ? ` · ${isMac ? 'Cmd' : 'Ctrl'}+Enter to run` : ''}
        </span>
      </div>
    </div>
  )
}
