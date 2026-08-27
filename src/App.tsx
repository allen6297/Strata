import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AssetBrowser } from '@/components/AssetBrowser'
import { Hierarchy } from '@/components/Hierarchy'
import { Inspector } from '@/components/Inspector'
import { Toolbar } from '@/components/Toolbar'
import { Viewport } from '@/components/Viewport'
import { useEntityHistory } from '@/hooks/useEntityHistory'
import {
  ASSETS,
  createDefaultEntities,
  createEntity,
  DEFAULT_SCENE_NAME,
  downloadScene,
  duplicateEntity,
  loadSceneFromStorage,
  parseSceneDocument,
  saveSceneToStorage,
  toSceneDocument,
} from '@/lib/scene'
import type { Entity, EntityKind, ToolMode } from '@/types/scene'

function bootEntities() {
  return loadSceneFromStorage()?.entities ?? createDefaultEntities()
}

function bootName() {
  return loadSceneFromStorage()?.name ?? DEFAULT_SCENE_NAME
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

  const [selectedId, setSelectedId] = useState<string | null>(
    () => bootEntities()[0]?.id ?? null,
  )
  const [tool, setTool] = useState<ToolMode>('select')
  const [playing, setPlaying] = useState(false)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>('a1')
  const [sceneName, setSceneName] = useState(bootName)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [counters, setCounters] = useState({ sprite: 1, empty: 1, camera: 1 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const statusTimer = useRef<number | null>(null)

  const selected = useMemo(
    () => entities.find((e) => e.id === selectedId) ?? null,
    [entities, selectedId],
  )

  const flashStatus = useCallback((message: string) => {
    setStatus(message)
    if (statusTimer.current) window.clearTimeout(statusTimer.current)
    statusTimer.current = window.setTimeout(() => setStatus(null), 2200)
  }, [])

  const markDirty = useCallback(() => setDirty(true), [])

  const updateEntity = useCallback(
    (id: string, patch: Partial<Entity>) => {
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
              'name' in patch)
          ) {
            const allowed: Partial<Entity> = {}
            if ('visible' in patch) allowed.visible = patch.visible
            if ('locked' in patch) allowed.locked = patch.locked
            return { ...e, ...allowed }
          }
          return { ...e, ...patch }
        }),
      )
      markDirty()
    },
    [commit, markDirty],
  )

  const onMoveEntity = useCallback(
    (id: string, x: number, y: number) => {
      applyTransient((prev) =>
        prev.map((e) => {
          if (e.id !== id || e.locked) return e
          return { ...e, x, y }
        }),
      )
      markDirty()
    },
    [applyTransient, markDirty],
  )

  const addEntity = useCallback(
    (kind: EntityKind) => {
      const key = kind === 'sprite' ? 'sprite' : kind === 'camera' ? 'camera' : 'empty'
      const nextIndex = counters[key]
      const entity = createEntity(kind, nextIndex)
      setCounters((c) => ({ ...c, [key]: nextIndex + 1 }))
      commit((prev) => [...prev, entity])
      setSelectedId(entity.id)
      setTool('select')
      markDirty()
    },
    [commit, counters, markDirty],
  )

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    commit((prev) => prev.filter((e) => e.id !== selectedId))
    setSelectedId(null)
    markDirty()
  }, [commit, markDirty, selectedId])

  const duplicateSelected = useCallback(() => {
    if (!selected) return
    const copy = duplicateEntity(selected)
    commit((prev) => [...prev, copy])
    setSelectedId(copy.id)
    markDirty()
  }, [commit, markDirty, selected])

  const saveScene = useCallback(() => {
    const doc = toSceneDocument(sceneName, entities)
    saveSceneToStorage(doc)
    downloadScene(doc)
    setDirty(false)
    flashStatus('Saved')
  }, [entities, flashStatus, sceneName])

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
        setSelectedId(doc.entities[0]?.id ?? null)
        setDirty(false)
        saveSceneToStorage(doc)
        flashStatus('Opened')
      } catch (err) {
        flashStatus(err instanceof Error ? err.message : 'Failed to open')
      }
    },
    [flashStatus, replace],
  )

  const handleUndo = useCallback(() => {
    undo()
    markDirty()
  }, [markDirty, undo])

  const handleRedo = useCallback(() => {
    redo()
    markDirty()
  }, [markDirty, redo])

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
        setPlaying((p) => !p)
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
  ])

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        tool={tool}
        playing={playing}
        sceneName={sceneName}
        dirty={dirty}
        status={status}
        canDelete={Boolean(selectedId)}
        canDuplicate={Boolean(selected)}
        canUndo={canUndo}
        canRedo={canRedo}
        onToolChange={setTool}
        onPlayToggle={() => setPlaying((p) => !p)}
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
          selectedId={selectedId}
          onSelect={setSelectedId}
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
            selectedId={selectedId}
            tool={tool}
            playing={playing}
            onSelect={setSelectedId}
            onMoveEntity={onMoveEntity}
            onMoveBegin={beginTransient}
            onMoveEnd={endTransient}
          />
          <AssetBrowser
            assets={ASSETS}
            selectedId={selectedAssetId}
            onSelect={setSelectedAssetId}
          />
        </div>

        <Inspector entity={selected} onChange={updateEntity} />
      </div>
    </div>
  )
}
