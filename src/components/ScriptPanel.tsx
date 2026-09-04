import { Button } from '@/components/ui/button'
import { ScriptEditor } from '@/components/ScriptEditor'
import { checkRoseGold, siblingRoseGoldModules, type RgDiagnostic } from '@/lib/rosegold-check'
import type { RgSymbol } from '@/lib/rosegold-nav'
import {
  crateStdlibStem,
  scriptIdForSymbolFile,
  stdlibScriptId,
  stdlibSource,
} from '@/lib/rosegold-nav'
import type { ScriptReveal } from '@/lib/script-editor-session'
import { cn } from '@/lib/utils'
import type { AssetItem } from '@/types/scene'
import { FileCode2, Play, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

interface ScriptPanelProps {
  scripts: AssetItem[]
  openIds: string[]
  activeId: string | null
  savedContents: Record<string, string>
  attachedEntities: string[]
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onChangeContent: (id: string, content: string) => void
  onCreateScript: () => void
  onRunScript?: (script: AssetItem) => void
  reveal?: ScriptReveal | null
  onJumpSymbol?: (scriptId: string, line: number, col: number) => void
  fontSize?: number
}

export function ScriptPanel({
  scripts,
  openIds,
  activeId,
  savedContents,
  attachedEntities,
  onSelectTab,
  onCloseTab,
  onChangeContent,
  onCreateScript,
  onRunScript,
  reveal = null,
  onJumpSymbol,
  fontSize,
}: ScriptPanelProps) {
  const [diagnostics, setDiagnostics] = useState<Record<string, RgDiagnostic[]>>(
    {},
  )
  const [crateTabs, setCrateTabs] = useState<AssetItem[]>([])
  const [crateActiveId, setCrateActiveId] = useState<string | null>(null)
  const [crateReveal, setCrateReveal] = useState<ScriptReveal | null>(null)
  const checkedIdRef = useRef('')

  const openScripts = useMemo(() => {
    const project = openIds
      .map((id) => scripts.find((s) => s.id === id))
      .filter((s): s is AssetItem => Boolean(s))
    const crate = crateTabs.filter((s) => !project.some((p) => p.id === s.id))
    return [...project, ...crate]
  }, [openIds, scripts, crateTabs])
  const script =
    (crateActiveId
      ? crateTabs.find((s) => s.id === crateActiveId)
      : null) ??
    openScripts.find((s) => s.id === activeId) ??
    null
  const isCrate = (id: string) => id.startsWith('__stdlib_')
  const selectTab = (id: string) => {
    if (isCrate(id)) {
      setCrateActiveId(id)
      return
    }
    setCrateActiveId(null)
    onSelectTab(id)
  }
  const closeTab = (id: string) => {
    if (isCrate(id)) {
      setCrateTabs((prev) => prev.filter((t) => t.id !== id))
      setCrateActiveId((cur) => (cur === id ? null : cur))
      return
    }
    onCloseTab(id)
  }
  const language = script?.language ?? 'rosegold'
  const canRun = Boolean(script && onRunScript && !isCrate(script.id))

  useEffect(() => {
    const content = script?.content ?? ''
    const name = script?.name ?? 'script.rg'
    const scriptId = script?.id ?? ''
    if (!scriptId) return
    if (isCrate(scriptId)) {
      setDiagnostics((prev) =>
        Object.prototype.hasOwnProperty.call(prev, scriptId)
          ? prev
          : { ...prev, [scriptId]: [] },
      )
      return
    }
    if (!content.trim()) {
      setDiagnostics((prev) =>
        prev[scriptId]?.length ? { ...prev, [scriptId]: [] } : prev,
      )
      return
    }
    const modules = siblingRoseGoldModules(scripts, script?.id)
    let cancelled = false
    const delay = checkedIdRef.current === scriptId ? 400 : 50
    const timer = window.setTimeout(() => {
      void checkRoseGold(content, name, modules).then((items) => {
        if (cancelled) return
        checkedIdRef.current = scriptId
        setDiagnostics((prev) => ({ ...prev, [scriptId]: items }))
      })
    }, delay)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [script?.id, script?.content, script?.name, scripts])

  const shownDiagnostics =
    script?.content?.trim() && script.id
      ? (diagnostics[script.id] ?? [])
      : []
  const diagnosticsReady = Boolean(
    script && Object.prototype.hasOwnProperty.call(diagnostics, script.id),
  )

  return (
    <section className="panel-animate flex h-full min-h-0 flex-col bg-[var(--bg-panel)]">
      <div className="flex h-8 shrink-0 items-stretch gap-0 overflow-hidden border-b border-[var(--border)]">
        <div
          className="flex min-w-0 flex-1 items-stretch overflow-x-auto"
          role="tablist"
          aria-label="Open scripts"
        >
          {openScripts.length === 0 && (
            <span className="flex items-center px-2.5 font-mono text-[11px] text-[var(--text-muted)]">
              No script open
            </span>
          )}
          {openScripts.map((s) => {
            const active = crateActiveId ? s.id === crateActiveId : s.id === activeId
            const dirty = !isCrate(s.id) && (s.content ?? '') !== (savedContents[s.id] ?? '')
            return (
              <div
                key={s.id}
                role="tab"
                aria-selected={active}
                tabIndex={0}
                data-testid={active ? 'script-tab' : `script-tab-${s.id}`}
                data-script-id={s.id}
                title={s.relativePath ?? s.name}
                className={cn(
                  'group flex h-full min-w-0 max-w-[11rem] shrink-0 cursor-pointer items-center gap-1.5 border-r border-[var(--border)] px-2.5',
                  active
                    ? 'border-b-2 border-b-[var(--accent)] bg-[var(--bg-input)] text-[var(--text)]'
                    : 'border-b-2 border-b-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
                )}
                onClick={() => selectTab(s.id)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault()
                    closeTab(s.id)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    selectTab(s.id)
                  }
                }}
              >
                <FileCode2 className="h-3 w-3 shrink-0 text-[var(--accent-dim)]" />
                <span className="min-w-0 truncate font-mono text-[11px]">
                  {s.name}
                </span>
                {dirty ? (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                    title="Unsaved"
                    data-testid={`script-tab-dirty-${s.id}`}
                  />
                ) : null}
                <button
                  type="button"
                  data-testid={`script-tab-close-${s.id}`}
                  title="Close"
                  className={cn(
                    'ml-0.5 rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-panel-raised)] hover:text-[var(--text)]',
                    !active && 'opacity-0 group-hover:opacity-100',
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(s.id)
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
        </div>
        {script && (
          <span className="hidden shrink-0 items-center px-2 font-mono text-[9px] uppercase tracking-wide text-[var(--text-muted)] sm:flex">
            {language}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1 px-1">
          {attachedEntities.length > 0 && (
            <span
              className="hidden max-w-[7rem] truncate text-[10px] text-[var(--text-muted)] xl:inline"
              title={`Attached to ${attachedEntities.join(', ')}`}
            >
              {attachedEntities.length === 1
                ? attachedEntities[0]
                : `${attachedEntities.length} entities`}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={!canRun}
            data-testid="run-script"
            onClick={() => script && onRunScript?.(script)}
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="new-script"
            onClick={onCreateScript}
          >
            <Plus className="h-3.5 w-3.5" />
            New .rg
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {script ? (
          <ScriptEditor
            key={script.id}
            scriptId={script.id}
            fileName={script.name}
            value={script.content ?? ''}
            onChange={(value) => {
              if (!isCrate(script.id)) onChangeContent(script.id, value)
            }}
            disabled={isCrate(script.id)}
            fontSize={fontSize}
            onRun={canRun ? () => onRunScript?.(script) : undefined}
            diagnostics={shownDiagnostics}
            diagnosticsReady={diagnosticsReady}
            reveal={
              crateActiveId && crateReveal?.scriptId === script.id
                ? crateReveal
                : reveal
            }
            modules={siblingRoseGoldModules(scripts, script.id)}
            onJumpSymbol={(info: RgSymbol) => {
              const id = scriptIdForSymbolFile(
                scripts,
                info.file,
                script.id,
                script.name,
              )
              if (id && !isCrate(id)) {
                setCrateActiveId(null)
                onJumpSymbol?.(id, info.line, info.col)
                return
              }
              const stem = crateStdlibStem(info.file)
              if (!stem) return
              void stdlibSource(stem).then((source) => {
                if (!source) return
                const crateId = stdlibScriptId(stem)
                setCrateTabs((prev) => {
                  if (prev.some((t) => t.id === crateId)) return prev
                  return [
                    ...prev,
                    {
                      id: crateId,
                      name: `${stem}.rg`,
                      type: 'script',
                      size: 'crate',
                      content: source,
                      language: 'rosegold',
                    },
                  ]
                })
                setCrateActiveId(crateId)
                setCrateReveal({
                  scriptId: crateId,
                  line: info.line,
                  col: info.col,
                  nonce: Date.now(),
                })
              })
            }}
          />
        ) : (
          <div
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-[var(--bg-input)]"
            data-testid="script-empty"
          >
            <FileCode2 className="h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No script open</p>
            <p className="max-w-xs text-center text-[11px] text-[var(--text-muted)]">
              Select a .rg asset or create a new script to start editing.
            </p>
            <Button variant="accent" size="sm" onClick={onCreateScript}>
              <Plus className="h-3.5 w-3.5" />
              New .rg
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
