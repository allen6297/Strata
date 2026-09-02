import { isTauri } from '@/lib/tauri'
import type { AssetItem } from '@/types/scene'

export type ProjectFile = {
  name: string
  path: string
  relativePath: string
  kind: string
  size: number
  content?: string | null
}

export type AssetFilter = 'all' | 'texture' | 'script' | 'audio' | 'scene'

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'target',
  'dist',
  '.venv',
  'venv',
  '__pycache__',
  '.strata',
])

let browserDirHandle: FileSystemDirectoryHandle | null = null
const browserHandleCache = new Map<string, FileSystemDirectoryHandle>()

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function shouldSkipDir(name: string): boolean {
  return SKIP_DIRS.has(name) || name.startsWith('.')
}

/** True when the host can ask the user to grant a folder (Tauri or Chromium FSA). */
export function canPickDirectory(): boolean {
  if (isTauri()) return true
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

export function setBrowserProjectHandle(handle: FileSystemDirectoryHandle | null) {
  browserDirHandle = handle
  browserHandleCache.clear()
  if (handle) browserHandleCache.set('', handle)
}

export function getBrowserProjectHandle(): FileSystemDirectoryHandle | null {
  return browserDirHandle
}

export function classifyFileName(name: string): AssetItem['type'] | null {
  const lower = name.toLowerCase()
  if (lower === 'strata.json') return null
  if (lower.endsWith('.rg')) return 'script'
  if (lower.endsWith('.scene')) return 'scene'
  if (lower.endsWith('.json')) return 'scene'
  if (/\.(png|jpe?g|webp|gif)$/.test(lower)) return 'texture'
  if (/\.(wav|mp3|ogg)$/.test(lower)) return 'audio'
  return null
}

export function parentDir(relativePath: string): string {
  const norm = relativePath.replace(/\\/g, '/')
  const idx = norm.lastIndexOf('/')
  return idx <= 0 ? '' : norm.slice(0, idx)
}

export function listChildFolders(
  assets: AssetItem[],
  cwd: string,
  extraFolders: string[] = [],
): string[] {
  const prefix = cwd ? `${cwd}/` : ''
  const folders = new Set<string>()
  const consider = (relRaw: string, requireNestedFile: boolean) => {
    const rel = relRaw.replace(/\\/g, '/')
    if (!rel) return
    if (cwd) {
      if (rel === cwd) return
      if (!rel.startsWith(prefix)) return
      const rest = rel.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash > 0) folders.add(rest.slice(0, slash))
      else if (slash < 0 && rest && !requireNestedFile) folders.add(rest)
    } else {
      const slash = rel.indexOf('/')
      if (slash > 0) folders.add(rel.slice(0, slash))
      else if (slash < 0 && !requireNestedFile) folders.add(rel)
    }
  }
  for (const a of assets) {
    const rel = (a.relativePath ?? a.name).replace(/\\/g, '/')
    if (cwd && !rel.startsWith(prefix)) continue
    if (!cwd && rel.includes('/') === false && !a.relativePath) {
      continue
    }
    consider(rel, true)
  }
  for (const rel of extraFolders) consider(rel, false)
  return [...folders].sort((a, b) => a.localeCompare(b))
}

export function assetsInFolder(assets: AssetItem[], cwd: string): AssetItem[] {
  const prefix = cwd ? `${cwd}/` : ''
  return assets.filter((a) => {
    const rel = (a.relativePath ?? a.name).replace(/\\/g, '/')
    if (!cwd) {
      // root: either no slash in relativePath, or bundled name-only
      if (!a.relativePath) return true
      return !rel.includes('/')
    }
    if (!rel.startsWith(prefix)) return false
    const rest = rel.slice(prefix.length)
    return rest.length > 0 && !rest.includes('/')
  })
}

export async function pickProjectDirectory(): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Open Strata Project Folder',
    })
    return typeof selected === 'string' ? selected : null
  }

  if (!window.showDirectoryPicker) {
    throw new Error(
      'Open Project needs the desktop app, or a Chromium browser with folder access.',
    )
  }
  const handle = await window.showDirectoryPicker({
    mode: 'readwrite',
    id: 'strata-project',
  })
  setBrowserProjectHandle(handle)
  return `browser:${handle.name}`
}

