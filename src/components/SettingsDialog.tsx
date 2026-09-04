import { LayersEditor } from '@/components/LayersEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { EditorSettings } from '@/lib/editor-settings'
import { cn } from '@/lib/utils'
import type { RenderLayer } from '@/types/scene'
import { X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type SettingsKind = 'project' | 'editor'

type ProjectCategory = 'application' | 'layers'
type EditorCategory = 'appearance' | 'viewport' | 'script'

const PROJECT_NAV: { id: ProjectCategory; label: string }[] = [
  { id: 'application', label: 'Application' },
  { id: 'layers', label: 'Layers' },
]

const EDITOR_NAV: { id: EditorCategory; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'viewport', label: 'Viewport' },
  { id: 'script', label: 'Script' },
]

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label>{label}</Label>
      {children}
      {hint ? (
        <p className="text-[10px] leading-snug text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  )
}

export function SettingsDialog({
  kind,
  projectName,
  folderLabel,
  renderLayers,
  editor,
  onProjectName,
  onChangeLayers,
  onDeleteLayer,
  onEditor,
  onClose,
}: {
  kind: SettingsKind
  projectName: string
  folderLabel: string | null
  renderLayers: RenderLayer[]
  editor: EditorSettings
  onProjectName: (name: string) => void
  onChangeLayers: (layers: RenderLayer[]) => void
  onDeleteLayer: (id: string) => void
  onEditor: (patch: Partial<EditorSettings>) => void
  onClose: () => void
}) {
  const [projectCat, setProjectCat] = useState<ProjectCategory>('application')
  const [editorCat, setEditorCat] = useState<EditorCategory>('appearance')
  const title = kind === 'project' ? 'Project Settings' : 'Editor Settings'
  const nav = kind === 'project' ? PROJECT_NAV : EDITOR_NAV
  const active = kind === 'project' ? projectCat : editorCat

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      data-testid={kind === 'project' ? 'project-settings' : 'editor-settings'}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-[min(32rem,calc(100vh-2rem))] w-[min(40rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] shadow-2xl"
      >
        <nav className="flex w-40 shrink-0 flex-col gap-0.5 border-r border-[var(--border)] bg-[var(--bg-app)] p-2">
          <p className="px-2 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {kind === 'project' ? 'Project' : 'Editor'}
          </p>
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                'rounded-md px-2 py-1.5 text-left text-[12px]',
                active === item.id
                  ? 'bg-[var(--select)] text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
              )}
              onClick={() => {
                if (kind === 'project') setProjectCat(item.id as ProjectCategory)
                else setEditorCat(item.id as EditorCategory)
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-10 shrink-0 items-center border-b border-[var(--border)] px-3">
            <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
            <Button
              variant="toolbar"
              size="icon"
              className="ml-auto"
              title="Close"
              onClick={onClose}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {kind === 'project' && projectCat === 'application' ? (
              <Field
                label="Name"
                hint={
                  folderLabel
                    ? `Blank uses the folder name (${folderLabel}). Saved in strata.json.`
                    : 'Saved in strata.json with this project. Blank uses the folder name.'
                }
              >
                <Input
                  value={projectName}
                  placeholder={folderLabel ?? 'Untitled'}
                  data-testid="project-settings-name"
                  onChange={(e) => onProjectName(e.target.value)}
                />
              </Field>
            ) : null}
            {kind === 'project' && projectCat === 'layers' ? (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] text-[var(--text-muted)]">
                  Low = back. Shared across scenes in this project.
                </p>
                <LayersEditor
                  layers={renderLayers}
                  onChange={onChangeLayers}
                  onDelete={onDeleteLayer}
                />
              </div>
            ) : null}
            {kind === 'editor' && editorCat === 'appearance' ? (
              <Field label="Theme" hint="This machine only. Not written to the project.">
                <select
                  className="h-7 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2 text-[11px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)]"
                  value={editor.theme}
                  data-testid="editor-settings-theme"
                  onChange={(e) =>
                    onEditor({
                      theme: e.target.value === 'light' ? 'light' : 'dark',
                    })
                  }
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </Field>
            ) : null}
            {kind === 'editor' && editorCat === 'viewport' ? (
              <div className="flex flex-col gap-3">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-[12px]">Snap to grid</span>
                  <input
                    type="checkbox"
                    checked={editor.snap}
                    data-testid="editor-settings-snap"
                    className="h-3.5 w-3.5 accent-[var(--accent)]"
                    onChange={(e) => onEditor({ snap: e.target.checked })}
                  />
                </label>
                <Field
                  label="Grid size"
                  hint="World pixels between grid lines and snap points. G still toggles snap."
                >
                  <Input
                    type="number"
                    min={1}
                    max={256}
                    value={editor.gridSize}
                    data-testid="editor-settings-grid"
                    className="h-7 font-mono text-[11px]"
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (Number.isFinite(n)) onEditor({ gridSize: n })
                    }}
                  />
                </Field>
              </div>
            ) : null}
            {kind === 'editor' && editorCat === 'script' ? (
              <Field
                label="Font size"
                hint="RoseGold editor body text. Completions and gutters stay scaled to the theme."
              >
                <Input
                  type="number"
                  min={10}
                  max={24}
                  value={editor.scriptFontSize}
                  data-testid="editor-settings-font"
                  className="h-7 font-mono text-[11px]"
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n)) onEditor({ scriptFontSize: n })
                  }}
                />
              </Field>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
