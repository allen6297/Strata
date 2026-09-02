import {
  canPickDirectory,
  setBrowserProjectHandle,
  shouldSkipDir,
} from '@/lib/project'
import { isTauri } from '@/lib/tauri'

export type ProjectEntry = {
  name: string
  path: string
  scene: string | null
  /** False when the chosen folder itself is the project (no project children). */
  nested: boolean
}

export type ProjectsRoot = {
  kind: 'tauri' | 'browser'
  path: string
  label: string
}

export type ProjectsPermission = 'granted' | 'prompt' | 'unavailable'

const ROOT_STORAGE_KEY = 'strata.projects-root.v1'
const LAST_PROJECT_KEY = 'strata.last-project.v1'
const IDB_NAME = 'strata-projects-home'
const IDB_STORE = 'kv'
const IDB_ROOT_KEY = 'root-handle'

const NEW_PROJECT_SCENE = `{
  "version": 2,
  "name": "main.scene",
  "mode": "2d",
  "entities": [
    { "id": "ent_root", "name": "Root", "kind": "empty", "width": 24, "height": 24 }
  ],
  "prefabs": []
}`

const NEW_PROJECT_SETTINGS = `{
  "renderLayers": [{ "id": "layer_default", "name": "Default", "order": 0 }]
}`

let browserRootHandle: FileSystemDirectoryHandle | null = null

export { canPickDirectory }

export function getBrowserRootHandle(): FileSystemDirectoryHandle | null {
  return browserRootHandle
}

export function loadLastProjectPath(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY)
  } catch {
    return null
  }
}

export function saveLastProjectPath(path: string) {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, path)
  } catch {
    /* ignore */
  }
}

export function loadSavedRootMeta(): { kind: 'tauri' | 'browser'; path: string; label: string } | null {
  try {
    const raw = localStorage.getItem(ROOT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { kind?: unknown; path?: unknown; label?: unknown }
    if (parsed.kind !== 'tauri' && parsed.kind !== 'browser') return null
    if (typeof parsed.path !== 'string' || !parsed.path) return null
    const label = typeof parsed.label === 'string' && parsed.label ? parsed.label : parsed.path
    return { kind: parsed.kind, path: parsed.path, label }
  } catch {
    return null
  }
}

function saveRootMeta(root: ProjectsRoot) {
  try {
    localStorage.setItem(
      ROOT_STORAGE_KEY,
      JSON.stringify({ kind: root.kind, path: root.path, label: root.label }),
    )
  } catch {
    /* ignore */
  }
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

async function idbGetHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openHandleDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(IDB_ROOT_KEY)
    req.onsuccess = () => {
      const value = req.result
      resolve(value && typeof value === 'object' ? (value as FileSystemDirectoryHandle) : null)
    }
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'))
  })
}

async function idbSetHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
    tx.objectStore(IDB_STORE).put(handle, IDB_ROOT_KEY)
  })
}

export async function queryRootPermission(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  if (typeof handle.queryPermission !== 'function') return 'granted'
  return handle.queryPermission({ mode: 'readwrite' })
}

export async function requestRootPermission(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  if (typeof handle.requestPermission !== 'function') return 'granted'
  return handle.requestPermission({ mode: 'readwrite' })
}

export async function restoreProjectsRoot(): Promise<{
  root: ProjectsRoot | null
  permission: ProjectsPermission
}> {
  if (isTauri()) {
    const meta = loadSavedRootMeta()
    if (!meta || meta.kind !== 'tauri') {
      return { root: null, permission: 'granted' }
    }
    return {
      root: { kind: 'tauri', path: meta.path, label: meta.label },
      permission: 'granted',
    }
  }
  if (!canPickDirectory()) {
    return { root: null, permission: 'unavailable' }
  }
  try {
    const handle = await idbGetHandle()
    if (!handle) return { root: null, permission: 'granted' }
    browserRootHandle = handle
    const perm = await queryRootPermission(handle)
    const meta = loadSavedRootMeta()
    const root: ProjectsRoot = {
      kind: 'browser',
      path: `browser-root:${handle.name}`,
      label: meta?.label ?? handle.name,
    }
    if (perm !== 'granted') {
      return { root, permission: 'prompt' }
    }
    return { root, permission: 'granted' }
  } catch {
    return { root: null, permission: 'granted' }
  }
}

