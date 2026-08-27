import { Button } from '@/components/ui/button'
import type { ToolMode } from '@/types/scene'
import {
  Box,
  Camera,
  Circle,
  Hand,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Square,
  Trash2,
} from 'lucide-react'

interface ToolbarProps {
  tool: ToolMode
  playing: boolean
  canDelete: boolean
  onToolChange: (tool: ToolMode) => void
  onPlayToggle: () => void
  onAddSprite: () => void
  onAddEmpty: () => void
  onAddCamera: () => void
  onDelete: () => void
}

export function Toolbar({
  tool,
  playing,
  canDelete,
  onToolChange,
  onPlayToggle,
  onAddSprite,
  onAddEmpty,
  onAddCamera,
  onDelete,
}: ToolbarProps) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3">
      <div className="flex items-center gap-2 pr-3 border-r border-[var(--border)]">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-[#0b1211]">
          <Box className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">Forge</div>
          <div className="font-mono text-[10px] text-[var(--text-muted)]">
            Scene Editor
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="toolbar"
          size="icon"
          active={tool === 'select'}
          title="Select (V)"
          onClick={() => onToolChange('select')}
        >
          <MousePointer2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="toolbar"
          size="icon"
          active={tool === 'move'}
          title="Pan (H)"
          onClick={() => onToolChange('move')}
        >
          <Hand className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="mx-1 h-5 w-px bg-[var(--border)]" />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          data-testid="add-sprite"
          onClick={onAddSprite}
          title="Add Sprite"
        >
          <Plus className="h-3.5 w-3.5" />
          <Square className="h-3 w-3" />
          Sprite
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="add-empty"
          onClick={onAddEmpty}
          title="Add Empty"
        >
          <Plus className="h-3.5 w-3.5" />
          <Circle className="h-3 w-3" />
          Empty
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="add-camera"
          onClick={onAddCamera}
          title="Add Camera"
        >
          <Plus className="h-3.5 w-3.5" />
          <Camera className="h-3 w-3" />
          Camera
        </Button>
        <Button
          variant="danger"
          size="icon"
          disabled={!canDelete}
          onClick={onDelete}
          title="Delete selected"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden font-mono text-[10px] text-[var(--text-muted)] sm:inline">
          main.scene
        </span>
        <Button
          variant={playing ? 'accent' : 'default'}
          size="sm"
          data-testid="play-toggle"
          className={playing ? 'playing-indicator' : ''}
          onClick={onPlayToggle}
        >
          {playing ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {playing ? 'Stop' : 'Play'}
        </Button>
      </div>
    </header>
  )
}
