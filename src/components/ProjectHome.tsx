import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  bindProjectHandle,
  canPickDirectory,
  createProjectFolder,
  grantStoredRootAccess,
  listProjectEntries,
  loadLastProjectPath,
  pickProjectsRoot,
  restoreProjectsRoot,
  saveLastProjectPath,
  type ProjectEntry,
  type ProjectsPermission,
  type ProjectsRoot,
} from '@/lib/projects-home'
import { pickProjectDirectory } from '@/lib/project'
import type { ThemeMode } from '@/lib/theme'
import { cn } from '@/lib/utils'
import {
  Box,
  FolderOpen,
  FolderPlus,
  Moon,
  Plus,
  Sun,
} from 'lucide-react'

interface ProjectHomeProps {
  theme: ThemeMode
  enteredEditor: boolean
  onThemeToggle: () => void
  onOpenProject: (path: string) => Promise<void>
  onContinueDemo: () => void
  onBackToEditor: () => void
}

export function ProjectHome({
  theme,
  enteredEditor,
  onThemeToggle,
  onOpenProject,
  onContinueDemo,
  onBackToEditor,
}: ProjectHomeProps) {
  const folderPick = canPickDirectory()
  const [root, setRoot] = useState<ProjectsRoot | null>(null)
  const [permission, setPermission] = useState<ProjectsPermission>(
    folderPick ? 'granted' : 'unavailable',
  )
  const [entries, setEntries] = useState<ProjectEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastPath, setLastPath] = useState<string | null>(() => loadLastProjectPath())
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('NewProject')
  const [busy, setBusy] = useState(false)

  const refreshList = useCallback(async (nextRoot: ProjectsRoot | null) => {
    if (!nextRoot) {
      setEntries([])
      return
    }
    const listed = await listProjectEntries(nextRoot)
    setEntries(listed)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const restored = await restoreProjectsRoot()
        if (cancelled) return
        setRoot(restored.root)
        setPermission(restored.permission)
        if (restored.root && restored.permission === 'granted') {
          await refreshList(restored.root)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not restore projects folder')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshList])

  const chooseFolder = async () => {
    setError(null)
    try {
      const next = await pickProjectsRoot()
      if (!next) return
      setRoot(next)
      setPermission('granted')
      setLoading(true)
      await refreshList(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not choose folder')
    } finally {
      setLoading(false)
    }
  }

  const grantAccess = async () => {
    setError(null)
    try {
      const perm = await grantStoredRootAccess()
      if (perm !== 'granted') {
        setPermission('prompt')
        setError('Folder access was not granted')
        return
      }
      setPermission('granted')
      if (root) await refreshList(root)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not grant folder access')
    }
  }

  const openEntry = async (entry: ProjectEntry) => {
    setBusy(true)
    setError(null)
    try {
      const path = await bindProjectHandle(entry)
      saveLastProjectPath(path)
      setLastPath(path)
      await onOpenProject(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open project')
    } finally {
      setBusy(false)
    }
  }

  const createProject = async () => {
    if (!root) return
    setBusy(true)
    setError(null)
    try {
      const entry = await createProjectFolder(root, newName)
      setCreating(false)
      setNewName('NewProject')
      await refreshList(root)
      await openEntry(entry)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create project')
      setBusy(false)
    }
  }

  const openOtherFolder = async () => {
    setBusy(true)
    setError(null)
    try {
      const path = await pickProjectDirectory()
      if (!path) return
      saveLastProjectPath(path)
      setLastPath(path)
      await onOpenProject(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open folder')
    } finally {
      setBusy(false)
    }
  }

  const needsGrant = permission === 'prompt' && folderPick
  const showList = folderPick && permission === 'granted' && root

  return (
    <div
      className="flex h-full flex-col bg-[var(--bg-app)] text-[var(--text)]"
      data-testid="projects-home"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3">
        <div className="brand-mark flex h-6 w-6 items-center justify-center rounded">
          <Box className="h-3.5 w-3.5" strokeWidth={2.5} />
        </div>
        <div className="text-[13px] font-semibold tracking-tight">Strata</div>
        <div className="ml-auto">
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
        </div>
      </header>

      <div className="flex min-h-0 flex-1 justify-center overflow-auto p-6 sm:p-10">
        <div className="flex w-full max-w-xl flex-col gap-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Projects</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {folderPick
                ? 'Choose a folder to keep your Strata projects. Each subfolder with a .scene or strata.json is listed here.'
                : 'This browser cannot list a folder. Use Chrome or Edge, the desktop app, or continue with the built-in demo.'}
            </p>
          </div>

          {root && (
            <p className="truncate font-mono text-[11px] text-[var(--text-muted)]" title={root.path}>
              {root.label}
              {root.kind === 'tauri' ? ` — ${root.path}` : ''}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="accent"
              size="sm"
              onClick={() => void chooseFolder()}
              disabled={!folderPick || busy}
              data-testid="choose-projects-folder"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Choose folder
            </Button>
            {needsGrant && (
              <Button
                variant="default"
                size="sm"
                onClick={() => void grantAccess()}
                data-testid="grant-projects-folder"
              >
                Grant access
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => setCreating((v) => !v)}
              disabled={!showList || busy}
              data-testid="new-project"
            >
              <Plus className="h-3.5 w-3.5" />
              New project
            </Button>
          </div>

          {creating && showList && (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void createProject()
              }}
            >
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Project name"
                autoFocus
                data-testid="new-project-name"
                className="h-8 max-w-[14rem] text-sm"
              />
              <Button type="submit" variant="accent" size="sm" disabled={busy}>
                Create
              </Button>
            </form>
          )}

          {error && (
            <p className="text-sm text-[var(--danger)]" data-testid="projects-home-error">
              {error}
            </p>
          )}

          <div className="min-h-[12rem] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-panel)]">
            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                Loading…
              </p>
            ) : !folderPick ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                Folder listing is unavailable in this browser.
              </p>
            ) : needsGrant ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                Click Grant access to list projects in this folder.
              </p>
            ) : !root ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                No projects folder yet. Choose a folder to get started.
              </p>
            ) : entries.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                No projects in this folder. Create one, or drop a .scene file in a subfolder.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {entries.map((entry) => {
                  const active = entry.path === lastPath
                  return (
                    <li key={entry.path}>
                      <button
                        type="button"
                        disabled={busy}
                        data-testid={`project-row-${entry.name}`}
                        onClick={() => void openEntry(entry)}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]',
                          active && 'bg-[var(--select)]',
                        )}
                      >
                        <FolderPlus className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {entry.name}
                          </span>
                          <span className="block truncate font-mono text-[10px] text-[var(--text-muted)]">
                            {entry.scene ?? 'no scene'}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {enteredEditor ? (
              <Button
                variant="default"
                size="sm"
                onClick={onBackToEditor}
                data-testid="back-to-editor"
              >
                Back to editor
              </Button>
            ) : (
              <Button
                variant={!folderPick ? 'accent' : 'ghost'}
                size="sm"
                onClick={onContinueDemo}
                data-testid="continue-demo"
              >
                Continue with demo
              </Button>
            )}
            {folderPick && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void openOtherFolder()}
                data-testid="open-other-folder"
              >
                Open other folder
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
