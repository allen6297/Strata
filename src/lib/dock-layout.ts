import {
  clampLayout,
  DEFAULT_LAYOUT,
  LAYOUT_STORAGE_KEY,
  type EditorLayout,
} from '@/lib/layout'

// MARK: - Storage & drag

export const DOCK_STORAGE_KEY = 'strata.dock.v3'

/** Pointer movement (px) before a dock tab/handle drag starts. */
export const DOCK_DRAG_THRESHOLD_PX = 6

// MARK: - Types

export type PanelId =
  | 'hierarchy'
  | 'viewport'
  | 'assets'
  | 'inspector'

export type DockZoneId = 'left' | 'center' | 'right' | 'bottom'

export const DOCK_ZONES = [
  'left',
  'center',
  'right',
  'bottom',
] as const satisfies readonly DockZoneId[]

export type SplitDockZoneId = 'left' | 'right'

export interface DockLayout {
  version: 3
  leftWidth: number
  rightWidth: number
  bottomHeight: number
  zones: Record<DockZoneId, PanelId[]>
  active: Record<DockZoneId, PanelId>
  hidden: PanelId[]
  /** Height weights (sum to 1) for stacked L/R panels. */
  splits: Record<SplitDockZoneId, number[]>
}

// MARK: - Defaults

export const PANEL_LABELS: Record<PanelId, string> = {
  hierarchy: 'Hierarchy',
  viewport: 'Viewport',
  assets: 'Assets',
  inspector: 'Inspector',
}

/** Viewport stays in the center editing column. */
export const IMMOBILE_PANELS = new Set<PanelId>(['viewport'])

export const DEFAULT_DOCK_LAYOUT: DockLayout = {
  version: 3,
  leftWidth: DEFAULT_LAYOUT.hierarchyWidth,
  rightWidth: DEFAULT_LAYOUT.inspectorWidth,
  bottomHeight: 208,
  zones: {
    left: ['hierarchy'],
    center: ['viewport'],
    right: ['inspector'],
    bottom: ['assets'],
  },
  active: {
    left: 'hierarchy',
    center: 'viewport',
    right: 'inspector',
    bottom: 'assets',
  },
  hidden: [],
  splits: {
    left: [1],
    right: [1],
  },
}

/** Panels that can be closed/hidden (viewport is always visible). */
export const HIDEABLE_PANELS = new Set<PanelId>([
  'hierarchy',
  'assets',
  'inspector',
])

const LIMITS = {
  leftWidth: { min: 160, max: 360 },
  rightWidth: { min: 220, max: 420 },
  bottomHeight: { min: 120, max: 480 },
} as const

const MIN_STACK_PANEL_PX = 80

// MARK: - Normalization

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function isPanelId(id: string): id is PanelId {
  return id in PANEL_LABELS
}

function defaultZoneFor(panelId: PanelId): DockZoneId {
  if (panelId === 'viewport') return 'center'
  if (panelId === 'inspector') return 'right'
  if (panelId === 'assets') return 'bottom'
  return 'left'
}

function normalizeZonePanels(
  zones: Partial<Record<DockZoneId, string[]>>,
  hidden: ReadonlySet<PanelId> = new Set(),
): Record<DockZoneId, PanelId[]> {
  const seen = new Set<PanelId>()
  const next: Record<DockZoneId, PanelId[]> = {
    left: [],
    center: [],
    right: [],
    bottom: [],
  }
  for (const zone of DOCK_ZONES) {
    for (const raw of zones[zone] ?? []) {
      if (!isPanelId(raw) || seen.has(raw) || hidden.has(raw)) continue
      seen.add(raw)
      next[zone].push(raw)
    }
  }
  if (!next.center.includes('viewport')) {
    next.center.unshift('viewport')
  }
  for (const id of Object.keys(PANEL_LABELS) as PanelId[]) {
    if (!seen.has(id) && !hidden.has(id)) {
      const home = defaultZoneFor(id)
      next[home].push(id)
      seen.add(id)
    }
  }
  return next
}

function normalizeHidden(
  zones: Record<DockZoneId, PanelId[]>,
  hidden: unknown,
): PanelId[] {
  const inZones = new Set<PanelId>()
  for (const zone of DOCK_ZONES) {
    for (const id of zones[zone]) inZones.add(id)
  }
  const next: PanelId[] = []
  const seen = new Set<PanelId>()
  if (Array.isArray(hidden)) {
    for (const raw of hidden) {
      if (!isPanelId(raw) || !HIDEABLE_PANELS.has(raw)) continue
      if (seen.has(raw) || inZones.has(raw)) continue
      seen.add(raw)
      next.push(raw)
    }
  }
  return next
}

export function isPanelVisible(layout: DockLayout, panelId: PanelId): boolean {
  if (panelId === 'viewport') return true
  if (layout.hidden.includes(panelId)) return false
  return findPanelZone(layout, panelId) != null
}

export function equalZoneSplits(count: number): number[] {
  if (count <= 0) return []
  return Array.from({ length: count }, () => 1 / count)
}

