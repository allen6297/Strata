import { Button } from '@/components/ui/button'
import { isTauri } from '@/lib/tauri'
import type { ToolMode } from '@/types/scene'
import {
  Box,
  Camera,
  Circle,
  Copy,
  FolderOpen,
  Hand,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Redo2,
  Save,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react'

interface ToolbarProps {
  tool: ToolMode
  playing: boolean
  sceneName: string
  dirty: boolean
  status: string | null
  canDelete: boolean
  canDuplicate: boolean
  canUndo: boolean
  canRedo: boolean
  onToolChange: (tool: ToolMode) => void
  onPlayToggle: () => void
  onAddSprite: () => void
  onAddEmpty: () => void
  onAddCamera: () => void
  onDelete: () => void
  onDuplicate: () => void
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onLoad: () => void
}

export function Toolbar({
  tool,
  playing,
  sceneName,
  dirty,
  status,
  canDelete,
  canDuplicate,
  canUndo,
  canRedo,
  onToolChange,
  onPlayToggle,
  onAddSprite,
  onAddEmpty,
  onAddCamera,
  onDelete,
  onDuplicate,
  onUndo,
  onRedo,
  onSave,
  onLoad,
}: ToolbarProps) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3 sm:gap-3">
      <div className="flex items-center gap-2 border-r border-[var(--border)] pr-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-[#0b1211]">
          <Box className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">Strata</div>
          <div className="font-mono text-[10px] text-[var(--text-muted)]">
            {isTauri() ? 'Desktop' : 'Scene Editor'}
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

      <div className="mx-0.5 hidden h-5 w-px bg-[var(--border)] sm:block" />

      <div className="flex items-center gap-1">
        <Button
          variant="toolbar"
          size="icon"
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo (Ctrl+Z)"
          data-testid="undo"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="toolbar"
          size="icon"
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo (Ctrl+Shift+Z)"
          data-testid="redo"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="mx-0.5 hidden h-5 w-px bg-[var(--border)] sm:block" />

      <div className="flex items-center gap-1 overflow-x-auto">
        <Button
          variant="ghost"
          size="sm"
          data-testid="add-sprite"
          onClick={onAddSprite}
          title="Add Sprite"
        >
          <Plus className="h-3.5 w-3.5" />
          <Square className="h-3 w-3" />
          <span className="hidden sm:inline">Sprite</span>
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
          <span className="hidden sm:inline">Empty</span>
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
          <span className="hidden sm:inline">Camera</span>
        </Button>
        <Button
          variant="toolbar"
          size="icon"
          disabled={!canDuplicate}
          onClick={onDuplicate}
          title="Duplicate (Ctrl+D)"
          data-testid="duplicate"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="danger"
          size="icon"
          disabled={!canDelete}
          onClick={onDelete}
          title="Delete (Del)"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-2">
        <div className="hidden min-w-0 flex-col items-end leading-tight md:flex">
          <span className="max-w-[10rem] truncate font-mono text-[10px] text-[var(--text-muted)]">
            {sceneName}
            {dirty ? ' •' : ''}
          </span>
          {status && (
            <span className="font-mono text-[10px] text-[var(--accent)]">
              {status}
            </span>
          )}
        </div>
        <Button
          variant="toolbar"
          size="icon"
          onClick={onLoad}
          title="Open scene"
          data-testid="load-scene"
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={onSave}
          title="Save (Ctrl+S)"
          data-testid="save-scene"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>
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
