import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AssetExplorer } from '@/components/AssetExplorer'
import { EditorView } from '@/components/EditorView'
import { Hierarchy } from '@/components/Hierarchy'
import { Inspector } from '@/components/Inspector'
import { PanelSplit } from '@/components/PanelSplit'
import { ScenePanel } from '@/components/ScenePanel'
import { ScriptPanel } from '@/components/ScriptPanel'
import { StatusBar } from '@/components/StatusBar'
import { Toolbar } from '@/components/Toolbar'
import { Viewport } from '@/components/Viewport'
import { useEntityHistory } from '@/hooks/useEntityHistory'
import { playSoundAsset } from '@/lib/audio'
import {
  applyDirectives,
  collectReadyJobs,
  collectUpdateJobs,
  parseStrataDirectives,
  previewReadyDirectives,
  previewUpdateDirectives,
  runRoseGoldHooks,
  type RuntimeSideEffect,
} from '@/lib/rosegold'
import { useRuntimeInput } from '@/lib/runtime-input'
import {
  joinProjectPath,
  listProjectFiles,
  pickProjectDirectory,
  projectFilesToAssets,
  writeProjectFile,
} from '@/lib/project'
import { isTauri, openSceneFile, saveSceneFile } from '@/lib/desktop'
import { engineLoadScene, engineTick } from '@/lib/engine'
import {
  clampLayout,
  DEFAULT_LAYOUT,
  loadLayout,
  saveLayout,
  type EditorLayout,
} from '@/lib/layout'
import {
  createDefaultEntities,
  createDefaultScripts,
  createEntity,
  DEFAULT_SCENE_NAME,
  duplicateEntity,
  ensure3dContent,
  loadSceneFromStorage,
  loadScriptsFromStorage,
  parseSceneDocument,
  saveSceneToStorage,
  saveScriptsToStorage,
  STATIC_ASSETS,
  toSceneDocument,
} from '@/lib/scene'
import {
  applyTheme,
  loadTheme,
  saveTheme,
  toggleTheme,
  type ThemeMode,
} from '@/lib/theme'
import {
  collectSubtreeIds,
  entityMap,
  flattenHierarchy,
  wouldCreateCycle,
  worldToLocal,
} from '@/lib/transforms'
import { uid } from '@/lib/utils'
import type {
  AssetItem,
  CameraReadout,
  Entity,
  EntityKind,
  SceneDocument,
  SceneMode,
  ToolMode,
} from '@/types/scene'

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