function normalizeSplits(
  panelCount: number,
  stored: unknown,
): number[] {
  if (panelCount <= 0) return []
  if (!Array.isArray(stored) || stored.length !== panelCount) {
    return equalZoneSplits(panelCount)
  }
  const weights = stored.map((n) => (typeof n === 'number' && n > 0 ? n : 0))
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return equalZoneSplits(panelCount)
  return weights.map((n) => n / sum)
}

function normalizeZoneSplits(
  zones: Record<DockZoneId, PanelId[]>,
  splits: Partial<Record<SplitDockZoneId, number[]>> | undefined,
): Record<SplitDockZoneId, number[]> {
  return {
    left: normalizeSplits(zones.left.length, splits?.left),
    right: normalizeSplits(zones.right.length, splits?.right),
  }
}

export function resizeZoneSplit(
  layout: DockLayout,
  zone: SplitDockZoneId,
  splitIndex: number,
  deltaPx: number,
  totalHeight: number,
): DockLayout {
  const count = layout.zones[zone].length
  if (count < 2 || totalHeight <= 0) return layout
  if (splitIndex < 0 || splitIndex >= count - 1) return layout

  const weights = [...layout.splits[zone]]
  const minRatio = Math.min(0.45, MIN_STACK_PANEL_PX / totalHeight)
  const pair = weights[splitIndex]! + weights[splitIndex + 1]!
  const lo = Math.min(minRatio, pair / 2)
  const nextA = clamp(
    weights[splitIndex]! + deltaPx / totalHeight,
    lo,
    pair - lo,
  )
  weights[splitIndex] = nextA
  weights[splitIndex + 1] = pair - nextA
  return clampDockLayout({
    ...layout,
    splits: { ...layout.splits, [zone]: weights },
  })
}

function normalizeActive(
  zones: Record<DockZoneId, PanelId[]>,
  active: Partial<Record<DockZoneId, PanelId>>,
): Record<DockZoneId, PanelId> {
  const next = { ...DEFAULT_DOCK_LAYOUT.active }
  for (const zone of DOCK_ZONES) {
    const list = zones[zone]
    const pick = active[zone]
    next[zone] =
      pick && list.includes(pick) ? pick : (list[0] ?? DEFAULT_DOCK_LAYOUT.active[zone])
  }
  return next
}

export function clampDockLayout(partial: Partial<DockLayout>): DockLayout {
  const hiddenDraft = new Set<PanelId>()
  if (Array.isArray(partial.hidden)) {
    for (const raw of partial.hidden) {
      if (isPanelId(raw) && HIDEABLE_PANELS.has(raw)) hiddenDraft.add(raw)
    }
  }
  const zones = normalizeZonePanels(
    {
      ...DEFAULT_DOCK_LAYOUT.zones,
      ...partial.zones,
    },
    hiddenDraft,
  )
  const hidden = normalizeHidden(zones, [...hiddenDraft])
  return {
    version: 3,
    leftWidth: clamp(
      partial.leftWidth ?? DEFAULT_DOCK_LAYOUT.leftWidth,
      LIMITS.leftWidth.min,
      LIMITS.leftWidth.max,
    ),
    rightWidth: clamp(
      partial.rightWidth ?? DEFAULT_DOCK_LAYOUT.rightWidth,
      LIMITS.rightWidth.min,
      LIMITS.rightWidth.max,
    ),
    bottomHeight: clamp(
      partial.bottomHeight ?? DEFAULT_DOCK_LAYOUT.bottomHeight,
      LIMITS.bottomHeight.min,
      LIMITS.bottomHeight.max,
    ),
    zones,
    active: normalizeActive(zones, partial.active ?? {}),
    hidden,
    splits: normalizeZoneSplits(zones, partial.splits),
  }
}

function fromLegacyLayout(v1: EditorLayout): DockLayout {
  return clampDockLayout({
    leftWidth: v1.hierarchyWidth,
    rightWidth: v1.inspectorWidth,
    bottomHeight: v1.assetsCollapsed ? 160 : v1.assetsHeight + 48,
    zones: {
      left: ['hierarchy'],
      center: ['viewport'],
      right: ['inspector'],
      bottom: ['assets'],
    },
    active: {
      left: 'hierarchy',
      center: 'viewport',
      right: 'inspector',
      bottom: 'assets',
    },
  })
}

// MARK: - Persistence

export function loadDockLayout(): DockLayout {
  try {
    const raw = localStorage.getItem(DOCK_STORAGE_KEY)
    if (raw) {
      return clampDockLayout(JSON.parse(raw) as Partial<DockLayout>)
    }
  } catch {
    /* fall through */
  }
  try {
    const v2 = localStorage.getItem('strata.dock.v2')
    if (v2) {
      return clampDockLayout(JSON.parse(v2) as Partial<DockLayout>)
    }
  } catch {
    /* fall through */
  }
  try {
    const legacy = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (legacy) {
      return fromLegacyLayout(clampLayout(JSON.parse(legacy) as Partial<EditorLayout>))
    }
  } catch {
    /* fall through */
  }
  return { ...DEFAULT_DOCK_LAYOUT }
}

