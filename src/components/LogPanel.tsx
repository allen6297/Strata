import { Button } from '@/components/ui/button'
import { DockDragHandle } from '@/components/DockDragHandle'
import { DockPanelClose } from '@/components/DockPanelClose'
import type { DockZoneId } from '@/lib/dock-layout'
import {
  splitPlayLog,
  type ScriptLogLocation,
} from '@/lib/script-log-locations'
import { cn } from '@/lib/utils'
import { Copy, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'

interface LogPanelProps {
  playLog: string
  onClear?: () => void
  onJumpToLocation?: (loc: ScriptLogLocation) => void
  chromeless?: boolean
  dockZone?: DockZoneId
}

export function LogPanel({
  playLog,
  onClear,
  onJumpToLocation,
  chromeless = false,
  dockZone,
}: LogPanelProps) {
  const preRef = useRef<HTMLPreElement>(null)
  const parts = useMemo(() => splitPlayLog(playLog), [playLog])

  useEffect(() => {
    const el = preRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [playLog])

  return (
    <aside
      className="panel-animate flex h-full min-h-0 w-full flex-col bg-[var(--bg-panel)]"
      data-testid="log-panel"
    >
      {!chromeless && (
        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-[var(--border)] px-2">
          {dockZone && <DockDragHandle panelId="log" zone={dockZone} />}
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Log
          </h2>
          <div className="ml-auto flex items-center gap-0.5">
            <LogActions playLog={playLog} onClear={onClear} />
            <DockPanelClose panelId="log" />
          </div>
        </div>
      )}
      {chromeless && (
        <div className="flex h-8 shrink-0 items-center justify-end gap-0.5 border-b border-[var(--border)] px-2">
          <LogActions playLog={playLog} onClear={onClear} />
        </div>
      )}
      <pre
        ref={preRef}
        data-testid="play-log"
        className={cn(
          'min-h-0 flex-1 overflow-auto bg-[var(--bg-input)] p-3 font-mono text-[11px] leading-relaxed text-[var(--text-muted)]',
        )}
      >
        {playLog
          ? parts.map((part, i) =>
              part.kind === 'text' ? (
                <span key={i}>{part.text}</span>
              ) : (
                <button
                  key={i}
                  type="button"
                  data-testid="play-log-loc"
                  data-line={part.loc.line}
                  data-col={part.loc.col}
                  title={`Go to ${part.loc.file ? `${part.loc.file}:` : ''}${part.loc.line}:${part.loc.col}`}
                  className="cursor-pointer rounded-sm bg-transparent p-0 font-[inherit] text-[var(--danger)] underline decoration-dotted underline-offset-2 hover:text-[var(--accent)]"
                  onClick={() => onJumpToLocation?.(part.loc)}
                >
                  {part.text}
                </button>
              ),
            )
          : 'RoseGold stdout/stderr appears here when you run or play.'}
      </pre>
    </aside>
  )
}

function LogActions({
  playLog,
  onClear,
}: {
  playLog: string
  onClear?: () => void
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5"
        title="Clear log"
        onClick={onClear}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5"
        title="Copy log"
        onClick={() => void navigator.clipboard.writeText(playLog)}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </>
  )
}
