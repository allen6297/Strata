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
  // Treat editor camera width/height as a frustum; clamp so tiny gizmos
  // don't explode zoom and huge ones don't shrink the world to a speck.
  const frustumW = Math.min(640, Math.max(160, camera.width || 320))
  const frustumH = Math.min(360, Math.max(90, camera.height || 180))
  const zx = viewportW / frustumW
  const zy = viewportH / frustumH
  return Math.min(4, Math.max(0.35, Math.min(zx, zy) * 0.92))
}