async function getBrowserDir(
  relativeDir: string,
  create = false,
): Promise<FileSystemDirectoryHandle | null> {
  if (!browserDirHandle) return null
  if (!relativeDir) return browserDirHandle
  if (!create && browserHandleCache.has(relativeDir)) {
    return browserHandleCache.get(relativeDir)!
  }
  const parts = relativeDir.split('/').filter(Boolean)
  let cur: FileSystemDirectoryHandle = browserDirHandle
  let built = ''
  for (const part of parts) {
    built = built ? `${built}/${part}` : part
    if (!create && browserHandleCache.has(built)) {
      cur = browserHandleCache.get(built)!
      continue
    }
    const next = await cur.getDirectoryHandle(part, { create })
    browserHandleCache.set(built, next)
    cur = next
  }
  return cur
}

async function walkBrowserDir(
  dir: FileSystemDirectoryHandle,
  relativeDir: string,
  depth: number,
  out: ProjectFile[],
): Promise<void> {
  if (depth > 6) return
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'directory') {
      if (shouldSkipDir(name)) continue
      const nextRel = relativeDir ? `${relativeDir}/${name}` : name
      browserHandleCache.set(nextRel, handle as FileSystemDirectoryHandle)
      out.push({
        name,
        path: `browser:${browserDirHandle!.name}/${nextRel}`,
        relativePath: nextRel,
        kind: 'folder',
        size: 0,
      })
      await walkBrowserDir(
        handle as FileSystemDirectoryHandle,
        nextRel,
        depth + 1,
        out,
      )
      continue
    }
    const kind = classifyFileName(name)
    if (!kind) continue
    const file = await (handle as FileSystemFileHandle).getFile()
    const relativePath = relativeDir ? `${relativeDir}/${name}` : name
    let content: string | undefined
    if (kind === 'script' || kind === 'scene') {
      const text = await file.text()
      content =
        text.length <= 512_000 ? text : '// [file too large to preload]'
    }
    out.push({
      name,
      path: `browser:${browserDirHandle!.name}/${relativePath}`,
      relativePath,
      kind,
      size: file.size,
      content,
    })
  }
}

async function listBrowserProject(): Promise<ProjectFile[]> {
  if (!browserDirHandle) return []
  const out: ProjectFile[] = []
  await walkBrowserDir(browserDirHandle, '', 0, out)
  return out.sort((a, b) =>
    a.relativePath.toLowerCase().localeCompare(b.relativePath.toLowerCase()),
  )
}

export async function listProjectFiles(
  projectPath: string,
): Promise<ProjectFile[]> {
  if (projectPath.startsWith('browser:')) {
    return listBrowserProject()
  }
  if (!isTauri()) return []
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<ProjectFile[]>('list_project_files', { path: projectPath })
}

export async function writeProjectFile(
  path: string,
  contents: string,
): Promise<void> {
  if (path.startsWith('browser:')) {
    if (!browserDirHandle) throw new Error('No project folder open')
    const relative = path.replace(/^browser:[^/]+\//, '')
    const dirPath = parentDir(relative)
    const fileName = relative.split('/').pop()!
    const dir = await getBrowserDir(dirPath, true)
    if (!dir) throw new Error('Folder not found')
    const handle = await dir.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable({ keepExistingData: false })
    await writable.write(contents)
    await writable.close()
    return
  }
  if (!isTauri()) throw new Error('Saving project files requires desktop app')
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('write_project_file', { path, contents })
}

export function sanitizeFolderSegment(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name is empty')
  if (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('..')
  ) {
    throw new Error('Name cannot contain path separators')
  }
  if (shouldSkipDir(trimmed)) {
    throw new Error('That folder name is reserved')
  }
  return trimmed
}

export function uniqueFolderName(existing: string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()))
  if (!taken.has('new folder')) return 'New Folder'
  let n = 2
  while (taken.has(`new folder ${n}`)) n += 1
  return `New Folder ${n}`
}

