import {
  DEFAULT_THEME,
  isThemeMode,
  loadTheme,
  saveTheme,
  type ThemeMode,
} from '@/lib/theme'

export const EDITOR_SETTINGS_KEY = 'strata.editor.v1'

export interface EditorSettings {
  theme: ThemeMode
  /** Viewport snap-to-grid in edit mode. */
  snap: boolean
  /** World pixels between snap/grid lines. */
  gridSize: number
  /** Script editor body font size, in pixels. */
  scriptFontSize: number
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  theme: DEFAULT_THEME,
  snap: true,
  gridSize: 16,
  scriptFontSize: 13,
}

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, Math.round(v)))
}

export function parseEditorSettings(data: unknown): EditorSettings {
  const fallback = { ...DEFAULT_EDITOR_SETTINGS, theme: loadTheme() }
  if (!data || typeof data !== 'object') return fallback
  const raw = data as Partial<EditorSettings>
  return {
    theme: isThemeMode(raw.theme) ? raw.theme : fallback.theme,
    snap: typeof raw.snap === 'boolean' ? raw.snap : fallback.snap,
    gridSize: clampInt(raw.gridSize, 1, 256, fallback.gridSize),
    scriptFontSize: clampInt(raw.scriptFontSize, 10, 24, fallback.scriptFontSize),
  }
}

export function loadEditorSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(EDITOR_SETTINGS_KEY)
    if (!raw) {
      return { ...DEFAULT_EDITOR_SETTINGS, theme: loadTheme() }
    }
    return parseEditorSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_EDITOR_SETTINGS, theme: loadTheme() }
  }
}

export function saveEditorSettings(settings: EditorSettings) {
  localStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(settings))
  saveTheme(settings.theme)
}

export function patchEditorSettings(
  patch: Partial<EditorSettings>,
): EditorSettings {
  const next = { ...loadEditorSettings(), ...patch }
  saveEditorSettings(next)
  return next
}