export async function pickProjectsRoot(): Promise<ProjectsRoot | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Choose Projects Folder',
    })
    if (typeof selected !== 'string') return null
    const label = selected.split(/[\\/]/).filter(Boolean).pop() ?? selected
    const root: ProjectsRoot = { kind: 'tauri', path: selected, label }
    saveRootMeta(root)
    return root
  }
  if (!window.showDirectoryPicker) {
    throw new Error(
      'Choosing a projects folder needs the desktop app, or a Chromium browser.',
    )
  }
  const handle = await window.showDirectoryPicker({
    mode: 'readwrite',
    id: 'strata-projects',
  })
  browserRootHandle = handle
  await idbSetHandle(handle)
  const root: ProjectsRoot = {
    kind: 'browser',
    path: `browser-root:${handle.name}`,
    label: handle.name,
  }
  saveRootMeta(root)
  return root
}

export async function grantStoredRootAccess(): Promise<PermissionState> {
  const handle = browserRootHandle ?? (await idbGetHandle())
  if (!handle) return 'denied'
  browserRootHandle = handle
  return requestRootPermission(handle)
}

function sanitizeProjectName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name is empty')
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    throw new Error('Name cannot contain path separators')
  }
  if (trimmed.startsWith('.')) throw new Error('Name cannot start with a dot')
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error('Use letters, numbers, dots, dashes, and underscores')
  }
  return trimmed
}

async function dirIsProject(dir: FileSystemDirectoryHandle): Promise<boolean> {
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file') continue
    const lower = name.toLowerCase()
    if (lower === 'strata.json' || lower.endsWith('.scene')) {
      return true
    }
  }
  return false
}

async function firstSceneName(dir: FileSystemDirectoryHandle): Promise<string | null> {
  const scenes: string[] = []
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file') continue
    if (name.toLowerCase().endsWith('.scene')) scenes.push(name)
  }
  scenes.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  return scenes[0] ?? null
}

async function writeBrowserFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  contents: string,
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable({ keepExistingData: false })
  await writable.write(contents)
  await writable.close()
}

async function listBrowserEntries(
  root: FileSystemDirectoryHandle,
): Promise<ProjectEntry[]> {
  const children: ProjectEntry[] = []
  for await (const [name, handle] of root.entries()) {
    if (handle.kind !== 'directory') continue
    if (shouldSkipDir(name)) continue
    const dir = handle as FileSystemDirectoryHandle
    if (!(await dirIsProject(dir))) continue
    children.push({
      name,
      path: `browser:${name}`,
      scene: await firstSceneName(dir),
      nested: true,
    })
  }
  children.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
  if (children.length === 0 && (await dirIsProject(root))) {
    return [
      {
        name: root.name || 'Project',
        path: `browser:${root.name}`,
        scene: await firstSceneName(root),
        nested: false,
      },
    ]
  }
  return children
}

export async function listProjectEntries(root: ProjectsRoot): Promise<ProjectEntry[]> {
  if (root.kind === 'tauri') {
    if (!isTauri()) return []
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<ProjectEntry[]>('list_project_entries', { root: root.path })
  }
  const handle = browserRootHandle
  if (!handle) return []
  const perm = await queryRootPermission(handle)
  if (perm !== 'granted') return []
  return listBrowserEntries(handle)
}

export async function createProjectFolder(
  root: ProjectsRoot,
  name: string,
): Promise<ProjectEntry> {
  const safe = sanitizeProjectName(name)
  if (root.kind === 'tauri') {
    if (!isTauri()) throw new Error('Creating a project folder needs the desktop app')
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<ProjectEntry>('create_project_folder', {
      root: root.path,
      name: safe,
    })
  }
  const handle = browserRootHandle
  if (!handle) throw new Error('No projects folder chosen')
  for await (const [existing] of handle.entries()) {
    if (existing === safe) throw new Error('A folder with that name already exists')
  }
  const dir = await handle.getDirectoryHandle(safe, { create: true })
  await writeBrowserFile(dir, 'strata.json', NEW_PROJECT_SETTINGS)
  await writeBrowserFile(dir, 'main.scene', NEW_PROJECT_SCENE)
  return {
    name: safe,
    path: `browser:${safe}`,
    scene: 'main.scene',
    nested: true,
  }
}

/** Point the file APIs at a listed project, then return the path App should load. */
export async function bindProjectHandle(entry: ProjectEntry): Promise<string> {
  if (!entry.path.startsWith('browser:')) return entry.path
  const root = browserRootHandle
  if (!root) throw new Error('No projects folder chosen')
  if (entry.nested) {
    const child = await root.getDirectoryHandle(entry.name)
    setBrowserProjectHandle(child)
    return `browser:${child.name}`
  }
  setBrowserProjectHandle(root)
  return `browser:${root.name}`
}
