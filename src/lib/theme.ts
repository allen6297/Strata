export type ThemeMode = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'strata.theme.v1'
export const DEFAULT_THEME: ThemeMode = 'dark'

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light'
}

export function loadTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeMode(raw)) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME
}

export function saveTheme(theme: ThemeMode) {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}

export function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute('data-theme', theme)
}

export function toggleTheme(theme: ThemeMode): ThemeMode {
  return theme === 'dark' ? 'light' : 'dark'
}
