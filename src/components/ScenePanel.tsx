import { PanelHeader } from '@/components/PanelHeader'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SceneMode } from '@/types/scene'

interface ScenePanelProps {
  mode: SceneMode
  onModeChange: (mode: SceneMode) => void
}

export function ScenePanel({ mode, onModeChange }: ScenePanelProps) {
  return (
    <section className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-panel)]">
      <PanelHeader title="Scene" meta={mode.toUpperCase()} />
      <div className="p-2">
        <div
          className="grid grid-cols-2 gap-0.5 rounded border border-[var(--border)] bg-[var(--bg-input)] p-0.5"
          role="group"
          aria-label="Scene mode"
        >
          <Button
            variant="ghost"
            size="sm"
            data-testid="mode-2d"
            className={cn(
              'h-6 justify-center',
              mode === '2d' &&
                'bg-[var(--select)] text-[var(--accent)] hover:bg-[var(--select)]',
            )}
            onClick={() => onModeChange('2d')}
          >
            2D
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="mode-3d"
            className={cn(
              'h-6 justify-center',
              mode === '3d' &&
                'bg-[var(--select)] text-[var(--accent)] hover:bg-[var(--select)]',
            )}
            onClick={() => onModeChange('3d')}
          >
            3D
          </Button>
        </div>
      </div>
    </section>
  )
}
