import { useCallback, useMemo, useState } from 'react'
import { AssetBrowser } from '@/components/AssetBrowser'
import { Hierarchy } from '@/components/Hierarchy'
import { Inspector } from '@/components/Inspector'
import { Toolbar } from '@/components/Toolbar'
import { Viewport } from '@/components/Viewport'
import { uid } from '@/lib/utils'
import type { AssetItem, Entity, EntityKind, ToolMode } from '@/types/scene'

const INITIAL_ENTITIES: Entity[] = [
  {
    id: 'ent_player',
    name: 'Player',
    kind: 'sprite',
    parentId: null,
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    rotation: 0,
    color: '#3db8a8',
    visible: true,
    locked: false,
  },
  {
    id: 'ent_platform',
    name: 'Platform',
    kind: 'sprite',
    parentId: null,
    x: 40,
    y: 120,
    width: 220,
    height: 28,
    rotation: 0,
    color: '#5b6578',
    visible: true,
    locked: false,
  },
  {
    id: 'ent_coin',
    name: 'Coin',
    kind: 'sprite',
    parentId: null,
    x: -90,
    y: -40,
    width: 28,
    height: 28,
    rotation: 15,
    color: '#e5c07b',
    visible: true,
    locked: false,
  },
  {
    id: 'ent_main_cam',
    name: 'Main Camera',
    kind: 'camera',
    parentId: null,
    x: 0,
    y: -20,
    width: 160,
    height: 90,
    rotation: 0,
    color: '#3db8a8',
    visible: true,
    locked: false,
  },
]

const ASSETS: AssetItem[] = [
  { id: 'a1', name: 'player.png', type: 'texture', size: '64×64' },
  { id: 'a2', name: 'tileset.png', type: 'texture', size: '256×256' },
  { id: 'a3', name: 'PlayerController.ts', type: 'script', size: '2.1 KB' },
  { id: 'a4', name: 'jump.wav', type: 'audio', size: '48 KB' },
  { id: 'a5', name: 'main.scene', type: 'scene', size: '1.4 KB' },
  { id: 'a6', name: 'coin.png', type: 'texture', size: '32×32' },
]

const COLORS = ['#3db8a8', '#e06c75', '#61afef', '#c678dd', '#e5c07b', '#98c379']

function createEntity(kind: EntityKind, index: number): Entity {
  const base =
    kind === 'camera'
      ? { width: 160, height: 90, color: '#3db8a8' }
      : kind === 'empty'
        ? { width: 24, height: 24, color: '#8b93a7' }
        : {
            width: 48,
            height: 48,
            color: COLORS[index % COLORS.length],
          }

  return {
    id: uid(),
    name: `${kind[0].toUpperCase()}${kind.slice(1)} ${index}`,
    kind,
    parentId: null,
    x: Math.round((Math.random() - 0.5) * 200),
    y: Math.round((Math.random() - 0.5) * 140),
    rotation: 0,
    visible: true,
    locked: false,
    ...base,
  }
}

export default function App() {
  const [entities, setEntities] = useState<Entity[]>(INITIAL_ENTITIES)
  const [selectedId, setSelectedId] = useState<string | null>('ent_player')
  const [tool, setTool] = useState<ToolMode>('select')
  const [playing, setPlaying] = useState(false)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>('a1')
  const [counters, setCounters] = useState({ sprite: 1, empty: 1, camera: 1 })

  const selected = useMemo(
    () => entities.find((e) => e.id === selectedId) ?? null,
    [entities, selectedId],
  )

  const updateEntity = useCallback((id: string, patch: Partial<Entity>) => {
    setEntities((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        if (e.locked && ('x' in patch || 'y' in patch || 'width' in patch || 'height' in patch || 'rotation' in patch || 'color' in patch || 'name' in patch)) {
          const allowed: Partial<Entity> = {}
          if ('visible' in patch) allowed.visible = patch.visible
          if ('locked' in patch) allowed.locked = patch.locked
          return { ...e, ...allowed }
        }
        return { ...e, ...patch }
      }),
    )
  }, [])

  const onMoveEntity = useCallback(
    (id: string, x: number, y: number) => {
      updateEntity(id, { x, y })
    },
    [updateEntity],
  )

  const addEntity = (kind: EntityKind) => {
    const nextIndex = counters[kind === 'sprite' ? 'sprite' : kind === 'camera' ? 'camera' : 'empty']
    const entity = createEntity(kind, nextIndex)
    setCounters((c) => ({
      ...c,
      [kind === 'empty' ? 'empty' : kind]: nextIndex + 1,
    }))
    setEntities((prev) => [...prev, entity])
    setSelectedId(entity.id)
    setTool('select')
  }

  const deleteSelected = () => {
    if (!selectedId) return
    setEntities((prev) => prev.filter((e) => e.id !== selectedId))
    setSelectedId(null)
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        tool={tool}
        playing={playing}
        canDelete={Boolean(selectedId)}
        onToolChange={setTool}
        onPlayToggle={() => setPlaying((p) => !p)}
        onAddSprite={() => addEntity('sprite')}
        onAddEmpty={() => addEntity('empty')}
        onAddCamera={() => addEntity('camera')}
        onDelete={deleteSelected}
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
