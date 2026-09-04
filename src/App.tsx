import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AssetExplorer } from '@/components/AssetExplorer'
import { NativeMenuBridge, type AppMenuActions } from '@/components/NativeMenuBridge'
import { DockProvider } from '@/components/DockProvider'
import { DockShell } from '@/components/DockShell'
import { EditorView } from '@/components/EditorView'
import { Hierarchy } from '@/components/Hierarchy'
import { Inspector } from '@/components/Inspector'
import {
  EntityContextMenu,
  type SceneContextMenuState,
} from '@/components/EntityContextMenu'
import { LogPanel } from '@/components/LogPanel'
import { ProjectHome } from '@/components/ProjectHome'
import { ScriptPanel } from '@/components/ScriptPanel'
import { SettingsDialog, type SettingsKind } from '@/components/SettingsDialog'
import { StatusBar } from '@/components/StatusBar'
import { AddNodePicker } from '@/components/AddNodePicker'
import { Toolbar } from '@/components/Toolbar'
import { Viewport } from '@/components/Viewport'
import { useEntityHistory } from '@/hooks/useEntityHistory'
import { playSoundAsset, playSoundUrl } from '@/lib/audio'
import {
  applyDirectives,
  collectReadyJobs,
  collectUpdateJobs,
  collectStrataDirectives,
  previewReadyDirectives,
  previewUpdateDirectives,
  runRoseGoldHooks,
  runRoseGoldPreview,
  scriptHasReadyHook,
  type RuntimeSideEffect,
} from '@/lib/rosegold'
import { useRuntimeInput } from '@/lib/runtime-input'
import {
  classifyFileName,
  createProjectDirectory,
  importDroppedFiles,
  joinProjectPath,
  listProjectFiles,
  projectFilesToAssets,
  readProjectFile,
  writeProjectFile,
  writeProjectScripts,
} from '@/lib/project'
import { isTauri, openSceneFile, saveSceneFile } from '@/lib/desktop'
import { defaultLayerId } from '@/lib/draw-order'
import {
  PROJECT_SETTINGS_FILE,
  defaultProjectSettings,
  loadProjectSettingsFromStorage,
  parseProjectSettings,
  saveProjectSettingsToStorage,
} from '@/lib/project-settings'
import {
  loadEditorSettings,
  saveEditorSettings,
  type EditorSettings,
} from '@/lib/editor-settings'
import {
  collectEntityScripts,
  collectAudioClips,
  engineAvailable,
  engineClearPlay,
  engineLoadScene,
  engineSetAudio,
  engineSetKeys,
  engineSetScripts,
  engineSideEffectsToRuntime,
  engineTick,
  mergeEngineEntities,
} from '@/lib/engine'
import { runRoseGoldPreviewWasm, runRoseGoldWasm } from '@/lib/rosegold-wasm'
import { DEFAULT_NEW_SCRIPT } from '@/lib/rosegold-complete'
import { siblingRoseGoldModules } from '@/lib/rosegold-check'
import { mergeDiskScripts } from '@/lib/script-sync'
import { loadDockLayout, type DockZoneId, type PanelId } from '@/lib/dock-layout'
import {
  createDefaultEntities,
  createDefaultPrefabs,
  createDefaultScripts,
  createEntity,
  DEFAULT_SCENE_NAME,
  duplicateEntity,
  ensure3dContent,
  entityDefaults,
  loadSceneFromStorage,
  loadScriptsFromStorage,
  parseSceneDocument,
  saveSceneToStorage,
  saveScriptsToStorage,
  STATIC_ASSETS,
  toSceneDocument,
} from '@/lib/scene'
import {
  applyPrefabToInstances,
  capturePrefab,
  detachPrefabInstances,
  instantiatePrefab,
  prefabRoots,
  removePrefabSubtree,
  resetPrefabInstance,
  upsertPrefab,
  withPrefabOverrides,
} from '@/lib/prefab'
import { upsertTiles } from '@/lib/tilemap'
import {
  listRoseGoldNodes,
  type ScriptNodeDef,
} from '@/lib/rosegold-nodes'
import {
  applyTheme,
  toggleTheme,
} from '@/lib/theme'
import {
  collectSubtreeIds,
  entityMap,
  flattenHierarchy,
  wouldCreateCycle,
  worldToLocal,
} from '@/lib/transforms'
import { isTypingTarget, uid } from '@/lib/utils'
import { clearScriptSession, type ScriptReveal } from '@/lib/script-editor-session'
import {
  resolveScriptIdForLocation,
  type ScriptLogLocation,
} from '@/lib/script-log-locations'
import type {
  AssetItem,
  CameraReadout,
  Entity,
  EntityKind,
  SceneDocument,
  SceneMode,
  ToolMode,
} from '@/types/scene'

// MARK: - Boot

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

function bootPrefabs(): Entity[] {
  const stored = loadSceneFromStorage()?.prefabs
  if (stored?.length) return stored
  return createDefaultPrefabs()
}

function scriptContentsById(list: AssetItem[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of list) out[s.id] = s.content ?? ''
  return out
}

