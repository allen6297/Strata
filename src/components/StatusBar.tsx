import type { CameraReadout, ToolMode } from '@/types/scene'
import { cn } from '@/lib/utils'

interface StatusBarProps {
  tool: ToolMode
  selectionName: string | null
  entityCount: number
  dirty: boolean
  status: string | null
  camera: CameraReadout
}

const toolLabel: Record<ToolMode, string> = {
  select: 'Select',
  move: 'Pan',
  create: 'Create',
}

export function StatusBar({
  tool,
  selectionName,
  entityCount,
  dirty,
  status,
  camera,
}: StatusBarProps) {
  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--bg-panel)] px-2.5 font-mono text-[10px] text-[var(--text-muted)]">
      <span className="text-[var(--text)]">{toolLabel[tool]}</span>
      <span className="text-[var(--border-strong)]">|</span>
      <span className={cn(!selectionName && 'opacity-70')}>
        {selectionName ?? 'Nothing selected'}
      </span>

      <div className="ml-auto flex items-center gap-3">
        {status && (
          <span className="text-[var(--accent)]">{status}</span>
        )}
        <span>{dirty ? 'Unsaved' : 'Saved'}</span>
        <span>
          zoom {(camera.zoom * 100).toFixed(0)}%
        </span>
        <span>
          cam {camera.x.toFixed(0)}, {camera.y.toFixed(0)}
          {camera.z ? `, ${camera.z.toFixed(0)}` : ''}
        </span>
        <span>
          {entityCount} {entityCount === 1 ? 'entity' : 'entities'}
        </span>
      </div>
    </footer>
  )
}
