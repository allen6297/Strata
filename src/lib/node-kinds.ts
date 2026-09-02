import type { EntityKind, SceneMode } from '@/types/scene'

export interface NodeKindDef {
  kind: EntityKind
  label: string
  description: string
  /** Modes that can create this kind. `script` editor never adds scene nodes. */
  modes: SceneMode[]
  keywords: string
}

export const NODE_KINDS: NodeKindDef[] = [
  {
    kind: 'sprite',
    label: 'Sprite',
    description: 'Textured quad. Draw and collide.',
    modes: ['2d', '3d'],
    keywords: 'quad image texture 2d',
  },
  {
    kind: 'tilemap',
    label: 'Tilemap',
    description: 'Paint a grid. Solid cells are walls.',
    modes: ['2d'],
    keywords: 'tiles tileset floor grid paint',
  },
  {
    kind: 'empty',
    label: 'Empty',
    description: 'Transform only. Parent other nodes.',
    modes: ['2d', '3d'],
    keywords: 'folder group parent transform node',
  },
  {
    kind: 'camera',
    label: 'Camera',
    description: 'Play follow and view frustum.',
    modes: ['2d', '3d'],
    keywords: 'view follow frustum',
  },
  {
    kind: 'mesh',
    label: 'Mesh',
    description: '3D primitive in the editor viewport.',
    modes: ['3d'],
    keywords: 'box plane 3d model',
  },
  {
    kind: 'light',
    label: 'Light',
    description: '3D light in the editor viewport.',
    modes: ['3d'],
    keywords: 'point directional 3d',
  },
  {
    kind: 'script',
    label: 'Script',
    description: 'Bare node with a script attached.',
    modes: ['2d', '3d'],
    keywords: 'rosegold logic',
  },
]

export function nodeKindsForMode(mode: SceneMode): NodeKindDef[] {
  if (mode === 'script') return []
  return NODE_KINDS.filter((d) => d.modes.includes(mode))
}

export function filterNodeKinds(
  kinds: NodeKindDef[],
  query: string,
): NodeKindDef[] {
  const q = query.trim().toLowerCase()
  if (!q) return kinds
  return kinds.filter((d) => {
    const hay = `${d.label} ${d.kind} ${d.description} ${d.keywords}`.toLowerCase()
    return hay.includes(q)
  })
}