export async function createProjectDirectory(
  projectPath: string,
  relativeDir: string,
): Promise<void> {
  const parts = relativeDir.replace(/\\/g, '/').split('/').filter(Boolean)
  if (!parts.length) throw new Error('Name is empty')
  const safe = parts.map(sanitizeFolderSegment)
  const relative = safe.join('/')
  const last = safe[safe.length - 1]!
  if (projectPath.startsWith('browser:')) {
    if (!browserDirHandle) throw new Error('No project folder open')
    const parent = await getBrowserDir(parentDir(relative), true)
    if (!parent) throw new Error('Folder not found')
    for await (const [name] of parent.entries()) {
      if (name === last) throw new Error('A folder with that name already exists')
    }
    const created = await parent.getDirectoryHandle(last, { create: true })
    browserHandleCache.set(relative, created)
    return
  }
  if (!isTauri()) throw new Error('Creating folders requires the desktop app')
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('create_project_dir', {
    path: joinProjectPath(projectPath, relative),
  })
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function writeProjectBytes(
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  if (path.startsWith('browser:')) {
    if (!browserDirHandle) throw new Error('No project folder open')
    const relative = path.replace(/^browser:[^/]+\//, '')
    const dirPath = parentDir(relative)
    const fileName = relative.split('/').pop()!
    const dir = await getBrowserDir(dirPath, true)
    if (!dir) throw new Error('Folder not found')
    const handle = await dir.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable({ keepExistingData: false })
    const ab = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(ab).set(bytes)
    await writable.write(ab)
    await writable.close()
    return
  }
  if (!isTauri()) throw new Error('Saving project files requires desktop app')
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('write_project_file_base64', {
    path,
    contents: bytesToBase64(bytes),
  })
}

export function assetFolderForType(
  type: Exclude<AssetItem['type'], 'scene'>,
): string {
  if (type === 'script') return 'scripts'
  if (type === 'audio') return 'audio'
  return 'textures'
}

export function uniqueProjectRel(
  existing: Iterable<string>,
  folder: string,
  name: string,
): string {
  const taken = new Set(
    [...existing].map((p) => p.replace(/\\/g, '/').toLowerCase()),
  )
  const dest = `${folder}/${name}`
  if (!taken.has(dest.toLowerCase())) return dest
  const dot = name.lastIndexOf('.')
  const stem = dot >= 0 ? name.slice(0, dot) : name
  const ext = dot >= 0 ? name.slice(dot) : ''
  for (let n = 2; n < 1000; n++) {
    const candidate = `${folder}/${stem}-${n}${ext}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  return `${folder}/${stem}-${Date.now()}${ext}`
}

function nativeFilePath(file: File): string | undefined {
  const path = (file as File & { path?: string }).path
  return path && path.length > 0 ? path : undefined
}

function relIfUnderProject(absPath: string, projectPath: string): string | null {
  const file = absPath.replace(/\\/g, '/')
  const root = projectPath.replace(/\\/g, '/').replace(/\/$/, '')
  const prefix = `${root}/`
  if (file === root) return null
  if (file.startsWith(prefix)) return file.slice(prefix.length)
  return null
}

export type ImportedDrop = {
  type: Exclude<AssetItem['type'], 'scene'>
  relativePath: string
}

/** Copy Finder / OS files into the open project. Skips `.scene`. */
export async function importDroppedFiles(
  projectPath: string,
  files: File[],
  existingRelative: string[],
  prefer?: AssetItem['type'],
): Promise<ImportedDrop[]> {
  const taken = new Set(
    existingRelative.map((p) => p.replace(/\\/g, '/')),
  )
  const out: ImportedDrop[] = []
  for (const file of files) {
    const kind = classifyFileName(file.name)
    if (!kind || kind === 'scene') continue
    if (prefer && kind !== prefer) continue
    const disk = nativeFilePath(file)
    if (disk && !projectPath.startsWith('browser:')) {
      const rel = relIfUnderProject(disk, projectPath)
      if (rel) {
        out.push({ type: kind, relativePath: rel })
        continue
      }
    }
    const folder = assetFolderForType(kind)
    const rel = uniqueProjectRel(taken, folder, file.name)
    taken.add(rel)
    const dest = joinProjectPath(projectPath, rel)
    if (kind === 'script') {
      await writeProjectFile(dest, await file.text())
    } else {
      await writeProjectBytes(dest, new Uint8Array(await file.arrayBuffer()))
    }
    out.push({ type: kind, relativePath: rel })
  }
  return out
}

export async function readProjectFile(path: string): Promise<string | null> {
  if (path.startsWith('browser:')) {
    if (!browserDirHandle) return null
    const relative = path.replace(/^browser:[^/]+\//, '')
    try {
      const dirPath = parentDir(relative)
      const fileName = relative.split('/').pop()!
      const dir = await getBrowserDir(dirPath)
      if (!dir) return null
      const handle = await dir.getFileHandle(fileName)
      const file = await handle.getFile()
      return await file.text()
    } catch {
      return null
    }
  }
  if (!isTauri()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('read_text_file', { path })
  } catch {
    return null
  }
}

function mimeForName(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.ogg')) return 'audio/ogg'
  return 'application/octet-stream'
}

export async function resolveAssetUrl(
  path: string,
  name: string,
): Promise<string | undefined> {
  return resolveTextureUrl(path, name)
}

/** @deprecated use resolveAssetUrl */
export async function resolveTextureUrl(
  path: string,
  name: string,
): Promise<string | undefined> {
  if (path.startsWith('browser:')) {
    if (!browserDirHandle) return undefined
    const relative = path.replace(/^browser:[^/]+\//, '')
    const dir = await getBrowserDir(parentDir(relative))
    if (!dir) return undefined
    const handle = await dir.getFileHandle(relative.split('/').pop()!)
    const file = await handle.getFile()
    return URL.createObjectURL(file)
  }
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const b64 = await invoke<string>('read_file_base64', { path })
      return `data:${mimeForName(name)};base64,${b64}`
    } catch {
      try {
        const { convertFileSrc } = await import('@tauri-apps/api/core')
        return convertFileSrc(path)
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

export async function projectFilesToAssets(files: ProjectFile[]): Promise<{
  scripts: AssetItem[]
  assets: AssetItem[]
  sceneText: string | null
  scenePath: string | null
  errors: string[]
  folders: string[]
}> {
  const scripts: AssetItem[] = []
  const assets: AssetItem[] = []
  const errors: string[] = []
  const folders: string[] = []
  let sceneText: string | null = null
  let preferredScene: string | null = null
  let scenePath: string | null = null

  for (const f of files) {
    const relativePath = f.relativePath || f.name
    try {
      if (f.kind === 'folder') {
        folders.push(relativePath.replace(/\\/g, '/'))
        continue
      }
      if (f.kind === 'script') {
        scripts.push({
          id: `file:${f.path}`,
          name: f.name,
          type: 'script',
          language: 'rosegold',
          content: f.content ?? '',
          size: formatBytes(f.size),
          path: f.path,
          relativePath,
          bytes: f.size,
        })
      } else if (f.kind === 'scene' && f.name.endsWith('.scene')) {
        if (
          !preferredScene ||
          f.name === 'main.scene' ||
          relativePath.endsWith('/main.scene')
        ) {
          preferredScene = f.content ?? null
          sceneText = preferredScene
          scenePath = f.path
        } else if (!sceneText) {
          sceneText = f.content ?? null
          scenePath = f.path
        }
        assets.push({
          id: `file:${f.path}`,
          name: f.name,
          type: 'scene',
          size: formatBytes(f.size),
          content: f.content ?? undefined,
          path: f.path,
          relativePath,
          bytes: f.size,
        })
      } else if (f.kind === 'texture') {
        const url = await resolveTextureUrl(f.path, f.name)
        if (!url) errors.push(`Could not load texture ${relativePath}`)
        assets.push({
          id: `file:${f.path}`,
          name: f.name,
          type: 'texture',
          size: formatBytes(f.size),
          path: f.path,
          relativePath,
          url,
          bytes: f.size,
        })
      } else if (f.kind === 'audio') {
        const url = await resolveAssetUrl(f.path, f.name)
        if (!url) errors.push(`Could not load audio ${relativePath}`)
        assets.push({
          id: `file:${f.path}`,
          name: f.name,
          type: 'audio',
          size: formatBytes(f.size),
          path: f.path,
          relativePath,
          url,
          bytes: f.size,
        })
      }
    } catch (err) {
      errors.push(
        `${relativePath}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
  return { scripts, assets, sceneText, scenePath, errors, folders }
}

/** Overwrite `.rg` files in the open project. Uses each script's existing path. */
export async function writeProjectScripts(
  projectPath: string,
  scripts: AssetItem[],
): Promise<void> {
  for (const script of scripts) {
    if (script.type !== 'script') continue
    const rel = script.relativePath ?? `scripts/${script.name}`
    const target = script.path ?? joinProjectPath(projectPath, rel)
    await writeProjectFile(target, script.content ?? '')
  }
}

export function joinProjectPath(projectPath: string, fileName: string): string {
  if (projectPath.startsWith('browser:')) {
    return `${projectPath.replace(/\/$/, '')}/${fileName}`
  }
  const sep = projectPath.includes('\\') ? '\\' : '/'
  return `${projectPath.replace(/[\\/]$/, '')}${sep}${fileName}`
}

/** Built-in assets when no project is open */
export function withSyntheticPaths(assets: AssetItem[]): AssetItem[] {
  return assets.map((a) => ({
    ...a,
    relativePath: a.relativePath ?? a.name,
    bytes: a.bytes,
  }))
}
