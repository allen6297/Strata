import { entityMap, getWorldPosition } from '@/lib/transforms'
import type { Entity } from '@/types/scene'

/** Pick the scene camera to follow during play (Main Camera first). */
export function findPlayCamera(entities: Entity[]): Entity | null {
  const cameras = entities.filter((e) => e.kind === 'camera' && e.visible)
  if (!cameras.length) return null
  const named = cameras.find((c) => /main\s*camera/i.test(c.name))
  return named ?? cameras[0]
}

export function cameraWorldCenter(entities: Entity[], camera: Entity) {
  return getWorldPosition(camera, entityMap(entities))
}

/** Zoom so the camera frustum roughly fills the viewport. */
export function zoomForCamera(
  camera: Entity,
  viewportW: number,
  viewportH: number,
): number {
  if (camera.width <= 0 || camera.height <= 0) return 1
  const zx = viewportW / camera.width
  const zy = viewportH / camera.height
  return Math.min(4, Math.max(0.25, Math.min(zx, zy) * 0.92))
}
