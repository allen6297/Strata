import { Button } from '@/components/ui/button'
import { isTauri } from '@/lib/tauri'
import type { ThemeMode } from '@/lib/theme'
import type { SceneMode, ToolMode } from '@/types/scene'
import {
  Box,
  Camera,
  Circle,
  Copy,
  FileCode2,
  FolderKanban,
  FolderOpen,
  Hand,
  Lightbulb,
  Magnet,
  Moon,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Redo2,
  Save,
  Square,
  Sun,
  Trash2,
  Undo2,
} from 'lucide-react'
import type { ReactNode } from 'react'

interface ToolbarProps {
  tool: ToolMode
  playing: boolean
  snap: boolean
  sceneName: string
  projectLabel: string | null
  dirty: boolean
  status: string | null
  theme: ThemeMode
  mode: SceneMode
  canDelete: boolean
  canDuplicate: boolean
  canUndo: boolean
  canRedo: boolean
  onToolChange: (tool: ToolMode) => void
  onSnapToggle: () => void
  onPlayToggle: () => void
  onAddSprite: () => void
  onAddEmpty: () => void
  onAddCamera: () => void
  onAddMesh: () => void
  onAddLight: () => void
  onAddScript: () => void
  onDelete: () => void
  onDuplicate: () => void
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onLoad: () => void
  onOpenProject: () => void
  onSaveProject: () => void
  onThemeToggle: () => void
}

function Group({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>
}

function Sep() {
  return (
    <div
      aria-hidden
      className="mx-1 hidden h-4 w-px shrink-0 bg-[var(--border)] sm:block"
    />
  )
}

export function Toolbar({
  tool,
  playing,
  snap,
  sceneName,
  projectLabel,
  dirty,
  status,
  theme,
  mode,
  canDelete,
  canDuplicate,
  canUndo,
  canRedo,
  onToolChange,
  onSnapToggle,
  onPlayToggle,
  onAddSprite,
  onAddEmpty,
  onAddCamera,
  onAddMesh,
  onAddLight,
  onAddScript,
  onDelete,
  onDuplicate,
  onUndo,
  onRedo,
  onSave,
  onLoad,
  onOpenProject,
  onSaveProject,
  onThemeToggle,
}: ToolbarProps) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-panel)] px-2 sm:gap-1.5 sm:px-2.5">
      <div className="flex items-center gap-2 border-r border-[var(--border)] pr-2.5">
        <div className="brand-mark flex h-6 w-6 items-center justify-center rounded">
          <Box className="h-3.5 w-3.5" strokeWidth={2.5} />
        </div>
        <div className="leading-none">
          <div className="text-[13px] font-semibold tracking-tight">Strata</div>
          <div className="mt-0.5 font-mono text-[9px] text-[var(--text-muted)]">
            {isTauri() ? 'Desktop' : 'Scene Editor'}
          </div>
        </div>
      </div>

      <Group>
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
          title={mode === '3d' ? 'Orbit (H)' : 'Pan (H)'}
          onClick={() => onToolChange('move')}
        >
          <Hand className="h-3.5 w-3.5" />
        </Button>
        {mode === '2d' && (
          <Button
            variant="toolbar"
            size="icon"
            active={snap}
            title="Snap to grid (G) — hold Shift to bypass"
            data-testid="snap-toggle"
            onClick={onSnapToggle}
          >
            <Magnet className="h-3.5 w-3.5" />
          </Button>
        )}
      </Group>

      <Sep />

      <Group>
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
      </Group>

      <Sep />

      <Group>
        <Button
          variant="ghost"
          size="sm"
          data-testid="add-sprite"
          onClick={onAddSprite}
          title="Add Sprite"
          className="px-1.5"
        >
          <Plus className="h-3 w-3" />
          <Square className="h-3 w-3" />
          <span className="hidden sm:inline">Sprite</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="add-empty"
          onClick={onAddEmpty}
          title="Add Empty"
          className="px-1.5"
        >
          <Plus className="h-3 w-3" />
          <Circle className="h-3 w-3" />
          <span className="hidden sm:inline">Empty</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="add-camera"
          onClick={onAddCamera}
          title="Add Camera"
          className="px-1.5"
        >
          <Plus className="h-3 w-3" />
          <Camera className="h-3 w-3" />
          <span className="hidden sm:inline">Camera</span>
        </Button>
        {mode === '3d' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              data-testid="add-mesh"
              onClick={onAddMesh}
              title="Add Mesh"
              className="px-1.5"
            >
              <Plus className="h-3 w-3" />
              <Box className="h-3 w-3" />
              <span className="hidden sm:inline">Mesh</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="add-light"
              onClick={onAddLight}
              title="Add Light"
              className="px-1.5"
            >
              <Plus className="h-3 w-3" />
              <Lightbulb className="h-3 w-3" />
              <span className="hidden sm:inline">Light</span>
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          data-testid="add-script"
          onClick={onAddScript}
          title="Add Script entity"
          className="px-1.5"
        >
          <Plus className="h-3 w-3" />
          <FileCode2 className="h-3 w-3" />
          <span className="hidden sm:inline">Script</span>
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
      </Group>

      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        <div className="hidden min-w-0 flex-col items-end leading-none md:flex">
          <span className="max-w-[12rem] truncate font-mono text-[10px] text-[var(--text-muted)]">
            {projectLabel ? `${projectLabel}/` : ''}
            {sceneName}
            {dirty ? ' •' : ''}
          </span>
          {status && (
            <span className="mt-0.5 font-mono text-[10px] text-[var(--accent)]">
              {status}
            </span>
          )}
        </div>
        <Button
          variant="toolbar"
          size="icon"
          onClick={onThemeToggle}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          data-testid="theme-toggle"
        >
          {theme === 'dark' ? (
            <Sun className="h-3.5 w-3.5" />
          ) : (
            <Moon className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="toolbar"
          size="icon"
          onClick={onOpenProject}
          title="Open project folder"
          data-testid="open-project"
        >
          <FolderKanban className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="toolbar"
          size="icon"
          onClick={onLoad}
          title="Open .scene file"
          data-testid="load-scene"
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSaveProject}
          title="Save into project folder"
          data-testid="save-project"
          disabled={!projectLabel}
        >
          Save Project
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={onSave}
          title="Save scene (Ctrl+S)"
          data-testid="save-scene"
          className="h-7"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>
        <Button
          variant={playing ? 'accent' : 'default'}
          size="sm"
          data-testid="play-toggle"
          className={playing ? 'playing-indicator h-7' : 'h-7'}
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
