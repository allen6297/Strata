import type { LucideIcon } from 'lucide-react'
import {
  Box,
  Camera,
  Circle,
  FileCode2,
  Grid3x3,
  Lightbulb,
  Square,
} from 'lucide-react'
import type { EntityKind } from '@/types/scene'

const ICONS: Record<EntityKind, LucideIcon> = {
  sprite: Square,
  tilemap: Grid3x3,
  empty: Circle,
  camera: Camera,
  mesh: Box,
  light: Lightbulb,
  script: FileCode2,
}

export function nodeKindIcon(kind: EntityKind): LucideIcon {
  return ICONS[kind] ?? Circle
}
