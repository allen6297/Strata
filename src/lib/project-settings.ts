import type { ProjectSettings, RenderLayer } from '@/types/scene'
import { DEFAULT_RENDER_LAYERS } from '@/lib/draw-order'

export const PROJECT_SETTINGS_KEY = 'strata.project.v1'
export const PROJECT_SETTINGS_FILE = 'strata.json'

export function defaultProjectSettings(): ProjectSettings {
  return { name: '', renderLayers: DEFAULT_RENDER_LAYERS.map((l) => ({ ...l })) }
}

export function parseProjectSettings(data: unknown): ProjectSettings {
  const fallback = defaultProjectSettings()
  if (!data || typeof data !== 'object') return fallback
  const raw = data as { name?: unknown; renderLayers?: unknown }
  const name = typeof raw.name === 'string' ? raw.name : ''
  if (!Array.isArray(raw.renderLayers) || raw.renderLayers.length === 0) {
    return { ...fallback, name }
  }
  const layers: RenderLayer[] = []
  for (const item of raw.renderLayers) {
    if (!item || typeof item !== 'object') continue
    const l = item as Partial<RenderLayer>
    if (typeof l.id !== 'string' || !l.id.trim()) continue
    layers.push({
      id: l.id,
      name: typeof l.name === 'string' && l.name.trim() ? l.name : l.id,
      order: Number.isFinite(Number(l.order)) ? Number(l.order) : layers.length,
    })
  }
  return layers.length ? { name, renderLayers: layers } : { ...fallback, name }
}

export function loadProjectSettingsFromStorage(): ProjectSettings {
  try {
    const raw = localStorage.getItem(PROJECT_SETTINGS_KEY)
    if (!raw) return defaultProjectSettings()
    return parseProjectSettings(JSON.parse(raw))
  } catch {
    return defaultProjectSettings()
  }
}

export function saveProjectSettingsToStorage(settings: ProjectSettings) {
  localStorage.setItem(PROJECT_SETTINGS_KEY, JSON.stringify(settings))
}
