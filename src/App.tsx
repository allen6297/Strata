import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AssetExplorer } from '@/components/AssetExplorer'
import { Hierarchy } from '@/components/Hierarchy'
import { Inspector } from '@/components/Inspector'
import { ScriptPanel } from '@/components/ScriptPanel'
import { Toolbar } from '@/components/Toolbar'
import { Viewport } from '@/components/Viewport'
import { useEntityHistory } from '@/hooks/useEntityHistory'
import {
  applyDirectives,
  collectReadyJobs,
  collectUpdateJobs,
  parseStrataDirectives,
  previewUpdateDirectives,
  runRoseGoldHooks,
} from '@/lib/rosegold'
import {
  joinProjectPath,
  listProjectFiles,
  pickProjectDirectory,
  projectFilesToAssets,
  writeProjectFile,
} from '@/lib/project'
import {
  createDefaultEntities,
  createDefaultScripts,
  createEntity,
  DEFAULT_SCENE_NAME,
  downloadScene,
  duplicateEntity,
  loadSceneFromStorage,
  loadScriptsFromStorage,
  parseSceneDocument,
  saveSceneToStorage,
  saveScriptsToStorage,
  STATIC_ASSETS,
  toSceneDocument,
} from '@/lib/scene'
import {
  collectSubtreeIds,
  entityMap,
  flattenHierarchy,
  wouldCreateCycle,
  worldToLocal,
} from '@/lib/transforms'
import { uid } from '@/lib/utils'
import type { AssetItem, Entity, EntityKind, ToolMode } from '@/types/scene'

function bootEntities() {
  return loadSceneFromStorage()?.entities ?? createDefaultEntities()
}

function bootName() {
  return loadSceneFromStorage()?.name ?? DEFAULT_SCENE_NAME
}

function bootScripts(): AssetItem[] {
  const fromScene = loadSceneFromStorage()?.scripts
  if (fromScene?.length) return fromScene
  return loadScriptsFromStorage() ?? createDefaultScripts()
}

