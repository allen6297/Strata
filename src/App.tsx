import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AssetBrowser } from '@/components/AssetBrowser'
import { Hierarchy } from '@/components/Hierarchy'
import { Inspector } from '@/components/Inspector'
import { ScriptPanel } from '@/components/ScriptPanel'
import { Toolbar } from '@/components/Toolbar'
import { Viewport } from '@/components/Viewport'
import { useEntityHistory } from '@/hooks/useEntityHistory'
import { buildPlayDriver, runRoseGoldSource } from '@/lib/rosegold'
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
  const [scripts, setScripts] = useState<AssetItem[]>(bootScripts)
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

  const assets = useMemo(
    () => [...scripts, ...STATIC_ASSETS],
    [scripts],
  )

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
    const driver = buildPlayDriver(entities, scripts)
    const result = await runRoseGoldSource(driver)
    const chunks = [
      result.message,
      result.stdout && `stdout:\n${result.stdout}`,
      result.stderr && `stderr:\n${result.stderr}`,
      !result.ok ? '(Viewport preview still animates in Play mode.)' : '',
    ].filter(Boolean)
    setPlayLog(chunks.join('\n\n'))
    if (!result.ok) flashStatus(result.message.slice(0, 80))
    else flashStatus('RoseGold ok')
  }, [entities, flashStatus, playing, scripts])

  const createScript = useCallback(() => {
    const id = uid('scr')
    const next: AssetItem = {
      id,
      name: `Script${scripts.length + 1}.rg`,
      type: 'script',
      language: 'rosegold',
      content: `fn main(): Int {\n    print("hello from Strata");\n    return 0;\n}\n`,
      size: '64 B',
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
        sceneName={sceneName}
        dirty={dirty}
        status={status}
        canDelete={selectedIds.length > 0}
        canDuplicate={selectedIds.length > 0}
        canUndo={canUndo}
        canRedo={canRedo}
        onToolChange={setTool}
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
            onSelect={selectEntity}
            onMoveEntity={onMoveEntity}
            onMoveBegin={beginTransient}
            onMoveEnd={endTransient}
          />
          <AssetBrowser
            assets={assets}
            selectedId={selectedAssetId}
            onSelect={setSelectedAssetId}
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
          onChange={updateEntity}
        />
      </div>
    </div>
  )
}