function bootMode(): SceneMode {
  return loadSceneFromStorage()?.mode ?? '2d'
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
  const [counters, setCounters] = useState({
    sprite: 1,
    empty: 1,
    camera: 1,
    mesh: 1,
    light: 1,
    script: 1,
  })
  const [layout, setLayout] = useState<EditorLayout>(() => loadLayout())
  const [camera, setCamera] = useState<CameraReadout>({
    x: 0,
    y: 0,
    z: 0,
    zoom: 1,
  })
  const [scenePath, setScenePath] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme())
  const [sceneMode, setSceneMode] = useState<SceneMode>(bootMode)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const statusTimer = useRef<number | null>(null)
  const entitiesRefForPlay = useRef(entities)
  const scriptsRefForPlay = useRef(scripts)
  const playSceneRef = useRef({ sceneName, entities, sceneMode, scripts })
  entitiesRefForPlay.current = entities
  scriptsRefForPlay.current = scripts
  playSceneRef.current = { sceneName, entities, sceneMode, scripts }

  const runtimeInput = useRuntimeInput(playing)

  const assets = useMemo(
    () => [...scripts, ...(diskAssets.length ? diskAssets : STATIC_ASSETS)],
    [scripts, diskAssets],
  )

  const assetsRefForPlay = useRef(assets)
  assetsRefForPlay.current = assets

  const textures = useMemo(
    () => assets.filter((a) => a.type === 'texture'),
    [assets],
  )

  const audioClips = useMemo(
    () => assets.filter((a) => a.type === 'audio'),
    [assets],
  )

  const textureUrlById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const t of textures) {
      if (t.url) map[t.id] = t.url
    }
    return map
  }, [textures])

  const audioUrlById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of audioClips) {
      if (a.url) map[a.id] = a.url
    }
    return map
  }, [audioClips])

  const runSideEffects = useCallback((effects: RuntimeSideEffect[]) => {
    for (const fx of effects) {
      if (fx.type === 'play_sound') {
        playSoundAsset(assetsRefForPlay.current, {
          id: fx.assetId,
          name: fx.assetName,
        })
      } else if (fx.type === 'log') {
        setPlayLog((prev) => {
          const next = `${prev}\n${fx.message}`
          return next.length > 8000 ? next.slice(-8000) : next
        })
      }
    }
  }, [])

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

  const updateLayout = useCallback(
    (patch: Partial<EditorLayout> | ((prev: EditorLayout) => Partial<EditorLayout>)) => {
      setLayout((prev) => {
        const resolved = typeof patch === 'function' ? patch(prev) : patch
        const next = clampLayout({ ...prev, ...resolved })
        saveLayout(next)
        return next
      })
    },
    [],
  )

  const handleThemeToggle = useCallback(() => {
    setTheme((prev) => {
      const next = toggleTheme(prev)
      applyTheme(next)
      saveTheme(next)
      return next
    })
  }, [])

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
              'z' in patch ||
              'width' in patch ||
              'height' in patch ||
              'depth' in patch ||
              'rotation' in patch ||
              'rotationX' in patch ||
              'rotationY' in patch ||
              'rotationZ' in patch ||
              'scaleX' in patch ||
              'scaleY' in patch ||
              'scaleZ' in patch ||
              'color' in patch ||
              'name' in patch ||
              'parentId' in patch ||
              'scriptPath' in patch)
          ) {
            const allowed: Partial<Entity> = {}
            if ('visible' in patch) allowed.visible = patch.visible
            if ('locked' in patch) allowed.locked = patch.locked
            if ('scriptId' in patch) allowed.scriptId = patch.scriptId
            if ('textureId' in patch) allowed.textureId = patch.textureId
            if ('audioId' in patch) allowed.audioId = patch.audioId
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

  const onMoveEntity3d = useCallback(
    (id: string, x: number, y: number, z: number) => {
      applyTransient((prev) =>
        prev.map((e) => {
          if (e.id !== id || e.locked) return e
          return { ...e, x, y, z }
        }),
      )
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
      const nextIndex = counters[kind as keyof typeof counters] ?? 1
      const entity = createEntity(kind, nextIndex)
      setCounters((c) => ({ ...c, [kind]: nextIndex + 1 }))
      commit((prev) => [...prev, entity])
      setSelectedIds([entity.id])
      setTool('select')
      markDirty()
    },
    [commit, counters, markDirty],
  )

  const handleModeChange = useCallback(
    (mode: SceneMode) => {
      setSceneMode(mode)
      if (mode === '3d') {
        commit((prev) => ensure3dContent(prev))
      }
      markDirty()
    },
    [commit, markDirty],
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

  const applyOpenedScene = useCallback(
    (doc: SceneDocument, path: string | null) => {
      replace(doc.entities)
      setSceneName(doc.name)
      setSceneMode(doc.mode)
      if (doc.scripts?.length) persistScripts(doc.scripts)
      setSelectedIds(doc.entities[0]?.id ? [doc.entities[0].id] : [])
      setDirty(false)
      setScenePath(path)
      saveSceneToStorage(doc)
      flashStatus('Opened')
    },
    [flashStatus, persistScripts, replace],
  )

  const saveScene = useCallback(async () => {
    const doc = toSceneDocument(sceneName, entities, scripts, sceneMode)
    saveSceneToStorage(doc)
    saveScriptsToStorage(scripts)
    try {
      const path = await saveSceneFile(doc, isTauri() ? scenePath : null)
      if (isTauri()) {
        if (!path) return
        setScenePath(path)
        const base = path.split(/[/\\]/).pop()
        if (base) setSceneName(base)
      }
      setDirty(false)
      flashStatus('Saved')
    } catch (err) {
      flashStatus(err instanceof Error ? err.message : 'Failed to save')
    }
  }, [entities, flashStatus, sceneMode, sceneName, scenePath, scripts])

  const openScenePicker = useCallback(() => {
    void (async () => {
      if (isTauri()) {
        try {
          const result = await openSceneFile()
          if (!result) return
          applyOpenedScene(result.doc, result.path)
        } catch (err) {
          flashStatus(err instanceof Error ? err.message : 'Failed to open')
        }
        return
      }
      fileInputRef.current?.click()
    })()
  }, [applyOpenedScene, flashStatus])

  const onSceneFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      try {
        const text = await file.text()
        const doc = parseSceneDocument(JSON.parse(text))
        applyOpenedScene(doc, null)
      } catch (err) {
        flashStatus(err instanceof Error ? err.message : 'Failed to open')
      }
    },
    [applyOpenedScene, flashStatus],
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
    let readyDirectives = parseStrataDirectives(result.stdout, jobs)
    if (!result.ok || !readyDirectives.length) {
      readyDirectives = previewReadyDirectives(entities, scripts)
    }
    if (readyDirectives.length) {
      const { entities: next, sideEffects } = applyDirectives(
        entities,
        readyDirectives,
        assetsRefForPlay.current,
      )
      applyTransient(() => next)
      runSideEffects(sideEffects)
    }
    const chunks = [
      result.message,
      result.stdout && `stdout:\n${result.stdout}`,
      result.stderr && `stderr:\n${result.stderr}`,
      'Live on_update running…',
    ].filter(Boolean)
    setPlayLog(chunks.join('\n\n'))
    if (!result.ok) flashStatus(result.message.slice(0, 80))
    else flashStatus('on_ready ok')
  }, [applyTransient, entities, flashStatus, playing, runSideEffects, scripts])

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
      const assetSnap = assetsRefForPlay.current
      const keysCsv = runtimeInput.keysCsv()
      const jobs = collectUpdateJobs(snapshot, scriptSnap, DT, keysCsv)
      if (!jobs.length) {
        const preview = previewUpdateDirectives(snapshot, scriptSnap, keysCsv)
        if (preview.length) {
          const { entities: next, sideEffects } = applyDirectives(
            snapshot,
            preview,
            assetSnap,
          )
          applyTransient(() => next)
          runSideEffects(sideEffects)
        }
        return
      }

      const result = await runRoseGoldHooks(jobs)
      if (cancelled) return

      let directives = parseStrataDirectives(result.stdout, jobs)
      if (!result.ok || !directives.length) {
        directives = previewUpdateDirectives(snapshot, scriptSnap, keysCsv)
      }
      if (directives.length) {
        const { entities: next, sideEffects } = applyDirectives(
          snapshot,
          directives,
          assetSnap,
        )
        applyTransient(() => next)
        runSideEffects(sideEffects)
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
  }, [playing, applyTransient, runSideEffects, runtimeInput])

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
            setSceneMode(doc.mode)
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
      const doc = toSceneDocument(sceneName, entities, scripts, sceneMode)
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
  }, [entities, flashStatus, projectPath, sceneMode, sceneName, scripts])

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
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (!playing || !isTauri()) return
    let cancelled = false
    let raf = 0
    let last = performance.now()
    const snap = playSceneRef.current
    void engineLoadScene(
      toSceneDocument(snap.sceneName, snap.entities, snap.scripts, snap.sceneMode),
    )
    const loop = (now: number) => {
      if (cancelled) return
      const dt = (now - last) / 1000
      last = now
      void engineTick(dt)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [playing])

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
        theme={theme}
        mode={sceneMode}
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
        onAddMesh={() => addEntity('mesh')}
        onAddLight={() => addEntity('light')}
        onAddScript={() => addEntity('script')}
        onDelete={deleteSelected}
        onDuplicate={duplicateSelected}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={() => void saveScene()}
        onLoad={openScenePicker}
        onOpenProject={() => void openProject()}
        onSaveProject={() => void saveProject()}
        onThemeToggle={handleThemeToggle}
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
        <div
          className="flex min-h-0 shrink-0 flex-col"
          style={{ width: layout.hierarchyWidth }}
        >
          <ScenePanel mode={sceneMode} onModeChange={handleModeChange} />
          <div className="min-h-0 flex-1">
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
          </div>
        </div>

        <PanelSplit
          orientation="horizontal"
          onDrag={(delta) =>
            updateLayout((prev) => ({
              hierarchyWidth: prev.hierarchyWidth + delta,
            }))
          }
          onReset={() =>
            updateLayout({ hierarchyWidth: DEFAULT_LAYOUT.hierarchyWidth })
          }
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {sceneMode === '3d' ? (
            <EditorView
              entities={entities}
              selectedId={primaryId}
              tool={tool}
              playing={playing}
              theme={theme}
              mode={sceneMode}
              onSelect={(id) => selectEntity(id)}
              onMoveEntity={onMoveEntity3d}
              onMoveBegin={beginTransient}
              onMoveEnd={endTransient}
              onCameraChange={setCamera}
            />
          ) : (
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
          )}
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
                  applyOpenedScene(doc, null)
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

        <PanelSplit
          orientation="horizontal"
          onDrag={(delta) =>
            updateLayout((prev) => ({
              inspectorWidth: prev.inspectorWidth - delta,
            }))
          }
          onReset={() =>
            updateLayout({ inspectorWidth: DEFAULT_LAYOUT.inspectorWidth })
          }
        />

        <Inspector
          entity={selected}
          selectedCount={selectedIds.length}
          entities={entities}
          scripts={scripts}
          textures={textures}
          audioClips={audioClips}
          audioUrlById={audioUrlById}
          mode={sceneMode}
          onChange={updateEntity}
          style={{ width: layout.inspectorWidth }}
        />
      </div>

      <StatusBar
        tool={tool}
        selectionName={selected?.name ?? null}
        entityCount={entities.length}
        dirty={dirty}
        status={status}
        camera={camera}
      />
    </div>
  )
}
