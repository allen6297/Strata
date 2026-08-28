import { Button } from '@/components/ui/button'
import { ScriptEditor } from '@/components/ScriptEditor'
import type { AssetItem } from '@/types/scene'
import { Copy, Play, Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'

interface ScriptPanelProps {
  script: AssetItem | null
  playLog: string
  attachedEntities: string[]
  onChangeContent: (id: string, content: string) => void
  onCreateScript: () => void
  onRunScript?: (script: AssetItem) => void
  onClearLog?: () => void
}

export function ScriptPanel({
  script,
  playLog,
  attachedEntities,
  onChangeContent,
  onCreateScript,
  onRunScript,
  onClearLog,
}: ScriptPanelProps) {
  const language = script?.language ?? 'rosegold'
  const canRun = Boolean(script && onRunScript)

  const placeholder = useMemo(
    () =>
      [
        'RoseGold script hooks + motion directives:',
        '  import str;',
        '  fn on_ready(name: String, x: Float, y: Float): Int { ... }',
        '  fn on_update(name: String, x: Float, y: Float, dt: Float, keys: String): Int { ... }',
        '',
        '  print("strata:move dx=1 dy=0")',
        '  print("strata:rot 8")',
        '  print("strata:set x=0 y=0")',
        '  print("strata:play_sound name=jump.wav")',
      ].join('\n'),
    [],
  )

  return (
    <section className="panel-animate flex h-full min-h-0 flex-col bg-[var(--bg-panel)]">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3">
        <span className="font-mono text-[10px] text-[var(--text)]">
          {script?.name ?? 'No script selected'}
        </span>
        {script && (
          <span className="rounded bg-[var(--bg-panel-raised)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
            {language}
          </span>
        )}
        {attachedEntities.length > 0 && (
          <span
            className="truncate text-[10px] text-[var(--text-muted)]"
            title={attachedEntities.join(', ')}
          >
            attached to {attachedEntities.length} entity
            {attachedEntities.length === 1 ? '' : 'ies'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
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
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
        <ScriptEditor
          value={script?.content ?? ''}
          onChange={(value) => script && onChangeContent(script.id, value)}
          disabled={!script}
          placeholder={placeholder}
          onRun={() => script && onRunScript?.(script)}
        />
        <div className="flex min-h-0 min-w-0 flex-col bg-[#0c0e12]">
          <div className="flex h-7 shrink-0 items-center justify-between border-b border-[#1e222b] px-2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-[#565c6e]">
              Play log
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-[#565c6e] hover:text-[#9aa3b5]"
                title="Clear log"
                onClick={onClearLog}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-[#565c6e] hover:text-[#9aa3b5]"
                title="Copy log"
                onClick={() => navigator.clipboard.writeText(playLog)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <pre
            data-testid="play-log"
            className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-[#9aa3b5]"
          >
            {playLog || 'RoseGold stdout/stderr appears here when you run or play.'}
          </pre>
        </div>
      </div>
    </section>
  )
}
