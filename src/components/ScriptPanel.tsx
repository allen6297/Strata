import { Button } from '@/components/ui/button'
import type { AssetItem } from '@/types/scene'
import { FileCode2, Plus } from 'lucide-react'

interface ScriptPanelProps {
  script: AssetItem | null
  playLog: string
  onChangeContent: (id: string, content: string) => void
  onCreateScript: () => void
}

export function ScriptPanel({
  script,
  playLog,
  onChangeContent,
  onCreateScript,
}: ScriptPanelProps) {
  return (
    <section className="panel-animate flex h-48 shrink-0 flex-col border-t border-[var(--border)] bg-[var(--bg-panel)]">
      <div className="flex h-8 items-center gap-2 border-b border-[var(--border)] px-3">
        <FileCode2 className="h-3.5 w-3.5 text-[var(--accent)]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          RoseGold
        </h2>
        <span className="font-mono text-[10px] text-[var(--text-muted)]">
          {script?.name ?? 'No script selected'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          data-testid="new-script"
          onClick={onCreateScript}
        >
          <Plus className="h-3.5 w-3.5" />
          New .rg
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
        <textarea
          data-testid="script-editor"
          spellCheck={false}
          disabled={!script}
          value={script?.content ?? ''}
          onChange={(e) => {
            if (script) onChangeContent(script.id, e.target.value)
          }}
          placeholder={
            'RoseGold hooks:\n  fn on_ready(name, x, y)\n  fn on_update(name, x, y, dt)\n\nSelect a .rg asset or create a new script.'
          }
          className="min-h-0 resize-none border-0 border-r border-[var(--border)] bg-[var(--bg-input)] p-3 font-mono text-xs leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
        />
        <pre
          data-testid="play-log"
          className="min-h-0 overflow-auto bg-[#0c0e12] p-3 font-mono text-[11px] leading-relaxed text-[#9aa3b5]"
        >
          {playLog || 'Play log — RoseGold stdout/stderr appears here.'}
        </pre>
      </div>
    </section>
  )
}