export function saveDockLayout(layout: DockLayout) {
  localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(layout))
}

export function resetDockLayout(): DockLayout {
  return { ...DEFAULT_DOCK_LAYOUT }
}

// MARK: - Panel queries & mutations

export function findPanelZone(
  layout: DockLayout,
  panelId: PanelId,
): DockZoneId | null {
  for (const zone of DOCK_ZONES) {
    if (layout.zones[zone].includes(panelId)) return zone
  }
  return null
}

export function canMovePanel(panelId: PanelId, toZone: DockZoneId): boolean {
  if (IMMOBILE_PANELS.has(panelId)) return toZone === 'center'
  if (toZone === 'center' && panelId !== 'viewport') return false
  return true
}

export function setActivePanel(
  layout: DockLayout,
  zone: DockZoneId,
  panelId: PanelId,
): DockLayout {
  if (!layout.zones[zone].includes(panelId)) return layout
  return clampDockLayout({ ...layout, active: { ...layout.active, [zone]: panelId } })
}

export function movePanel(
  layout: DockLayout,
  panelId: PanelId,
  toZone: DockZoneId,
  index?: number,
): DockLayout {
  if (!canMovePanel(panelId, toZone)) return layout
  const fromZone = findPanelZone(layout, panelId)
  if (!fromZone) return layout

  if (fromZone === toZone) {
    if (index == null) return layout
    const list = [...layout.zones[toZone]]
    const fromIndex = list.indexOf(panelId)
    if (fromIndex === -1) return layout
    list.splice(fromIndex, 1)
    let insertAt = index
    if (fromIndex < insertAt) insertAt -= 1
    insertAt = clamp(insertAt, 0, list.length)
    list.splice(insertAt, 0, panelId)
    return clampDockLayout({
      ...layout,
      zones: { ...layout.zones, [toZone]: list },
    })
  }

  const zones: Record<DockZoneId, PanelId[]> = {
    left: [...layout.zones.left],
    center: [...layout.zones.center],
    right: [...layout.zones.right],
    bottom: [...layout.zones.bottom],
  }

  zones[fromZone] = zones[fromZone].filter((id) => id !== panelId)
  const list = zones[toZone]
  const at = index == null ? list.length : clamp(index, 0, list.length)
  list.splice(at, 0, panelId)

  const active = { ...layout.active, [toZone]: panelId }
  if (fromZone !== toZone && zones[fromZone].length) {
    if (!zones[fromZone].includes(active[fromZone])) {
      active[fromZone] = zones[fromZone][0]!
    }
  }

  return clampDockLayout({
    ...layout,
    zones,
    active,
    hidden: layout.hidden.filter((id) => id !== panelId),
  })
}

export function hidePanel(layout: DockLayout, panelId: PanelId): DockLayout {
  if (!HIDEABLE_PANELS.has(panelId)) return layout
  const fromZone = findPanelZone(layout, panelId)
  if (!fromZone) {
    if (layout.hidden.includes(panelId)) return layout
    return clampDockLayout({
      ...layout,
      hidden: [...layout.hidden, panelId],
    })
  }

  const zones: Record<DockZoneId, PanelId[]> = {
    left: [...layout.zones.left],
    center: [...layout.zones.center],
    right: [...layout.zones.right],
    bottom: [...layout.zones.bottom],
  }
  zones[fromZone] = zones[fromZone].filter((id) => id !== panelId)
  const active = { ...layout.active }
  if (active[fromZone] === panelId) {
    active[fromZone] = zones[fromZone][0] ?? active[fromZone]
  }
  const hidden = layout.hidden.includes(panelId)
    ? layout.hidden
    : [...layout.hidden, panelId]

  return clampDockLayout({ ...layout, zones, active, hidden })
}

export function showPanel(layout: DockLayout, panelId: PanelId): DockLayout {
  if (!HIDEABLE_PANELS.has(panelId)) return layout
  if (findPanelZone(layout, panelId)) {
    return clampDockLayout({
      ...layout,
      hidden: layout.hidden.filter((id) => id !== panelId),
    })
  }

  const home = defaultZoneFor(panelId)
  const zones: Record<DockZoneId, PanelId[]> = {
    left: [...layout.zones.left],
    center: [...layout.zones.center],
    right: [...layout.zones.right],
    bottom: [...layout.zones.bottom],
  }
  zones[home].push(panelId)
  const hidden = layout.hidden.filter((id) => id !== panelId)

  return clampDockLayout({
    ...layout,
    zones,
    active: { ...layout.active, [home]: panelId },
    hidden,
  })
}

export function togglePanelVisibility(
  layout: DockLayout,
  panelId: PanelId,
): DockLayout {
  return isPanelVisible(layout, panelId)
    ? hidePanel(layout, panelId)
    : showPanel(layout, panelId)
}
