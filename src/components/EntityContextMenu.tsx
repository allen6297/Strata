import {
  ContextMenu,
  MenuItem,
  MenuLabel,
  MenuSep,
} from '@/components/ui/context-menu'
import { nodeKindIcon } from '@/lib/node-kind-icon'
import { nodeKindsForMode } from '@/lib/node-kinds'
import type { ScriptNodeDef } from '@/lib/rosegold-nodes'
import type { Entity, EntityKind, SceneMode } from '@/types/scene'
import { Copy, Eye, EyeOff, Lock, Square, Trash2, Unlock } from 'lucide-react'

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform)

export interface SceneContextMenuState {
  x: number
  y: number
  entityId: string | null
  worldX?: number
  worldY?: number
}

export function EntityContextMenu({
  menu,
  entity,
  mode,
  onClose,
  onDuplicate,
  onDelete,
  onToggleVisible,
  onToggleLocked,
  onUnparent,
  onAdd,
  prefabRoots = [],
  onPlacePrefab,
  scriptNodes = [],
}: {
  menu: SceneContextMenuState
  entity: Entity | null
  mode: SceneMode
  onClose: () => void
  onDuplicate: () => void
  onDelete: () => void
  onToggleVisible: (id: string) => void
  onToggleLocked: (id: string) => void
  onUnparent: (id: string) => void
  onAdd: (
    kind: EntityKind,
    opts?: {
      parentId?: string | null
      x?: number
      y?: number
      scriptId?: string
      scriptPath?: string
      name?: string
    },
  ) => void
  prefabRoots?: Entity[]
  onPlacePrefab?: (id: string, worldX?: number, worldY?: number) => void
  scriptNodes?: ScriptNodeDef[]
}) {
  const mod = isMac ? '⌘' : 'Ctrl'
  const spawnAt = entity
    ? { parentId: entity.id, x: 0, y: 0 }
    : { x: menu.worldX, y: menu.worldY }
  const kinds = nodeKindsForMode(mode)

  const add = (kind: EntityKind, extra?: { scriptId?: string; scriptPath?: string; name?: string }) => {
    onAdd(kind, { ...spawnAt, ...extra })
    onClose()
  }

  const addItems = kinds.map((def) => {
    const Icon = nodeKindIcon(def.kind)
    return (
      <MenuItem
        key={def.kind}
        label={def.label}
        icon={<Icon className="h-3.5 w-3.5" />}
        onSelect={() => add(def.kind)}
      />
    )
  })

  const scriptItems = scriptNodes.map((n) => {
    const Icon = nodeKindIcon(n.kind)
    return (
      <MenuItem
        key={`${n.scriptId}:${n.name}`}
        label={n.name}
        icon={<Icon className="h-3.5 w-3.5" />}
        onSelect={() =>
          add(n.kind, {
            scriptId: n.scriptId,
            scriptPath: n.scriptPath,
            name: n.name,
          })
        }
      />
    )
  })

  return (
    <ContextMenu x={menu.x} y={menu.y} onClose={onClose}>
      {entity ? (
        <>
          <MenuItem
            label="Duplicate"
            icon={<Copy className="h-3.5 w-3.5" />}
            shortcut={`${mod}+D`}
            onSelect={() => {
              onDuplicate()
              onClose()
            }}
          />
          <MenuItem
            label={entity.visible ? 'Hide' : 'Show'}
            icon={
              entity.visible ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )
            }
            onSelect={() => {
              onToggleVisible(entity.id)
              onClose()
            }}
          />
          <MenuItem
            label={entity.locked ? 'Unlock' : 'Lock'}
            icon={
              entity.locked ? (
                <Lock className="h-3.5 w-3.5" />
              ) : (
                <Unlock className="h-3.5 w-3.5" />
              )
            }
            onSelect={() => {
              onToggleLocked(entity.id)
              onClose()
            }}
          />
          <MenuItem
            label="Unparent"
            disabled={!entity.parentId}
            onSelect={() => {
              onUnparent(entity.id)
              onClose()
            }}
          />
          <MenuSep />
          <MenuLabel>Add child</MenuLabel>
          {addItems}
          {scriptItems.length > 0 ? (
            <>
              <MenuSep />
              <MenuLabel>Scripts</MenuLabel>
              {scriptItems}
            </>
          ) : null}
          <MenuSep />
          <MenuItem
            label="Delete"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            shortcut="Del"
            danger
            onSelect={() => {
              onDelete()
              onClose()
            }}
          />
        </>
      ) : (
        <>
          <MenuLabel>{menu.worldX != null ? 'Add here' : 'Add'}</MenuLabel>
          {addItems}
          {scriptItems.length > 0 ? (
            <>
              <MenuSep />
              <MenuLabel>Scripts</MenuLabel>
              {scriptItems}
            </>
          ) : null}
          {prefabRoots.length > 0 && onPlacePrefab ? (
            <>
              <MenuSep />
              <MenuLabel>Place prefab</MenuLabel>
              {prefabRoots.map((p) => (
                <MenuItem
                  key={p.id}
                  label={p.name}
                  icon={<Square className="h-3.5 w-3.5" />}
                  onSelect={() => {
                    onPlacePrefab(p.id, menu.worldX, menu.worldY)
                    onClose()
                  }}
                />
              ))}
            </>
          ) : null}
        </>
      )}
    </ContextMenu>
  )
}
