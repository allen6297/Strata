import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  assetsInFolder,
  type AssetFilter,
  listChildFolders,
  parentDir,
} from '@/lib/project'
import { cn } from '@/lib/utils'
import type { AssetItem } from '@/types/scene'
import {
  ChevronRight,
  FileAudio,
  FileCode2,
  Folder,
  FolderOpen,
  Image,
  LayoutGrid,
  LayoutList,
  LayoutTemplate,
  RefreshCw,
  Search,
  AlertCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

interface AssetExplorerProps {
  assets: AssetItem[]
  selectedId: string | null
  projectLabel: string | null
  loading?: boolean
  error?: string | null
  onSelect: (id: string) => void
  onActivate?: (asset: AssetItem) => void
  onRefresh?: () => void
  onOpenProject?: () => void
}

const icons = {
  texture: Image,
  script: FileCode2,
  audio: FileAudio,
  scene: LayoutTemplate,
} as const

const FILTERS: Array<{ id: AssetFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'texture', label: 'Tex' },
  { id: 'script', label: 'Script' },
  { id: 'scene', label: 'Scene' },
  { id: 'audio', label: 'Audio' },
]

function breadcrumbParts(cwd: string): string[] {
  return cwd ? cwd.split('/').filter(Boolean) : []
}

export function AssetExplorer({
  assets,
  selectedId,
  projectLabel,
  loading = false,
  error = null,
  onSelect,
  onActivate,
  onRefresh,
  onOpenProject,
}: AssetExplorerProps) {
  const [cwd, setCwd] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AssetFilter>('all')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [focusIndex, setFocusIndex] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  // Reset folder when project changes
  useEffect(() => {
    setCwd('')
    setQuery('')
    setFilter('all')
  }, [projectLabel])

  // Search or type filter → flat results across the project (folders would hide matches).
  const flatMode = query.trim().length > 0 || filter !== 'all'

  const folders = useMemo(
    () => (flatMode ? [] : listChildFolders(assets, cwd)),
    [assets, cwd, flatMode],
  )

  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = flatMode ? assets : assetsInFolder(assets, cwd)
    if (filter !== 'all') list = list.filter((a) => a.type === filter)
    if (q) {
      list = list.filter((a) => {
        const hay = `${a.name} ${a.relativePath ?? ''} ${a.type}`.toLowerCase()
        return hay.includes(q)
      })
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [assets, cwd, filter, query, flatMode])

  const entries = useMemo(() => {
    if (flatMode) {
      return visibleFiles.map((a) => ({ kind: 'file' as const, asset: a }))
    }
    return [
      ...folders.map((name) => ({ kind: 'folder' as const, name })),
      ...visibleFiles.map((a) => ({ kind: 'file' as const, asset: a })),
    ]
  }, [folders, flatMode, visibleFiles])

  useEffect(() => {
    setFocusIndex(0)
  }, [cwd, filter, query, view])

  const crumbs = breadcrumbParts(cwd)
  const counts = useMemo(() => {
    const c = { all: assets.length, texture: 0, script: 0, audio: 0, scene: 0 }
    for (const a of assets) c[a.type] += 1
    return c
  }, [assets])

  const activateIndex = (index: number) => {
    const entry = entries[index]
    if (!entry) return
    if (entry.kind === 'folder') {
      setCwd(cwd ? `${cwd}/${entry.name}` : entry.name)
      return
    }
    onActivate?.(entry.asset)
  }

  const selectIndex = (index: number) => {
    const entry = entries[index]
    if (!entry) return
    setFocusIndex(index)
    if (entry.kind === 'file') onSelect(entry.asset.id)
  }

  return (
    <section
      className="panel-animate flex h-56 shrink-0 flex-col border-t border-[var(--border)] bg-[var(--bg-panel)]"
      data-testid="asset-explorer"
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault()
          selectIndex(Math.min(entries.length - 1, focusIndex + 1))
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault()
          selectIndex(Math.max(0, focusIndex - 1))
        } else if (e.key === 'Enter') {
          e.preventDefault()
          activateIndex(focusIndex)
        } else if (e.key === 'Backspace' && cwd && !flatMode) {
          e.preventDefault()
          setCwd(parentDir(cwd))
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setQuery('')
          setFilter('all')
        } else if (e.key === '/' && !(e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          searchRef.current?.focus()
        }
      }}
      tabIndex={0}
    >
      <div className="flex h-8 items-center gap-2 border-b border-[var(--border)] px-2">
        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
        <h2 className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Assets
        </h2>
        <div className="relative min-w-0 flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files…"
            data-testid="asset-search"
            className="h-6 pl-7 text-[11px]"
          />
        </div>
        <div className="hidden items-center gap-0.5 sm:flex">
          {FILTERS.map((f) => (
            <Button
              key={f.id}
              variant="toolbar"
              size="sm"
              active={filter === f.id}
              className="h-6 px-1.5 text-[10px]"
              onClick={() => setFilter(f.id)}
              data-testid={`asset-filter-${f.id}`}
            >
              {f.label}
              <span className="opacity-50">{counts[f.id]}</span>
            </Button>
          ))}
        </div>
        <Button
          variant="toolbar"
          size="icon"
          active={view === 'grid'}
          title="Grid view"
          onClick={() => setView('grid')}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="toolbar"
          size="icon"
          active={view === 'list'}
          title="List view"
          onClick={() => setView('list')}
        >
          <LayoutList className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="toolbar"
          size="icon"
          title="Refresh project"
          data-testid="asset-refresh"
          disabled={!onRefresh || loading}
          onClick={() => onRefresh?.()}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      <div className="flex h-7 items-center gap-1 border-b border-[var(--border)] px-2 text-[11px]">
        <button
          type="button"
          className="rounded px-1 text-[var(--accent)] hover:bg-[var(--bg-panel-raised)]"
          onClick={() => setCwd('')}
        >
          {projectLabel ?? 'Built-in'}
        </button>
        {crumbs.map((part, i) => {
          const path = crumbs.slice(0, i + 1).join('/')
          return (
            <span key={path} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-[var(--text-muted)]" />
              <button
                type="button"
                className="rounded px-1 text-[var(--text-muted)] hover:bg-[var(--bg-panel-raised)] hover:text-[var(--text)]"
                onClick={() => setCwd(path)}
              >
                {part}
              </button>
            </span>
          )
        })}
        <span className="ml-auto font-mono text-[10px] text-[var(--text-muted)]">
          {loading
            ? 'Scanning…'
            : flatMode
              ? `${visibleFiles.length} match${visibleFiles.length === 1 ? '' : 'es'}`
              : `${folders.length} folder${folders.length === 1 ? '' : 's'} · ${visibleFiles.length} file${visibleFiles.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 border-b border-[var(--border)] bg-[rgba(224,108,117,0.08)] px-3 py-1.5 text-[11px] text-[var(--danger)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{error}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {loading && assets.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-[var(--text-muted)]">
            Scanning project folder…
          </p>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
            <p className="text-xs text-[var(--text-muted)]">
              {flatMode
                ? 'No assets match this search/filter.'
                : projectLabel
                  ? 'This folder has no Strata assets yet (.rg, .png, .scene, audio).'
                  : 'Built-in assets — open a project folder for a full explorer.'}
            </p>
            {!projectLabel && onOpenProject && (
              <Button variant="default" size="sm" onClick={onOpenProject}>
                Open Project
              </Button>
            )}
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
            {entries.map((entry, index) =>
              entry.kind === 'folder' ? (
                <button
                  key={`dir:${entry.name}`}
                  type="button"
                  aria-label={`Open folder ${entry.name}`}
                  data-testid={`asset-folder-${entry.name}`}
                  onClick={() => {
                    setFocusIndex(index)
                    setCwd(cwd ? `${cwd}/${entry.name}` : entry.name)
                  }}
                  className={cn(
                    'flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg-panel-raised)] px-2 py-2 text-left transition-colors hover:border-[var(--border-strong)]',
                    focusIndex === index && 'ring-1 ring-[var(--accent-dim)]',
                  )}
                >
                  <div className="mb-2 flex h-12 items-center justify-center rounded bg-[var(--bg-input)]">
                    <Folder className="h-5 w-5 text-[var(--warn)]" />
                  </div>
                  <div className="truncate text-xs text-[var(--text)]">
                    {entry.name}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] uppercase text-[var(--text-muted)]">
                    Folder
                  </div>
                </button>
              ) : (
                <AssetCard
                  key={entry.asset.id}
                  asset={entry.asset}
                  selected={entry.asset.id === selectedId}
                  focused={focusIndex === index}
                  showPath={flatMode}
                  onSelect={() => {
                    setFocusIndex(index)
                    onSelect(entry.asset.id)
                  }}
                  onActivate={() => onActivate?.(entry.asset)}
                />
              ),
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {entries.map((entry, index) =>
              entry.kind === 'folder' ? (
                <button
                  key={`dir:${entry.name}`}
                  type="button"
                  aria-label={`Open folder ${entry.name}`}
                  data-testid={`asset-folder-${entry.name}`}
                  onClick={() => {
                    setFocusIndex(index)
                    setCwd(cwd ? `${cwd}/${entry.name}` : entry.name)
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--bg-panel-raised)]',
                    focusIndex === index && 'bg-[var(--select)]',
                  )}
                >
                  <Folder className="h-3.5 w-3.5 text-[var(--warn)]" />
                  <span className="flex-1 truncate text-[var(--text)]">
                    {entry.name}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">
                    Folder
                  </span>
                </button>
              ) : (
                <AssetRow
                  key={entry.asset.id}
                  asset={entry.asset}
                  selected={entry.asset.id === selectedId}
                  focused={focusIndex === index}
                  showPath={flatMode}
                  onSelect={() => {
                    setFocusIndex(index)
                    onSelect(entry.asset.id)
                  }}
                  onActivate={() => onActivate?.(entry.asset)}
                />
              ),
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function AssetCard({
  asset,
  selected,
  focused,
  showPath,
  onSelect,
  onActivate,
}: {
  asset: AssetItem
  selected: boolean
  focused: boolean
  showPath: boolean
  onSelect: () => void
  onActivate: () => void
}) {
  const Icon = icons[asset.type]
  const [imgError, setImgError] = useState(false)
  return (
    <button
      type="button"
      data-testid={`asset-${asset.id}`}
      onClick={onSelect}
      onDoubleClick={onActivate}
      title={
        asset.type === 'texture' || asset.type === 'script'
          ? `Double-click to assign · ${asset.relativePath ?? asset.name}`
          : (asset.relativePath ?? asset.name)
      }
      className={cn(
        'flex flex-col rounded-md border px-2 py-2 text-left transition-colors',
        selected
          ? 'border-[var(--accent-dim)] bg-[var(--select)]'
          : 'border-[var(--border)] bg-[var(--bg-panel-raised)] hover:border-[var(--border-strong)]',
        focused && 'ring-1 ring-[var(--accent-dim)]',
      )}
    >
      <div className="mb-2 flex h-12 items-center justify-center overflow-hidden rounded bg-[var(--bg-input)]">
        {asset.type === 'texture' && asset.url && !imgError ? (
          <img
            src={asset.url}
            alt=""
            className="max-h-full max-w-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <Icon className="h-5 w-5 text-[var(--accent)]" />
        )}
      </div>
      <div className="truncate text-xs text-[var(--text)]">{asset.name}</div>
      <div className="mt-0.5 truncate font-mono text-[10px] uppercase text-[var(--text-muted)]">
        {showPath && asset.relativePath
          ? asset.relativePath
          : `${asset.type} · ${asset.size}`}
      </div>
    </button>
  )
}

function AssetRow({
  asset,
  selected,
  focused,
  showPath,
  onSelect,
  onActivate,
}: {
  asset: AssetItem
  selected: boolean
  focused: boolean
  showPath: boolean
  onSelect: () => void
  onActivate: () => void
}) {
  const Icon = icons[asset.type]
  return (
    <button
      type="button"
      data-testid={`asset-${asset.id}`}
      onClick={onSelect}
      onDoubleClick={onActivate}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs',
        selected || focused
          ? 'bg-[var(--select)] text-[var(--text)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--bg-panel-raised)] hover:text-[var(--text)]',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
      <span className="min-w-0 flex-1 truncate">{asset.name}</span>
      <span className="hidden max-w-[40%] truncate font-mono text-[10px] sm:inline">
        {showPath ? asset.relativePath : asset.type}
      </span>
      <span className="font-mono text-[10px] opacity-70">{asset.size}</span>
    </button>
  )
}

/** @deprecated use AssetExplorer */
export { AssetExplorer as AssetBrowser }
