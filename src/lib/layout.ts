export const LAYOUT_STORAGE_KEY = 'strata.layout.v1'

export interface EditorLayout {
  hierarchyWidth: number
  inspectorWidth: number
  assetsHeight: number
  assetsCollapsed: boolean
}

export const DEFAULT_LAYOUT: EditorLayout = {
  hierarchyWidth: 224,
  inspectorWidth: 272,
  assetsHeight: 160,
  assetsCollapsed: false,
}

const LIMITS = {
  hierarchyWidth: { min: 160, max: 360 },
  inspectorWidth: { min: 220, max: 420 },
  assetsHeight: { min: 100, max: 320 },
} as const

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function clampLayout(partial: Partial<EditorLayout>): EditorLayout {
  return {
    hierarchyWidth: clamp(
      partial.hierarchyWidth ?? DEFAULT_LAYOUT.hierarchyWidth,
      LIMITS.hierarchyWidth.min,
      LIMITS.hierarchyWidth.max,
    ),
    inspectorWidth: clamp(
      partial.inspectorWidth ?? DEFAULT_LAYOUT.inspectorWidth,
      LIMITS.inspectorWidth.min,
      LIMITS.inspectorWidth.max,
    ),
    assetsHeight: clamp(
      partial.assetsHeight ?? DEFAULT_LAYOUT.assetsHeight,
      LIMITS.assetsHeight.min,
      LIMITS.assetsHeight.max,
    ),
    assetsCollapsed:
      typeof partial.assetsCollapsed === 'boolean'
        ? partial.assetsCollapsed
        : DEFAULT_LAYOUT.assetsCollapsed,
  }
}

export function loadLayout(): EditorLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LAYOUT }
    return clampLayout(JSON.parse(raw) as Partial<EditorLayout>)
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

export function saveLayout(layout: EditorLayout) {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
}