export default function App() {
  const history = useEntityHistory(bootEntities())
  const {
    entities,
    commit,
    replace,
    beginTransient,
    applyTransient,
    endTransient,
    undo,
    redo,
    canUndo,
    canRedo,
  } = history

  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const first = bootEntities()[0]?.id
    return first ? [first] : []
  })
  const [tool, setTool] = useState<ToolMode>('select')
  const [playing, setPlaying] = useState(false)
  const [snap, setSnap] = useState(true)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [diskAssets, setDiskAssets] = useState<AssetItem[]>([])
  const [scripts, setScripts] = useState<AssetItem[]>(bootScripts)
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [assetsError, setAssetsError] = useState<string | null>(null)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(
    'scr_player',
  )
  const [sceneName, setSceneName] = useState(bootName)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [playLog, setPlayLog] = useState('')
  const [counters, setCounters] = useState({ sprite: 1, empty: 1, camera: 1 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const statusTimer = useRef<number | null>(null)
  const entitiesRefForPlay = useRef(entities)
  const scriptsRefForPlay = useRef(scripts)
  entitiesRefForPlay.current = entities
  scriptsRefForPlay.current = scripts

  const assets = useMemo(
    () => [...scripts, ...(diskAssets.length ? diskAssets : STATIC_ASSETS)],
    [scripts, diskAssets],
  )

  const textures = useMemo(
    () => assets.filter((a) => a.type === 'texture'),
    [assets],
  )

  const textureUrlById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const t of textures) {
      if (t.url) map[t.id] = t.url
    }
    return map
  }, [textures])

  const projectLabel = useMemo(() => {
    if (!projectPath) return null
    if (projectPath.startsWith('browser:')) return projectPath.slice(8)
    const parts = projectPath.split(/[\\/]/)
    return parts[parts.length - 1] || projectPath
  }, [projectPath])

  const primaryId = selectedIds[selectedIds.length - 1] ?? null
  const selected = useMemo(
    () => entities.find((e) => e.id === primaryId) ?? null,
    [entities, primaryId],
  )
  const activeScript = useMemo(() => {
    const fromAsset = scripts.find((s) => s.id === selectedAssetId)
    if (fromAsset) return fromAsset
    if (selected?.scriptId) {
      return scripts.find((s) => s.id === selected.scriptId) ?? null
    }
    return null
  }, [scripts, selectedAssetId, selected])

  const flashStatus = useCallback((message: string) => {
    setStatus(message)
    if (statusTimer.current) window.clearTimeout(statusTimer.current)
    statusTimer.current = window.setTimeout(() => setStatus(null), 2800)
  }, [])

  const markDirty = useCallback(() => setDirty(true), [])

  const persistScripts = useCallback((next: AssetItem[]) => {
    setScripts(next)
    saveScriptsToStorage(next)
  }, [])

  const selectEntity = useCallback(
    (id: string | null, opts?: { additive?: boolean; range?: boolean }) => {
      if (!id) {
        setSelectedIds([])
        return
      }
      setSelectedIds((prev) => {
        if (opts?.range && prev.length) {
          const order = flattenHierarchy(entities).map((r) => r.entity.id)
          const anchor = prev[0]
          const a = order.indexOf(anchor)
          const b = order.indexOf(id)
          if (a >= 0 && b >= 0) {
            const [lo, hi] = a < b ? [a, b] : [b, a]
            return order.slice(lo, hi + 1)
          }
        }
        if (opts?.additive) {
          if (prev.includes(id)) return prev.filter((x) => x !== id)
          return [...prev, id]
        }
        return [id]
      })
    },
    [entities],
  )

  const updateEntity = useCallback(
    (id: string, patch: Partial<Entity>) => {
      if ('parentId' in patch) {
        const nextParent = patch.parentId ?? null
        if (wouldCreateCycle(entities, id, nextParent)) {
          flashStatus('Cannot parent: would create a cycle')
          return
        }
      }
      commit((prev) =>
        prev.map((e) => {
          if (e.id !== id) return e
          if (
            e.locked &&
            ('x' in patch ||
              'y' in patch ||
              'width' in patch ||
              'height' in patch ||
              'rotation' in patch ||
              'color' in patch ||
              'name' in patch ||
              'parentId' in patch)
          ) {
            const allowed: Partial<Entity> = {}
            if ('visible' in patch) allowed.visible = patch.visible
            if ('locked' in patch) allowed.locked = patch.locked
            if ('scriptId' in patch) allowed.scriptId = patch.scriptId
            if ('textureId' in patch) allowed.textureId = patch.textureId
            return { ...e, ...allowed }
          }
          return { ...e, ...patch }
        }),
      )
      markDirty()
    },
    [commit, entities, flashStatus, markDirty],
  )

  const onMoveEntity = useCallback(
    (id: string, worldX: number, worldY: number) => {
      applyTransient((prev) => {
        const byId = entityMap(prev)
        return prev.map((e) => {
          if (e.id !== id || e.locked) return e
          const local = worldToLocal(e, worldX, worldY, byId)
          return { ...e, x: local.x, y: local.y }
        })
      })
      markDirty()
    },
    [applyTransient, markDirty],
  )

  const reparent = useCallback(
    (childId: string, parentId: string | null) => {
      if (wouldCreateCycle(entities, childId, parentId)) {
        flashStatus('Cannot parent: would create a cycle')
        return
      }
      updateEntity(childId, { parentId })
    },
    [entities, flashStatus, updateEntity],
  )

  const addEntity = useCallback(
    (kind: EntityKind) => {
      const key =
        kind === 'sprite' ? 'sprite' : kind === 'camera' ? 'camera' : 'empty'
      const nextIndex = counters[key]
      const entity = createEntity(kind, nextIndex)
      setCounters((c) => ({ ...c, [key]: nextIndex + 1 }))
      commit((prev) => [...prev, entity])
      setSelectedIds([entity.id])
      setTool('select')
      markDirty()
    },
    [commit, counters, markDirty],
  )

  const deleteSelected = useCallback(() => {
    if (!selectedIds.length) return
    const remove = new Set<string>()
    for (const id of selectedIds) {
      for (const sid of collectSubtreeIds(entities, id)) remove.add(sid)
    }
    commit((prev) =>
      prev
        .filter((e) => !remove.has(e.id))
        .map((e) =>
          e.parentId && remove.has(e.parentId)
            ? { ...e, parentId: null }
            : e,
        ),
    )
    setSelectedIds([])
    markDirty()
  }, [commit, entities, markDirty, selectedIds])

  const duplicateSelected = useCallback(() => {
    if (!selectedIds.length) return
    const copies: Entity[] = []
    for (const id of selectedIds) {
      const src = entities.find((e) => e.id === id)
      if (src) copies.push(duplicateEntity(src))
    }
    if (!copies.length) return
    commit((prev) => [...prev, ...copies])
    setSelectedIds(copies.map((c) => c.id))
    markDirty()
  }, [commit, entities, markDirty, selectedIds])

  const saveScene = useCallback(() => {
    const doc = toSceneDocument(sceneName, entities, scripts)
    saveSceneToStorage(doc)
    saveScriptsToStorage(scripts)
    downloadScene(doc)
    setDirty(false)
    flashStatus('Saved')
  }, [entities, flashStatus, sceneName, scripts])

  const openScenePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const onSceneFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      try {
        const text = await file.text()
        const doc = parseSceneDocument(JSON.parse(text))
        replace(doc.entities)
        setSceneName(doc.name)
        if (doc.scripts?.length) persistScripts(doc.scripts)
        setSelectedIds(doc.entities[0]?.id ? [doc.entities[0].id] : [])
        setDirty(false)
        saveSceneToStorage(doc)
        flashStatus('Opened')
      } catch (err) {
        flashStatus(err instanceof Error ? err.message : 'Failed to open')
      }
    },
    [flashStatus, persistScripts, replace],
  )

  const handleUndo = useCallback(() => {
    undo()
    markDirty()
  }, [markDirty, undo])

  const handleRedo = useCallback(() => {
    redo()
    markDirty()
  }, [markDirty, redo])

  const togglePlay = useCallback(async () => {
    if (playing) {
      setPlaying(false)
      flashStatus('Stopped')
      return
    }
    setPlaying(true)
    flashStatus('Playing…')
    const jobs = collectReadyJobs(entities, scripts)
    const result = await runRoseGoldHooks(jobs)
    const chunks = [
      result.message,
      result.stdout && `stdout:\n${result.stdout}`,
      result.stderr && `stderr:\n${result.stderr}`,
      'Live on_update running…',
    ].filter(Boolean)
    setPlayLog(chunks.join('\n\n'))
    if (!result.ok) flashStatus(result.message.slice(0, 80))
    else flashStatus('on_ready ok')
  }, [entities, flashStatus, playing, scripts])

  // Live on_update loop while Playing
  useEffect(() => {
    if (!playing) return
    let cancelled = false
    let tick = 0
    const DT = 0.25

    const runTick = async () => {
      tick += 1
      const snapshot = entitiesRefForPlay.current
      const scriptSnap = scriptsRefForPlay.current
      const jobs = collectUpdateJobs(snapshot, scriptSnap, DT)
      if (!jobs.length) {
        const preview = previewUpdateDirectives(snapshot, scriptSnap)
        if (preview.length) {
          applyTransient((prev) => applyDirectives(prev, preview))
        }
        return
      }

      const result = await runRoseGoldHooks(jobs)
      if (cancelled) return

      let directives = parseStrataDirectives(result.stdout, jobs)
      if (!result.ok || !directives.length) {
        directives = previewUpdateDirectives(snapshot, scriptSnap)
      }
      if (directives.length) {
        applyTransient((prev) => applyDirectives(prev, directives))
      }

      const line = result.stdout.trim() || result.message
      if (line) {
        setPlayLog((prev) => {
          const next = `${prev}\n\n--- tick ${tick} ---\n${line}`
          return next.length > 8000 ? next.slice(-8000) : next
        })
      }
    }

    void runTick()
    const id = window.setInterval(() => {
      void runTick()
    }, DT * 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [playing, applyTransient])

  const loadProjectFromPath = useCallback(
    async (path: string) => {
      setAssetsLoading(true)
      setAssetsError(null)
      try {
        const files = await listProjectFiles(path)
        const mapped = await projectFilesToAssets(files)
        setProjectPath(path)
        if (mapped.scripts.length) persistScripts(mapped.scripts)
        else persistScripts([])
        setDiskAssets(mapped.assets)
        if (mapped.errors.length) {
          setAssetsError(mapped.errors.slice(0, 3).join(' · '))
        }
        if (mapped.sceneText) {
          try {
            const doc = parseSceneDocument(JSON.parse(mapped.sceneText))
            const byName = new Map(mapped.scripts.map((s) => [s.name, s.id]))
            const texByName = new Map(
              mapped.assets
                .filter((a) => a.type === 'texture')
                .map((t) => [t.name, t.id]),
            )
            const nextEntities = doc.entities.map((e) => {
              let next = { ...e }
              if (e.scriptId) {
                const bare = e.scriptId.replace(/^file:(?:.*[\\/])?/, '')
                const matched = byName.get(bare) ?? byName.get(e.scriptId)
                if (matched) next = { ...next, scriptId: matched }
              }
              if (e.textureId) {
                const bare = e.textureId.replace(/^file:(?:.*[\\/])?/, '')
                const matched =
                  texByName.get(bare) ?? texByName.get(e.textureId)
                if (matched) next = { ...next, textureId: matched }
              }
              return next
            })
            replace(nextEntities)
            setSceneName(doc.name)
            setSelectedIds(nextEntities[0]?.id ? [nextEntities[0].id] : [])
          } catch {
            // keep current scene if parse fails
          }
        }
        flashStatus(`Loaded ${files.length} file(s)`)
        setDirty(false)
      } catch (err) {
        setAssetsError(err instanceof Error ? err.message : 'Scan failed')
        flashStatus(err instanceof Error ? err.message : 'Open project failed')
      } finally {
        setAssetsLoading(false)
      }
    },
    [flashStatus, persistScripts, replace],
  )

  const openProject = useCallback(async () => {
    try {
      const path = await pickProjectDirectory()
      if (!path) return
      await loadProjectFromPath(path)
    } catch (err) {
      flashStatus(err instanceof Error ? err.message : 'Open project failed')
    }
  }, [flashStatus, loadProjectFromPath])

  const refreshProject = useCallback(async () => {
    if (!projectPath) {
      flashStatus('No project folder open')
      return
    }
    await loadProjectFromPath(projectPath)
  }, [flashStatus, loadProjectFromPath, projectPath])

  const saveProject = useCallback(async () => {
    if (!projectPath) {
      flashStatus('Open a project folder first')
      return
    }
    try {
      const doc = toSceneDocument(sceneName, entities, scripts)
      const sceneFile = sceneName.endsWith('.scene')
        ? sceneName
        : `${sceneName}.scene`
      await writeProjectFile(
        joinProjectPath(projectPath, sceneFile),
        JSON.stringify(doc, null, 2),
      )
      for (const script of scripts) {
        const rel = script.relativePath ?? `scripts/${script.name}`
        await writeProjectFile(
          joinProjectPath(projectPath, rel),
          script.content ?? '',
        )
      }
      saveSceneToStorage(doc)
      saveScriptsToStorage(scripts)
      setDirty(false)
      flashStatus('Project saved')
    } catch (err) {
      flashStatus(err instanceof Error ? err.message : 'Save project failed')
    }
  }, [entities, flashStatus, projectPath, sceneName, scripts])

  const createScript = useCallback(() => {
    const id = uid('scr')
    const next: AssetItem = {
      id,
      name: `Script${scripts.length + 1}.rg`,
      type: 'script',
      language: 'rosegold',
      content: `fn main(): Int {\n    print("hello from Strata");\n    return 0;\n}\n`,
      size: '64 B',
      relativePath: `scripts/Script${scripts.length + 1}.rg`,
    }
    next.size = `${next.content!.length} B`
    persistScripts([...scripts, next])
    setSelectedAssetId(id)
    markDirty()
  }, [markDirty, persistScripts, scripts])

  const updateScriptContent = useCallback(
    (id: string, content: string) => {
      persistScripts(
        scripts.map((s) =>
          s.id === id ? { ...s, content, size: `${content.length} B` } : s,
        ),
      )
      markDirty()
    },
    [markDirty, persistScripts, scripts],
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveScene()
        return
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        handleRedo()
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        if (typing) return
        e.preventDefault()
        duplicateSelected()
        return
      }
      if (typing) return

      if (e.key === 'v' || e.key === 'V') setTool('select')
      if (e.key === 'h' || e.key === 'H') setTool('move')
      if (e.key === 'g' || e.key === 'G') setSnap((s) => !s)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelected()
      }
      if (e.key === ' ') {
        e.preventDefault()
        void togglePlay()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    deleteSelected,
    duplicateSelected,
    handleRedo,
    handleUndo,
    saveScene,
    togglePlay,
  ])

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        tool={tool}
        playing={playing}
        snap={snap}
        sceneName={sceneName}
        projectLabel={projectLabel}
        dirty={dirty}
        status={status}
        canDelete={selectedIds.length > 0}
        canDuplicate={selectedIds.length > 0}
        canUndo={canUndo}
        canRedo={canRedo}
        onToolChange={setTool}
        onSnapToggle={() => setSnap((s) => !s)}
        onPlayToggle={() => void togglePlay()}
        onAddSprite={() => addEntity('sprite')}
        onAddEmpty={() => addEntity('empty')}
        onAddCamera={() => addEntity('camera')}
        onDelete={deleteSelected}
        onDuplicate={duplicateSelected}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={saveScene}
        onLoad={openScenePicker}
        onOpenProject={() => void openProject()}
        onSaveProject={() => void saveProject()}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".scene,.json,application/json"
        className="hidden"
        data-testid="scene-file-input"
        onChange={(e) => {
          void onSceneFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <div className="flex min-h-0 flex-1">
        <Hierarchy
          entities={entities}
          selectedIds={selectedIds}
          onSelect={selectEntity}
          onReparent={reparent}
          onToggleVisible={(id) => {
            const e = entities.find((x) => x.id === id)
            if (e) updateEntity(id, { visible: !e.visible })
          }}
          onToggleLocked={(id) => {
            const e = entities.find((x) => x.id === id)
            if (e) updateEntity(id, { locked: !e.locked })
          }}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Viewport
            entities={entities}
            selectedIds={selectedIds}
            tool={tool}
            playing={playing}
            snap={snap}
            textureUrlById={textureUrlById}
            onSelect={selectEntity}
            onMoveEntity={onMoveEntity}
            onMoveBegin={beginTransient}
            onMoveEnd={endTransient}
          />
          <AssetExplorer
            assets={assets}
            selectedId={selectedAssetId}
            projectLabel={projectLabel}
            loading={assetsLoading}
            error={assetsError}
            onSelect={setSelectedAssetId}
            onRefresh={() => void refreshProject()}
            onOpenProject={() => void openProject()}
            onActivate={(asset) => {
              if (asset.type === 'texture' && primaryId) {
                updateEntity(primaryId, { textureId: asset.id })
                flashStatus(`Texture → ${asset.name}`)
              } else if (asset.type === 'script' && primaryId) {
                updateEntity(primaryId, { scriptId: asset.id })
                setSelectedAssetId(asset.id)
                flashStatus(`Script → ${asset.name}`)
              } else if (asset.type === 'scene' && asset.content) {
                try {
                  const doc = parseSceneDocument(JSON.parse(asset.content))
                  replace(doc.entities)
                  setSceneName(doc.name)
                  flashStatus(`Opened ${asset.name}`)
                } catch {
                  flashStatus(`Could not open ${asset.name}`)
                }
              }
            }}
          />
          <ScriptPanel
            script={activeScript}
            playLog={playLog}
            onChangeContent={updateScriptContent}
            onCreateScript={createScript}
          />
        </div>

        <Inspector
          entity={selected}
          selectedCount={selectedIds.length}
          entities={entities}
          scripts={scripts}
          textures={textures}
          onChange={updateEntity}
        />
      </div>
    </div>
  )
}