function pruneOpenScriptIds(openIds: string[], list: AssetItem[]): string[] {
  const ids = new Set(list.map((s) => s.id))
  const kept = openIds.filter((id) => ids.has(id))
  if (kept.length) return kept
  return list[0] ? [list[0].id] : []
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
    discardTransient,
    undo,
    redo,
    canUndo,
    canRedo,
  } = history

  // MARK: - State

  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const first = bootEntities()[0]?.id
    return first ? [first] : []
  })
  const [tool, setTool] = useState<ToolMode>('select')
  const [playing, setPlaying] = useState(false)
  const [editor, setEditor] = useState<EditorSettings>(loadEditorSettings)
  const { theme, snap, gridSize, scriptFontSize } = editor
  const [settingsKind, setSettingsKind] = useState<SettingsKind | null>(null)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [homeOpen, setHomeOpen] = useState(true)
  const [enteredEditor, setEnteredEditor] = useState(false)
  const [diskAssets, setDiskAssets] = useState<AssetItem[]>([])
  const [diskFolders, setDiskFolders] = useState<string[]>([])
  const [scripts, setScripts] = useState<AssetItem[]>(bootScripts)
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [assetsError, setAssetsError] = useState<string | null>(null)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [openScriptIds, setOpenScriptIds] = useState<string[]>(() => {
    const first = bootScripts()[0]?.id
    return first ? [first] : []
  })
  const [activeScriptId, setActiveScriptId] = useState<string | null>(
    () => bootScripts()[0]?.id ?? 'scr_player',
  )
  const [savedContents, setSavedContents] = useState<Record<string, string>>(
    () => scriptContentsById(bootScripts()),
  )
  const [sceneName, setSceneName] = useState(bootName)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [playLog, setPlayLog] = useState('')
  const [playHud, setPlayHud] = useState<{ x: number; y: number; text: string }[]>(
    [],
  )
  const [scriptReveal, setScriptReveal] = useState<ScriptReveal | null>(null)
  const [counters, setCounters] = useState({
    sprite: 1,
    empty: 1,
    camera: 1,
    mesh: 1,
    light: 1,
    script: 1,
    tilemap: 1,
  })
  const [camera, setCamera] = useState<CameraReadout>({
    x: 0,
    y: 0,
    z: 0,
    zoom: 1,
  })
  const [scenePath, setScenePath] = useState<string | null>(null)
  const [sceneMode, setSceneMode] = useState<SceneMode>(bootMode)
  const [sceneMenu, setSceneMenu] = useState<SceneContextMenuState | null>(null)
  const [addNodePos, setAddNodePos] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [scriptNodes, setScriptNodes] = useState<ScriptNodeDef[]>([])
  const [prefabs, setPrefabs] = useState<Entity[]>(bootPrefabs)
  const [selectedPrefabId, setSelectedPrefabId] = useState<string | null>(null)
  const [tileBrush, setTileBrush] = useState(0)
  const [renderLayers, setRenderLayers] = useState(
    () => loadProjectSettingsFromStorage().renderLayers,
  )
  const [projectName, setProjectName] = useState(
    () => loadProjectSettingsFromStorage().name,
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const savedContentsRef = useRef(savedContents)
  const projectPathRef = useRef(projectPath)
  const writingProjectRef = useRef(false)
  const syncingScriptsRef = useRef<Promise<AssetItem[]> | null>(null)
  const getAppMenuActions = useCallback((): AppMenuActions => {
    const a = menuActionsRef.current
    return {
      openProject: () => void a.openProject(),
      saveProject: () => void a.saveProject(),
      openScenePicker: a.openScenePicker,
      saveScene: () => void a.saveScene(),
      handleUndo: a.handleUndo,
      handleRedo: a.handleRedo,
      duplicateSelected: a.duplicateSelected,
      deleteSelected: a.deleteSelected,
      togglePlay: () => void a.togglePlay(),
      handleModeChange: a.handleModeChange,
      addEntity: a.addEntity,
      openAddNode: a.openAddNode,
      createScript: a.createScript,
      setTool: a.setTool,
      setSnap: a.setSnap,
      handleThemeToggle: a.handleThemeToggle,
      openProjectSettings: a.openProjectSettings,
      openEditorSettings: a.openEditorSettings,
      flashStatus: a.flashStatus,
    }
  }, [])
  const statusTimer = useRef<number | null>(null)
  const entitiesRefForPlay = useRef(entities)
  const scriptsRefForPlay = useRef(scripts)
  const diskAssetsRef = useRef(diskAssets)
  const scriptBindKeyRef = useRef('')
  /** False until on_ready has applied — prevents the tick loop from racing Play start. */
  const playReadyRef = useRef(false)
  /** Engine host (Tauri or WASM PlaySession) vs source-scan preview. */
  const playUsesEngineRef = useRef(false)
  entitiesRefForPlay.current = entities
  scriptsRefForPlay.current = scripts
  diskAssetsRef.current = diskAssets
  savedContentsRef.current = savedContents
  projectPathRef.current = projectPath
  const prefabsRefForPlay = useRef(prefabs)
  prefabsRefForPlay.current = prefabs

  const runtimeInput = useRuntimeInput(playing)

  // MARK: - Derived data

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

  // MARK: - Runtime side effects

  const runSideEffects = useCallback((effects: RuntimeSideEffect[]) => {
    for (const fx of effects) {
      if (fx.type === 'play_sound') {
        if (fx.url) playSoundUrl(fx.url)
        else {
          playSoundAsset(assetsRefForPlay.current, {
            id: fx.assetId,
            name: fx.assetName,
          })
        }
      } else if (fx.type === 'log') {
        setPlayLog((prev) => {
          const next = `${prev}\n${fx.message}`
          return next.length > 8000 ? next.slice(-8000) : next
        })
      }
    }
  }, [])

  const projectLabel = useMemo(() => {
    const named = projectName.trim()
    if (named) return named
    if (!projectPath) return null
    if (projectPath.startsWith('browser:')) return projectPath.slice(8)
    const parts = projectPath.split(/[\\/]/)
    return parts[parts.length - 1] || projectPath
  }, [projectName, projectPath])

  const primaryId = selectedIds[selectedIds.length - 1] ?? null
  const inspectingPrefab = Boolean(selectedPrefabId)
  const selected = useMemo(() => {
    if (selectedPrefabId) {
      return prefabs.find((e) => e.id === selectedPrefabId) ?? null
    }
    return entities.find((e) => e.id === primaryId) ?? null
  }, [entities, prefabs, primaryId, selectedPrefabId])
  const activeScript = useMemo(() => {
    if (!activeScriptId) return null
    return scripts.find((s) => s.id === activeScriptId) ?? null
  }, [scripts, activeScriptId])

  const attachedEntities = useMemo(() => {
    if (!activeScript) return []
    return entities
      .filter((e) => e.scriptId === activeScript.id)
      .map((e) => e.name)
  }, [entities, activeScript])

  // MARK: - UI helpers

  const persistProjectSettings = useCallback(
    (name: string, layers: typeof renderLayers) => {
      saveProjectSettingsToStorage({ name, renderLayers: layers })
    },
    [],
  )

  const patchEditor = useCallback((patch: Partial<EditorSettings>) => {
    setEditor((prev) => {
      const next: EditorSettings = { ...prev, ...patch }
      next.gridSize = Math.min(256, Math.max(1, Math.round(next.gridSize)))
      next.scriptFontSize = Math.min(
        24,
        Math.max(10, Math.round(next.scriptFontSize)),
      )
      saveEditorSettings(next)
      if (patch.theme) applyTheme(next.theme)
      return next
    })
  }, [])

  const setSnap = useCallback((fn: (s: boolean) => boolean) => {
    setEditor((prev) => {
      const next = { ...prev, snap: fn(prev.snap) }
      saveEditorSettings(next)
      return next
    })
  }, [])

  const handleThemeToggle = useCallback(() => {
    setEditor((prev) => {
      const next = { ...prev, theme: toggleTheme(prev.theme) }
      saveEditorSettings(next)
      applyTheme(next.theme)
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
    scriptsRefForPlay.current = next
    setScripts(next)
    saveScriptsToStorage(next)
  }, [])

  const snapshotSavedScripts = useCallback((list: AssetItem[]) => {
    const snap = scriptContentsById(list)
    savedContentsRef.current = snap
    setSavedContents(snap)
  }, [])

  const adoptScripts = useCallback(
    (list: AssetItem[]) => {
      persistScripts(list)
      snapshotSavedScripts(list)
      setOpenScriptIds((prev) => pruneOpenScriptIds(prev, list))
      setActiveScriptId((cur) => {
        if (cur && list.some((s) => s.id === cur)) return cur
        return list[0]?.id ?? null
      })
    },
    [persistScripts, snapshotSavedScripts],
  )

  const syncScriptsFromDisk = useCallback(async (): Promise<AssetItem[]> => {
    if (syncingScriptsRef.current) return syncingScriptsRef.current
    const path = projectPathRef.current
    if (!path || writingProjectRef.current) return scriptsRefForPlay.current

    const run = (async () => {
      try {
        const files = await listProjectFiles(path)
        if (writingProjectRef.current) return scriptsRefForPlay.current
        const mapped = await projectFilesToAssets(files)
        const current = scriptsRefForPlay.current
        const merged = mergeDiskScripts(
          current,
          mapped.scripts,
          savedContentsRef.current,
        )
        const fingerprint = (list: AssetItem[]) =>
          list.map((s) => `${s.id}\0${s.content ?? ''}`).join('\n')
        if (fingerprint(merged.scripts) === fingerprint(current)) {
          return current
        }
        persistScripts(merged.scripts)
        savedContentsRef.current = merged.savedContents
        setSavedContents(merged.savedContents)
        setOpenScriptIds((prev) => pruneOpenScriptIds(prev, merged.scripts))
        setActiveScriptId((cur) => {
          if (cur && merged.scripts.some((s) => s.id === cur)) return cur
          return merged.scripts[0]?.id ?? null
        })
        if (merged.reloaded.length) {
          const shown = merged.reloaded.slice(0, 3).join(', ')
          const extra =
            merged.reloaded.length > 3 ? ` +${merged.reloaded.length - 3}` : ''
          flashStatus(`Reloaded ${shown}${extra}`)
        }
        return merged.scripts
      } catch {
        return scriptsRefForPlay.current
      }
    })()

    syncingScriptsRef.current = run
    try {
      return await run
    } finally {
      if (syncingScriptsRef.current === run) syncingScriptsRef.current = null
    }
  }, [flashStatus, persistScripts])

  const reloadProjectLibrary = useCallback(async () => {
    const path = projectPathRef.current
    if (!path) {
      return {
        assets: diskAssetsRef.current,
        scripts: scriptsRefForPlay.current,
      }
    }
    const files = await listProjectFiles(path)
    const mapped = await projectFilesToAssets(files)
    setDiskAssets(mapped.assets)
    setDiskFolders(mapped.folders)
    const current = scriptsRefForPlay.current
    const merged = mergeDiskScripts(
      current,
      mapped.scripts,
      savedContentsRef.current,
    )
    persistScripts(merged.scripts)
    savedContentsRef.current = merged.savedContents
    setSavedContents(merged.savedContents)
    setOpenScriptIds((prev) => pruneOpenScriptIds(prev, merged.scripts))
    return { assets: mapped.assets, scripts: merged.scripts }
  }, [persistScripts])

  useEffect(() => {
    if (!projectPath) return
    const onFocus = () => {
      void syncScriptsFromDisk()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void syncScriptsFromDisk()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const id = window.setInterval(() => {
      void syncScriptsFromDisk()
    }, 1500)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(id)
    }
  }, [projectPath, syncScriptsFromDisk])

  const openScript = useCallback((id: string) => {
    setOpenScriptIds((ids) => (ids.includes(id) ? ids : [...ids, id]))
    setActiveScriptId(id)
    setSelectedAssetId(id)
    setSceneMode('script')
  }, [])

  const closeScriptTab = useCallback((id: string) => {
    clearScriptSession(id)
    setOpenScriptIds((ids) => {
      const next = ids.filter((x) => x !== id)
      setActiveScriptId((cur) => {
        if (cur !== id) return cur
        const idx = ids.indexOf(id)
        const fallback = next[idx] ?? next[idx - 1] ?? next[0] ?? null
        if (fallback) setSelectedAssetId(fallback)
        return fallback
      })
      return next
    })
  }, [])

  const jumpToLogLocation = useCallback(
    (loc: ScriptLogLocation) => {
      const scriptId = resolveScriptIdForLocation(
        loc,
        scripts,
        entities,
        activeScriptId,
      )
      if (scriptId) openScript(scriptId)
      else setSceneMode('script')
      if (scriptId) {
        setScriptReveal({
          scriptId,
          line: loc.line,
          col: loc.col,
          nonce: Date.now(),
        })
      }
    },
    [activeScriptId, entities, openScript, scripts],
  )

  // MARK: - Selection & entities

  const selectEntity = useCallback(
    (id: string | null, opts?: { additive?: boolean; range?: boolean }) => {
      if (!id) {
        setSelectedIds([])
        setSelectedPrefabId(null)
        return
      }
      setSelectedAssetId(null)
      setSelectedPrefabId(null)
      setSelectedIds((prev) => {
        if (opts?.range && prev.length) {
          const order = flattenHierarchy(entitiesRefForPlay.current).map(
            (r) => r.entity.id,
          )
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
    [],
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
            return withPrefabOverrides({ ...e, ...allowed }, Object.keys(allowed))
          }
          return withPrefabOverrides({ ...e, ...patch }, Object.keys(patch))
        }),
      )
      markDirty()
    },
    [commit, entities, flashStatus, markDirty],
  )

  const changeRenderLayers = useCallback(
    (layers: typeof renderLayers) => {
      setRenderLayers(layers)
      persistProjectSettings(projectName, layers)
      markDirty()
    },
    [markDirty, persistProjectSettings, projectName],
  )

  const deleteRenderLayer = useCallback(
    (id: string) => {
      if (renderLayers.length <= 1) return
      const fallback =
        [...renderLayers]
          .filter((l) => l.id !== id)
          .sort((a, b) => a.order - b.order)[0]?.id ?? defaultLayerId(renderLayers)
      const next = renderLayers.filter((l) => l.id !== id)
      setRenderLayers(next)
      persistProjectSettings(projectName, next)
      commit((prev) =>
        prev.map((e) => (e.layerId === id ? { ...e, layerId: fallback } : e)),
      )
      setPrefabs((prev) =>
        prev.map((e) => (e.layerId === id ? { ...e, layerId: fallback } : e)),
      )
      markDirty()
    },
    [commit, markDirty, persistProjectSettings, projectName, renderLayers],
  )

  const onMoveEntity = useCallback(
    (id: string, worldX: number, worldY: number) => {
      applyTransient((prev) => {
        const byId = entityMap(prev)
        return prev.map((e) => {
          if (e.id !== id || e.locked) return e
          const local = worldToLocal(e, worldX, worldY, byId)
          return withPrefabOverrides({ ...e, x: local.x, y: local.y }, ['x', 'y'])
        })
      })
      markDirty()
    },
    [applyTransient, markDirty],
  )

  const paintTile = useCallback(
    (id: string, col: number, row: number, index: number | null) => {
      applyTransient((prev) =>
        prev.map((e) =>
          e.id === id && e.kind === 'tilemap'
            ? withPrefabOverrides(
                { ...e, tiles: upsertTiles(e.tiles, col, row, index) },
                ['tiles'],
              )
            : e,
        ),
      )
      markDirty()
    },
    [applyTransient, markDirty],
  )

  const onMoveEntity3d = useCallback(
    (id: string, x: number, y: number, z: number) => {
      applyTransient((prev) =>
        prev.map((e) => {
          if (e.id !== id || e.locked) return e
          return withPrefabOverrides({ ...e, x, y, z }, ['x', 'y', 'z'])
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
    (
      kind: EntityKind,
      opts?: {
        parentId?: string | null
        x?: number
        y?: number
        scriptId?: string
        scriptPath?: string
        name?: string
      },
    ) => {
      const nextIndex = counters[kind as keyof typeof counters] ?? 1
      let entity = createEntity(kind, nextIndex)
      if (opts?.parentId) entity = { ...entity, parentId: opts.parentId }
      if (opts?.x != null && Number.isFinite(opts.x)) {
        entity = { ...entity, x: opts.x }
      }
      if (opts?.y != null && Number.isFinite(opts.y)) {
        entity = { ...entity, y: opts.y }
      }
      if (opts?.scriptId) {
        entity = {
          ...entity,
          scriptId: opts.scriptId,
          scriptPath: opts.scriptPath || entity.scriptPath,
        }
      }
      if (opts?.name) {
        entity = { ...entity, name: opts.name }
      }
      entity = { ...entity, layerId: defaultLayerId(renderLayers) }
      setCounters((c) => ({ ...c, [kind]: nextIndex + 1 }))
      commit((prev) => [...prev, entity])
      setSelectedAssetId(null)
      setSelectedIds([entity.id])
      setTool('select')
      markDirty()
    },
    [commit, counters, markDirty, renderLayers],
  )

  const openAddNode = useCallback((anchor?: HTMLElement | null) => {
    if (sceneMode === 'script') return
    if (anchor) {
      const r = anchor.getBoundingClientRect()
      setAddNodePos({ x: r.left, y: r.bottom + 6 })
    } else {
      setAddNodePos({ x: 220, y: 44 })
    }
  }, [sceneMode])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next: ScriptNodeDef[] = []
      for (const s of scripts) {
        if (s.type !== 'script' || !s.content?.trim()) continue
        const nodes = await listRoseGoldNodes(s.content)
        if (cancelled) return
        for (const n of nodes) {
          next.push({
            ...n,
            scriptId: s.id,
            scriptPath: s.name || s.relativePath || 'script.rg',
          })
        }
      }
      if (!cancelled) setScriptNodes(next)
    })()
    return () => {
      cancelled = true
    }
  }, [scripts])

  const handleModeChange = useCallback(
    (mode: SceneMode) => {
      setSceneMode(mode)
      if (mode === 'script') {
        setAddNodePos(null)
        setOpenScriptIds((prev) => {
          if (prev.length) return prev
          const fallback =
            (selectedAssetId &&
            scripts.some((s) => s.id === selectedAssetId)
              ? selectedAssetId
              : null) ??
            selected?.scriptId ??
            scripts[0]?.id ??
            null
          if (fallback) {
            setActiveScriptId(fallback)
            return [fallback]
          }
          return prev
        })
      }
      if (mode === '3d') {
        commit((prev) => ensure3dContent(prev))
      }
      markDirty()
    },
    [commit, markDirty, scripts, selected, selectedAssetId],
  )

  const deleteSelected = useCallback(() => {
    if (selectedPrefabId) {
      setPrefabs((prev) => removePrefabSubtree(prev, selectedPrefabId))
      setSelectedPrefabId(null)
      markDirty()
      return
    }
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
  }, [commit, entities, markDirty, selectedIds, selectedPrefabId])

  const duplicateSelected = useCallback(() => {
    if (!selectedIds.length) return
    const copies: Entity[] = []
    for (const id of selectedIds) {
      const src = entities.find((e) => e.id === id)
      if (src) copies.push(duplicateEntity(src))
    }
    if (!copies.length) return
    commit((prev) => [...prev, ...copies])
    setSelectedAssetId(null)
    setSelectedIds(copies.map((c) => c.id))
    markDirty()
  }, [commit, entities, markDirty, selectedIds])

  // MARK: - Scene I/O

  const applyOpenedScene = useCallback(
    (doc: SceneDocument, path: string | null) => {
      replace(doc.entities)
      setSceneName(doc.name)
      setSceneMode(doc.mode)
      if (doc.scripts?.length) adoptScripts(doc.scripts)
      setPrefabs(doc.prefabs ?? [])
      setSelectedAssetId(null)
      setSelectedIds(doc.entities[0]?.id ? [doc.entities[0].id] : [])
      setDirty(false)
      setScenePath(path)
      saveSceneToStorage(doc)
      flashStatus('Opened')
    },
    [adoptScripts, flashStatus, replace],
  )

  const saveScene = useCallback(async () => {
    const doc = toSceneDocument(sceneName, entities, scripts, sceneMode, prefabs)
    saveSceneToStorage(doc)
    saveScriptsToStorage(scripts)
    saveProjectSettingsToStorage({ name: projectName, renderLayers })
    try {
      if (projectPath) {
        writingProjectRef.current = true
        try {
          await writeProjectScripts(projectPath, scripts)
        } finally {
          writingProjectRef.current = false
        }
        snapshotSavedScripts(scripts)
      }
      const path = await saveSceneFile(doc, isTauri() ? scenePath : null)
      if (isTauri()) {
        if (!path) {
          if (projectPath) flashStatus('Saved .rg')
          return
        }
        setScenePath(path)
        const base = path.split(/[/\\]/).pop()
        if (base) setSceneName(base)
      }
      setDirty(false)
      snapshotSavedScripts(scripts)
      flashStatus('Saved')
    } catch (err) {
      flashStatus(err instanceof Error ? err.message : 'Failed to save')
    }
  }, [entities, flashStatus, prefabs, projectName, projectPath, renderLayers, sceneMode, sceneName, scenePath, scripts, snapshotSavedScripts])

  const saveAsPrefab = useCallback(
    (entity: Entity) => {
      const captured = capturePrefab(entities, entity.id, scripts)
      if (!captured.length) return
      const nextCatalog = upsertPrefab(prefabs, captured)
      setPrefabs(nextCatalog)
      if (entities.some((e) => e.prefabId)) {
        commit((prev) => applyPrefabToInstances(prev, nextCatalog))
      }
      markDirty()
      flashStatus(`Prefab ${entity.name}`)
    },
    [commit, entities, flashStatus, markDirty, prefabs, scripts],
  )

  const placePrefab = useCallback(
    (prefabId: string, worldX = 0, worldY = 0) => {
      const copies = instantiatePrefab(prefabs, prefabId, worldX, worldY)
      if (!copies.length) {
        flashStatus('Prefab not found')
        return
      }
      commit((prev) => [...prev, ...copies])
      setSelectedPrefabId(null)
      setSelectedAssetId(null)
      setSelectedIds([copies[0]!.id])
      markDirty()
      flashStatus(`Placed ${copies[0]!.name}`)
    },
    [commit, flashStatus, markDirty, prefabs],
  )

  const updatePrefab = useCallback(
    (id: string, patch: Partial<Entity>) => {
      if ('parentId' in patch) {
        const nextParent = patch.parentId ?? null
        if (wouldCreateCycle(prefabs, id, nextParent)) {
          flashStatus('Cannot parent: would create a cycle')
          return
        }
      }
      const nextCatalog = prefabs.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      )
      setPrefabs(nextCatalog)
      if (entities.some((e) => e.prefabId)) {
        commit((prev) => applyPrefabToInstances(prev, nextCatalog))
      }
      markDirty()
    },
    [commit, entities, flashStatus, markDirty, prefabs],
  )

  const revertPrefabInstance = useCallback(
    (id: string) => {
      commit((prev) => resetPrefabInstance(prev, prefabs, id))
      markDirty()
    },
    [commit, markDirty, prefabs],
  )

  const selectPrefab = useCallback((id: string | null) => {
    setSelectedIds([])
    if (id) setSelectedAssetId(null)
    setSelectedPrefabId(id)
  }, [])

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

  // MARK: - Play mode

  const clearPlayLog = useCallback(() => setPlayLog(''), [])

  const runScript = useCallback(
    async (script: AssetItem) => {
      const latestScripts = await syncScriptsFromDisk()
      const latest =
        latestScripts.find((s) => s.id === script.id) ?? script
      let entity = entities.find((e) => e.scriptId === latest.id)
      if (!entity) {
        entity = entityDefaults({
          id: uid('ent'),
          name: 'Preview',
          kind: 'empty',
        })
      }
      const content = latest.content ?? ''
      if (!scriptHasReadyHook(content)) {
        setPlayLog('No on_ready / on_create hook found in this script.')
        flashStatus('No on_ready hook')
        return
      }
      flashStatus('Running on_ready…')
      const modules = siblingRoseGoldModules(latestScripts, latest.id)
      const result = isTauri()
        ? await runRoseGoldPreview(
            content,
            entity.name,
            entity.x,
            entity.y,
            modules,
          )
        : ((await runRoseGoldPreviewWasm(
            content,
            entity.name,
            entity.x,
            entity.y,
            modules,
          )) ?? (await runRoseGoldPreview(content, entity.name, entity.x, entity.y, modules)))
      const chunks = [
        result.message,
        result.stdout && `stdout:\n${result.stdout}`,
        result.stderr && `stderr:\n${result.stderr}`,
      ].filter(Boolean)
      setPlayLog(chunks.join('\n\n'))
      if (!result.ok) flashStatus(result.message.slice(0, 80))
      else flashStatus('on_ready ok')
    },
    [entities, flashStatus, syncScriptsFromDisk],
  )

  const togglePlay = useCallback(async () => {
    if (playing) {
      playReadyRef.current = false
      playUsesEngineRef.current = false
      setPlaying(false)
      setPlayHud([])
      discardTransient()
      await engineClearPlay()
      flashStatus('Stopped')
      return
    }
    const latestScripts = await syncScriptsFromDisk()
    const useEngine = await engineAvailable()
    playUsesEngineRef.current = useEngine
    beginTransient()
    playReadyRef.current = false
    setPlaying(true)
    scriptBindKeyRef.current = ''
    flashStatus('Playing…')

    if (useEngine) {
      const bindings = collectEntityScripts(entities, latestScripts)
      await engineSetScripts(bindings)
      await engineSetAudio(collectAudioClips(assetsRefForPlay.current))
      const engineMode = sceneMode === 'script' ? '2d' : sceneMode
      const frame = await engineLoadScene(
        toSceneDocument(sceneName, entities, latestScripts, engineMode, prefabs),
      )
      if (frame) {
        applyTransient(() =>
          mergeEngineEntities(entities, frame.scene.entities, latestScripts),
        )
        setPlayHud(frame.hud ?? [])
        runSideEffects(engineSideEffectsToRuntime(frame.sideEffects))
        const hostLabel = isTauri() ? 'Engine host' : 'WASM engine'
        const chunks = [
          bindings.length
            ? `${hostLabel}: ${bindings.length} script(s)`
            : `${hostLabel}: no entity scripts`,
          frame.stdout && `stdout:\n${frame.stdout}`,
          'Live on_update running…',
        ].filter(Boolean)
        setPlayLog(chunks.join('\n\n'))
        if (frame.hadError) {
          flashStatus('Script error — see play log')
        } else {
          flashStatus('on_ready ok')
        }
        playReadyRef.current = true
      } else {
        setPlayLog('Engine load failed')
        flashStatus('Engine load failed')
        playReadyRef.current = false
        playUsesEngineRef.current = false
        setPlaying(false)
        setPlayHud([])
        discardTransient()
      }
      return
    }

    // No WASM engine: source-scan preview (no persistent VMs / imports).
    const jobs = collectReadyJobs(entities, latestScripts)
    let result = await runRoseGoldWasm(
      jobs.map((j) => ({ label: j.label, source: j.source })),
    )
    if (!result) {
      result = await runRoseGoldHooks(jobs)
    }
    let readyDirectives = collectStrataDirectives(result, jobs)
    const preview = previewReadyDirectives(entities, latestScripts)
    if (!readyDirectives.length) {
      readyDirectives = preview
    } else if (preview.length) {
      const seen = new Set(
        readyDirectives.map((d) => `${d.type}:${'entityId' in d ? d.entityId : ''}`),
      )
      for (const d of preview) {
        const key = `${d.type}:${'entityId' in d ? d.entityId : ''}`
        if (d.type === 'spawn' || d.type === 'spawnPrefab' || d.type === 'play_sound' || !seen.has(key)) {
          readyDirectives.push(d)
          seen.add(key)
        }
      }
    }
    if (readyDirectives.length) {
      const { entities: next, sideEffects } = applyDirectives(
        entities,
        readyDirectives,
        assetsRefForPlay.current,
        prefabsRefForPlay.current,
      )
      applyTransient(() => next)
      runSideEffects(sideEffects)
    }
    const chunks = [
      `Browser preview: ${result.message}`,
      result.stdout && `stdout:\n${result.stdout}`,
      result.stderr && `stderr:\n${result.stderr}`,
      'Live on_update running…',
    ].filter(Boolean)
    setPlayLog(chunks.join('\n\n'))
    if (!result.ok) flashStatus(result.message.slice(0, 80))
    else flashStatus('on_ready ok')
    playReadyRef.current = true
  }, [
    applyTransient,
    beginTransient,
    discardTransient,
    entities,
    flashStatus,
    playing,
    runSideEffects,
    sceneMode,
    sceneName,
    syncScriptsFromDisk,
    prefabs,
  ])

  // Live on_update loop while Playing
  useEffect(() => {
    if (!playing) return
    let cancelled = false

    // Cached-hook host (desktop Tauri or browser WASM)
    if (playUsesEngineRef.current) {
      let raf = 0
      let last = performance.now()
      let busy = false
      const loop = (now: number) => {
        if (cancelled) return
        const dt = Math.min(0.05, (now - last) / 1000)
        last = now
        if (!busy && playReadyRef.current) {
          busy = true
          void (async () => {
            try {
              const { keysCsv, pressedCsv } = runtimeInput.poll()
              await engineSetKeys(keysCsv, pressedCsv)
              const frame = await engineTick(dt)
              if (cancelled || !frame) return
              const nextEntities = mergeEngineEntities(
                entitiesRefForPlay.current,
                frame.scene.entities,
                scriptsRefForPlay.current,
              )
              applyTransient(() => nextEntities)
              setPlayHud(frame.hud ?? [])
              // Re-bind only when the set of scripted entities changes (e.g. spawn)
              const bindings = collectEntityScripts(
                nextEntities,
                scriptsRefForPlay.current,
              )
              const bindKey = bindings
                .map((b) => b.entityId)
                .sort()
                .join(',')
              if (bindKey !== scriptBindKeyRef.current) {
                scriptBindKeyRef.current = bindKey
                await engineSetScripts(bindings)
              }
              runSideEffects(engineSideEffectsToRuntime(frame.sideEffects))
              const line = frame.stdout.trim()
              if (line) {
                setPlayLog((prev) => {
                  const next = `${prev}\n\n--- engine ---\n${line}`
                  return next.length > 8000 ? next.slice(-8000) : next
                })
              }
              if (frame.hadError) {
                flashStatus('Script error — see play log')
              }
            } finally {
              busy = false
            }
          })()
        }
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
      return () => {
        cancelled = true
        cancelAnimationFrame(raf)
      }
    }

    // Browser: hooks / directive preview
    let tick = 0
    const DT = 0.25

    const runTick = async () => {
      if (!playReadyRef.current) return
      tick += 1
      const snapshot = entitiesRefForPlay.current
      const scriptSnap = scriptsRefForPlay.current
      const assetSnap = assetsRefForPlay.current
      const { keysCsv, pressedCsv } = runtimeInput.poll()
      const jobs = collectUpdateJobs(
        snapshot,
        scriptSnap,
        DT,
        keysCsv,
        pressedCsv,
      )
      if (!jobs.length) {
        const preview = previewUpdateDirectives(
          snapshot,
          scriptSnap,
          keysCsv,
          pressedCsv,
        )
        if (preview.length) {
          const { entities: next, sideEffects } = applyDirectives(
            snapshot,
            preview,
            assetSnap,
            prefabsRefForPlay.current,
          )
          applyTransient(() => next)
          runSideEffects(sideEffects)
        }
        return
      }

      const result =
        (await runRoseGoldWasm(
          jobs.map((j) => ({ label: j.label, source: j.source })),
        )) ?? (await runRoseGoldHooks(jobs))
      if (cancelled || !playReadyRef.current) return

      let directives = collectStrataDirectives(result, jobs)
      if (!result.ok || !directives.length) {
        directives = previewUpdateDirectives(
          snapshot,
          scriptSnap,
          keysCsv,
          pressedCsv,
        )
      }
      if (directives.length) {
        // Always apply onto the latest entity list so we don't wipe spawns.
        const { entities: next, sideEffects } = applyDirectives(
          entitiesRefForPlay.current,
          directives,
          assetSnap,
          prefabsRefForPlay.current,
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
  }, [playing, applyTransient, flashStatus, runSideEffects, runtimeInput])

  // MARK: - Project

  const loadProjectFromPath = useCallback(
    async (path: string): Promise<boolean> => {
      setAssetsLoading(true)
      setAssetsError(null)
      try {
        const files = await listProjectFiles(path)
        const mapped = await projectFilesToAssets(files)
        setProjectPath(path)
        try {
          const settingsText = await readProjectFile(
            joinProjectPath(path, PROJECT_SETTINGS_FILE),
          )
          if (settingsText) {
            const parsed = parseProjectSettings(JSON.parse(settingsText))
            setRenderLayers(parsed.renderLayers)
            setProjectName(parsed.name)
          } else {
            const fallback = defaultProjectSettings()
            setRenderLayers(fallback.renderLayers)
            setProjectName(fallback.name)
          }
        } catch {
          const fallback = defaultProjectSettings()
          setRenderLayers(fallback.renderLayers)
          setProjectName(fallback.name)
        }
        if (mapped.scripts.length) adoptScripts(mapped.scripts)
        else adoptScripts([])
        setDiskAssets(mapped.assets)
        setDiskFolders(mapped.folders)
        if (mapped.scenePath) setScenePath(mapped.scenePath)
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
            const remap = (e: Entity) => {
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
            }
            const nextEntities = doc.entities.map(remap)
            setPrefabs((doc.prefabs ?? []).map(remap))
            replace(nextEntities)
            setSceneName(doc.name)
            setSceneMode(doc.mode)
            setSelectedAssetId(null)
            setSelectedIds(nextEntities[0]?.id ? [nextEntities[0].id] : [])
          } catch {
            // keep current scene if parse fails
          }
        }
        flashStatus(`Loaded ${files.length} file(s)`)
        setDirty(false)
        return true
      } catch (err) {
        setAssetsError(err instanceof Error ? err.message : 'Scan failed')
        flashStatus(err instanceof Error ? err.message : 'Open project failed')
        return false
      } finally {
        setAssetsLoading(false)
      }
    },
    [adoptScripts, flashStatus, replace],
  )

  const goHome = useCallback(async () => {
    if (homeOpen) return
    if (dirty && !window.confirm('You have unsaved changes. Leave the editor anyway?')) {
      return
    }
    if (playing) {
      playReadyRef.current = false
      playUsesEngineRef.current = false
      setPlaying(false)
      setPlayHud([])
      discardTransient()
      await engineClearPlay()
    }
    setHomeOpen(true)
  }, [dirty, discardTransient, homeOpen, playing])

  const enterEditor = useCallback(() => {
    setHomeOpen(false)
    setEnteredEditor(true)
  }, [])

  const openProjectFromHome = useCallback(
    async (path: string) => {
      const ok = await loadProjectFromPath(path)
      if (!ok) throw new Error('Open project failed')
      enterEditor()
    },
    [enterEditor, loadProjectFromPath],
  )

  const openProject = useCallback(() => {
    void goHome()
  }, [goHome])

  const refreshProject = useCallback(async () => {
    if (!projectPath) {
      flashStatus('No project folder open')
      return
    }
    await loadProjectFromPath(projectPath)
  }, [flashStatus, loadProjectFromPath, projectPath])

  const importInspectorFiles = useCallback(
    async (files: File[], prefer?: AssetItem['type']) => {
      const path = projectPathRef.current
      if (!path) {
        flashStatus('Open a project folder first')
        return
      }
      const targetId = selectedPrefabId ?? primaryId
      const apply = selectedPrefabId ? updatePrefab : updateEntity
      try {
        const existing = [
          ...scriptsRefForPlay.current,
          ...diskAssetsRef.current,
        ].map((a) => a.relativePath ?? a.name)
        const imported = await importDroppedFiles(path, files, existing, prefer)
        if (!imported.length) {
          flashStatus(
            files.some((f) => classifyFileName(f.name) === 'scene')
              ? 'Open scenes from Files'
              : 'Nothing to import',
          )
          return
        }
        const lib = await reloadProjectLibrary()
        const all = [...lib.assets, ...lib.scripts]
        const patch: Partial<Entity> = {}
        const labels: string[] = []
        for (const item of imported) {
          const rel = item.relativePath.replace(/\\/g, '/')
          const hit = all.find(
            (a) =>
              a.type === item.type &&
              (a.relativePath ?? a.name).replace(/\\/g, '/') === rel,
          )
          if (!hit) continue
          if (hit.type === 'texture') {
            patch.textureId = hit.id
            labels.push(`Texture → ${hit.name}`)
          } else if (hit.type === 'audio') {
            patch.audioId = hit.id
            labels.push(`Audio → ${hit.name}`)
          } else if (hit.type === 'script') {
            patch.scriptId = hit.id
            labels.push(`Script → ${hit.name}`)
          }
        }
        if (targetId && Object.keys(patch).length) apply(targetId, patch)
        flashStatus(
          labels.length === 1
            ? labels[0]!
            : labels.length
              ? `Imported ${imported.length} file(s)`
              : `Imported ${imported.length} file(s)`,
        )
      } catch (err) {
        flashStatus(err instanceof Error ? err.message : 'Import failed')
      }
    },
    [
      flashStatus,
      primaryId,
      reloadProjectLibrary,
      selectedPrefabId,
      updateEntity,
      updatePrefab,
    ],
  )

  const saveProject = useCallback(async () => {
    if (!projectPath) {
      flashStatus('Open a project folder first')
      return
    }
    writingProjectRef.current = true
    try {
      const doc = toSceneDocument(sceneName, entities, scripts, sceneMode, prefabs)
      const sceneFile = sceneName.endsWith('.scene')
        ? sceneName
        : `${sceneName}.scene`
      await writeProjectFile(
        joinProjectPath(projectPath, sceneFile),
        JSON.stringify(doc, null, 2),
      )
      await writeProjectFile(
        joinProjectPath(projectPath, PROJECT_SETTINGS_FILE),
        JSON.stringify({ name: projectName, renderLayers }, null, 2),
      )
      await writeProjectScripts(projectPath, scripts)
      saveSceneToStorage(doc)
      saveScriptsToStorage(scripts)
      setDirty(false)
      snapshotSavedScripts(scripts)
      flashStatus('Project saved')
    } catch (err) {
      flashStatus(err instanceof Error ? err.message : 'Save project failed')
    } finally {
      writingProjectRef.current = false
    }
  }, [entities, flashStatus, prefabs, projectName, projectPath, renderLayers, sceneMode, sceneName, scripts, snapshotSavedScripts])

  const createExplorerFolder = useCallback(
    async (relativeDir: string) => {
      if (!projectPath) {
        flashStatus('Open a project folder first')
        throw new Error('Open a project folder first')
      }
      await createProjectDirectory(projectPath, relativeDir)
      setDiskFolders((prev) =>
        prev.includes(relativeDir) ? prev : [...prev, relativeDir],
      )
      flashStatus(`Created ${relativeDir}`)
    },
    [flashStatus, projectPath],
  )

  const createScript = useCallback(() => {
    const id = uid('scr')
    const next: AssetItem = {
      id,
      name: `Script${scripts.length + 1}.rg`,
      type: 'script',
      language: 'rosegold',
      content: DEFAULT_NEW_SCRIPT,
      size: '64 B',
      relativePath: `scripts/Script${scripts.length + 1}.rg`,
    }
    next.size = `${next.content!.length} B`
    persistScripts([...scripts, next])
    openScript(id)
    markDirty()
  }, [markDirty, openScript, persistScripts, scripts])

  const handleAssetSelect = useCallback((id: string) => {
    setSelectedIds([])
    setSelectedPrefabId(null)
    setSelectedAssetId(id)
  }, [])

  const activateAsset = useCallback(
    (asset: AssetItem) => {
      if (asset.type === 'texture') {
        if (!primaryId) {
          flashStatus('Select an entity first')
          return
        }
        updateEntity(primaryId, { textureId: asset.id })
        flashStatus(`Texture → ${asset.name}`)
      } else if (asset.type === 'audio') {
        if (!primaryId) {
          flashStatus('Select an entity first')
          return
        }
        updateEntity(primaryId, { audioId: asset.id })
        flashStatus(`Audio → ${asset.name}`)
      } else if (asset.type === 'script') {
        openScript(asset.id)
        flashStatus(`Editing ${asset.name}`)
      } else if (asset.type === 'scene' && asset.content) {
        try {
          const doc = parseSceneDocument(JSON.parse(asset.content))
          applyOpenedScene(doc, null)
          flashStatus(`Opened ${asset.name}`)
        } catch {
          flashStatus(`Could not open ${asset.name}`)
        }
      }
    },
    [applyOpenedScene, flashStatus, openScript, primaryId, updateEntity],
  )

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

  // MARK: - Keyboard shortcuts

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (homeOpen) return
      const target = e.target as HTMLElement | null
      const typing = isTypingTarget(target)
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveScene()
        return
      }
      if (mod && e.key.toLowerCase() === 'z') {
        if (typing) return
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        if (typing) return
        e.preventDefault()
        handleRedo()
        return
      }
      if (mod && e.key === ',') {
        e.preventDefault()
        setSettingsKind(e.shiftKey ? 'project' : 'editor')
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        if (typing) return
        e.preventDefault()
        duplicateSelected()
        return
      }
      if (typing) return
      if (mod) return

      if (e.key === '1') {
        handleModeChange('2d')
        return
      }
      if (e.key === '2') {
        handleModeChange('3d')
        return
      }
      if (e.key === '3') {
        handleModeChange('script')
        return
      }

      if (sceneMode === 'script') return

      if (e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        setAddNodePos((pos) => (pos ? null : { x: 220, y: 44 }))
        return
      }

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
    handleModeChange,
    handleRedo,
    handleUndo,
    homeOpen,
    saveScene,
    sceneMode,
    togglePlay,
  ])

  // MARK: - Native menu
  const menuActionsRef = useRef({
    openProject,
    saveProject,
    openScenePicker,
    saveScene,
    handleUndo,
    handleRedo,
    duplicateSelected,
    deleteSelected,
    togglePlay,
    handleModeChange,
    addEntity,
    createScript,
    setTool,
    setSnap,
    handleThemeToggle,
    openProjectSettings: () => setSettingsKind('project'),
    openEditorSettings: () => setSettingsKind('editor'),
    flashStatus,
    openAddNode,
  })
  menuActionsRef.current = {
    openProject,
    saveProject,
    openScenePicker,
    saveScene,
    handleUndo,
    handleRedo,
    duplicateSelected,
    deleteSelected,
    togglePlay,
    handleModeChange,
    addEntity,
    createScript,
    setTool,
    setSnap,
    handleThemeToggle,
    openProjectSettings: () => setSettingsKind('project'),
    openEditorSettings: () => setSettingsKind('editor'),
    flashStatus,
    openAddNode,
  }

  // MARK: - Dock panels

  const renderDockPanel = useCallback(
    (panelId: PanelId, opts: { chromeless: boolean; zone: DockZoneId }) => {
      switch (panelId) {
        case 'hierarchy':
          return (
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
              onOpenMenu={setSceneMenu}
              onAddNode={openAddNode}
              prefabs={prefabs}
              selectedPrefabId={selectedPrefabId}
              onSelectPrefab={selectPrefab}
              onTogglePrefabVisible={(id) => {
                const e = prefabs.find((x) => x.id === id)
                if (e) updatePrefab(id, { visible: !e.visible })
              }}
              onTogglePrefabLocked={(id) => {
                const e = prefabs.find((x) => x.id === id)
                if (e) updatePrefab(id, { locked: !e.locked })
              }}
              chromeless={opts.chromeless}
              dockZone={opts.zone}
            />
          )
        case 'viewport':
          return (
            <div className="flex h-full min-h-0 w-full flex-col">
              <div className="min-h-0 flex-1">
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
                ) : sceneMode === 'script' ? (
                  <ScriptPanel
                    scripts={scripts}
                    openIds={openScriptIds}
                    activeId={activeScriptId}
                    savedContents={savedContents}
                    attachedEntities={attachedEntities}
                    onSelectTab={openScript}
                    onCloseTab={closeScriptTab}
                    onChangeContent={updateScriptContent}
                    onCreateScript={createScript}
                    onRunScript={runScript}
                    reveal={scriptReveal}
                    onJumpSymbol={(id, line, col) => {
                      openScript(id)
                      setScriptReveal({
                        scriptId: id,
                        line,
                        col,
                        nonce: Date.now(),
                      })
                    }}
                    fontSize={scriptFontSize}
                  />
                ) : (
                  <Viewport
                    entities={entities}
                    selectedIds={selectedIds}
                    tool={tool}
                    playing={playing}
                    snap={snap}
                    gridSize={gridSize}
                    textureUrlById={textureUrlById}
                    renderLayers={renderLayers}
                    hud={playing ? playHud : []}
                    onSelect={selectEntity}
                    onMoveEntity={onMoveEntity}
                    onMoveBegin={beginTransient}
                    onMoveEnd={endTransient}
                    onSceneMenu={(info) => {
                      if (info.entityId && !selectedIds.includes(info.entityId)) {
                        selectEntity(info.entityId)
                      }
                      setSceneMenu(info)
                    }}
                    onPlacePrefab={placePrefab}
                    tileBrush={tileBrush}
                    onPaintBegin={beginTransient}
                    onPaintTile={paintTile}
                    onPaintEnd={endTransient}
                  />
                )}
              </div>
            </div>
          )
        case 'assets':
          return (
            <AssetExplorer
              assets={assets}
              selectedId={selectedAssetId}
              projectLabel={projectLabel}
              loading={assetsLoading}
              error={assetsError}
              onSelect={handleAssetSelect}
              onRefresh={() => void refreshProject()}
              onOpenProject={() => void openProject()}
              onCreateScript={createScript}
              extraFolders={projectPath ? diskFolders : []}
              onCreateFolder={projectPath ? createExplorerFolder : undefined}
              chromeless={opts.chromeless}
              dockZone={opts.zone}
              canAssign={Boolean(primaryId)}
              onAssign={(asset) => {
                if (!primaryId) {
                  flashStatus('Select an entity first')
                  return
                }
                if (asset.type === 'texture') {
                  updateEntity(primaryId, { textureId: asset.id })
                  flashStatus(`Texture → ${asset.name}`)
                } else if (asset.type === 'audio') {
                  updateEntity(primaryId, { audioId: asset.id })
                  flashStatus(`Audio → ${asset.name}`)
                } else if (asset.type === 'script') {
                  updateEntity(primaryId, { scriptId: asset.id })
                  flashStatus(`Script → ${asset.name}`)
                }
              }}
              onActivate={activateAsset}
            />
          )
        case 'inspector':
          return (
            <Inspector
              entity={selected}
              selectedCount={inspectingPrefab ? 1 : selectedIds.length}
              entities={inspectingPrefab ? prefabs : entities}
              scripts={scripts}
              textures={textures}
              audioClips={audioClips}
              audioUrlById={audioUrlById}
              mode={sceneMode}
              prefabs={prefabs}
              onSavePrefab={saveAsPrefab}
              inspectingPrefab={inspectingPrefab}
              onPlacePrefab={(id) => placePrefab(id, 0, 0)}
              onDeletePrefab={(id) => {
                const victim = prefabs.find((p) => p.id === id)
                const nextCatalog = removePrefabSubtree(prefabs, id)
                setPrefabs(nextCatalog)
                setSelectedPrefabId(null)
                if (victim && !victim.parentId) {
                  commit((ents) => detachPrefabInstances(ents, id))
                } else if (entities.some((e) => e.prefabId)) {
                  commit((ents) => applyPrefabToInstances(ents, nextCatalog))
                }
                markDirty()
              }}
              onResetPrefab={inspectingPrefab ? undefined : revertPrefabInstance}
              renderLayers={renderLayers}
              onChangeRenderLayers={changeRenderLayers}
              onDeleteLayer={deleteRenderLayer}
              previewAsset={
                selected
                  ? null
                  : (assets.find((a) => a.id === selectedAssetId) ?? null)
              }
              onPreviewActivate={activateAsset}
              canAssignPreview={false}
              tileBrush={tileBrush}
              onTileBrushChange={setTileBrush}
              onChange={inspectingPrefab ? updatePrefab : updateEntity}
              onStatus={flashStatus}
              onImportFiles={importInspectorFiles}
              chromeless={opts.chromeless}
              dockZone={opts.zone}
            />
          )
        case 'log':
          return (
            <LogPanel
              playLog={playLog}
              onClear={clearPlayLog}
              onJumpToLocation={jumpToLogLocation}
              chromeless={opts.chromeless}
              dockZone={opts.zone}
            />
          )
      }
    },
    [
      activeScriptId,
      activateAsset,
      applyOpenedScene,
      assets,
      assetsError,
      assetsLoading,
      attachedEntities,
      audioClips,
      audioUrlById,
      beginTransient,
      clearPlayLog,
      closeScriptTab,
      commit,
      createExplorerFolder,
      createScript,
      changeRenderLayers,
      deleteRenderLayer,
      diskFolders,
      endTransient,
      entities,
      flashStatus,
      handleAssetSelect,
      handleModeChange,
      importInspectorFiles,
      inspectingPrefab,
      jumpToLogLocation,
      markDirty,
      onMoveEntity,
      onMoveEntity3d,
      openProject,
      openScript,
      openScriptIds,
      paintTile,
      playLog,
      playHud,
      playing,
      prefabs,
      placePrefab,
      primaryId,
      projectLabel,
      projectPath,
      refreshProject,
      reparent,
      renderLayers,
      revertPrefabInstance,
      runScript,
      saveAsPrefab,
      savedContents,
      sceneMode,
      scriptReveal,
      scripts,
      selectEntity,
      selectPrefab,
      selected,
      selectedAssetId,
      selectedIds,
      selectedPrefabId,
      snap,
      gridSize,
      scriptFontSize,
      textureUrlById,
      theme,
      tileBrush,
      tool,
      updateEntity,
      updatePrefab,
      updateScriptContent,
    ],
  )

  // MARK: - Render

  return (
    <DockProvider initialLayout={loadDockLayout()}>
      <NativeMenuBridge getActions={getAppMenuActions} />
      {homeOpen ? (
        <ProjectHome
          theme={theme}
          enteredEditor={enteredEditor}
          onThemeToggle={handleThemeToggle}
          onOpenProject={openProjectFromHome}
          onContinueDemo={enterEditor}
          onBackToEditor={enterEditor}
        />
      ) : (
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
          canDelete={selectedIds.length > 0 || Boolean(selectedPrefabId)}
          canDuplicate={selectedIds.length > 0}
          canUndo={canUndo}
          canRedo={canRedo}
          onToolChange={setTool}
          onSnapToggle={() => setSnap((s) => !s)}
          onPlayToggle={() => void togglePlay()}
          onAddNode={openAddNode}
          onCreateScriptAsset={createScript}
          onDelete={deleteSelected}
          onDuplicate={duplicateSelected}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onSave={() => void saveScene()}
          onLoad={openScenePicker}
          onOpenProject={() => void openProject()}
          onSaveProject={() => void saveProject()}
          onThemeToggle={handleThemeToggle}
          onProjectSettings={() => setSettingsKind('project')}
          onEditorSettings={() => setSettingsKind('editor')}
          onModeChange={handleModeChange}
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

        <DockShell renderPanel={renderDockPanel} />

        {sceneMenu && (
          <EntityContextMenu
            menu={sceneMenu}
            entity={
              sceneMenu.entityId
                ? (entities.find((e) => e.id === sceneMenu.entityId) ?? null)
                : null
            }
            mode={sceneMode}
            onClose={() => setSceneMenu(null)}
            onDuplicate={duplicateSelected}
            onDelete={deleteSelected}
            onToggleVisible={(id) => {
              const e = entities.find((x) => x.id === id)
              if (e) updateEntity(id, { visible: !e.visible })
            }}
            onToggleLocked={(id) => {
              const e = entities.find((x) => x.id === id)
              if (e) updateEntity(id, { locked: !e.locked })
            }}
            onUnparent={(id) => reparent(id, null)}
            onAdd={addEntity}
            prefabRoots={prefabRoots(prefabs)}
            onPlacePrefab={placePrefab}
            scriptNodes={scriptNodes}
          />
        )}

        {addNodePos && sceneMode !== 'script' && (
          <AddNodePicker
            mode={sceneMode}
            x={addNodePos.x}
            y={addNodePos.y}
            scriptNodes={scriptNodes}
            onClose={() => setAddNodePos(null)}
            onPick={(kind, script) => {
              addEntity(kind, script
                ? {
                    scriptId: script.scriptId,
                    scriptPath: script.scriptPath,
                    name: script.className,
                  }
                : undefined)
              setAddNodePos(null)
            }}
          />
        )}

        {settingsKind && (
          <SettingsDialog
            kind={settingsKind}
            projectName={projectName}
            folderLabel={
              projectPath
                ? projectPath.startsWith('browser:')
                  ? projectPath.slice(8)
                  : projectPath.split(/[\\/]/).pop() ?? projectPath
                : null
            }
            renderLayers={renderLayers}
            editor={editor}
            onProjectName={(name) => {
              setProjectName(name)
              persistProjectSettings(name, renderLayers)
              markDirty()
            }}
            onChangeLayers={changeRenderLayers}
            onDeleteLayer={deleteRenderLayer}
            onEditor={patchEditor}
            onClose={() => setSettingsKind(null)}
          />
        )}

        <StatusBar
          tool={tool}
          selectionName={selected?.name ?? null}
          entityCount={entities.length}
          dirty={dirty}
          status={status}
          camera={camera}
        />
      </div>
      )}
    </DockProvider>
  )
}
