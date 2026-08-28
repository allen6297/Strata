import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SceneMode } from '@/types/scene'

// MARK: - Floating viewport mode toggle

interface SceneModeTabProps {
  mode: SceneMode
  onModeChange: (mode: SceneMode) => void
}

export function SceneModeTab({ mode, onModeChange }: SceneModeTabProps) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
      <div
        className="pointer-events-auto flex rounded-md border border-[var(--border)] bg-[var(--bg-panel)]/90 p-0.5 shadow-md backdrop-blur-sm"
        role="group"
        aria-label="Scene mode"
      >
        <Button
          variant="ghost"
          size="sm"
          data-testid="mode-2d"
          className={cn(
            'h-7 min-w-10 justify-center px-2.5 text-xs font-medium',
            mode === '2d' &&
              'bg-[var(--select)] text-[var(--accent)] hover:bg-[var(--select)]',
          )}
          title="2D mode (1)"
          onClick={() => onModeChange('2d')}
        >
          2D
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="mode-3d"
          className={cn(
            'h-7 min-w-10 justify-center px-2.5 text-xs font-medium',
            mode === '3d' &&
              'bg-[var(--select)] text-[var(--accent)] hover:bg-[var(--select)]',
          )}
          title="3D mode (2)"
          onClick={() => onModeChange('3d')}
        >
          3D
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="mode-script"
          className={cn(
            'h-7 min-w-10 justify-center px-2.5 text-xs font-medium',
            mode === 'script' &&
              'bg-[var(--select)] text-[var(--accent)] hover:bg-[var(--select)]',
          )}
          title="Script mode (3)"
          onClick={() => onModeChange('script')}
        >
          Script
        </Button>
      </div>
    </div>
  )
}
