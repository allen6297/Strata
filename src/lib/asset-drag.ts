import type { AssetItem } from '@/types/scene'

export type AssetDragPayload = {
  id: string
  type: AssetItem['type']
  name: string
}

const MIME = 'text/plain'

let dragging: AssetDragPayload | null = null

export function beginAssetDrag(asset: AssetItem, dt: DataTransfer) {
  const payload: AssetDragPayload = {
    id: asset.id,
    type: asset.type,
    name: asset.name,
  }
  dragging = payload
  dt.setData(MIME, JSON.stringify(payload))
  dt.effectAllowed = 'copy'
}

export function peekAssetDrag(): AssetDragPayload | null {
  return dragging
}

export function readAssetDrag(dt: DataTransfer): AssetDragPayload | null {
  if (dragging) return dragging
  try {
    const raw = dt.getData(MIME)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AssetDragPayload
    if (parsed?.id && parsed?.type) return parsed
  } catch {
    /* ignore */
  }
  return null
}

export function endAssetDrag() {
  dragging = null
}

export function isFileDrag(dt: DataTransfer): boolean {
  return Array.from(dt.types).includes('Files')
}

export function nativeFiles(dt: DataTransfer): File[] {
  return Array.from(dt.files ?? [])
}
