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

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function classifyFileName(name: string): AssetItem['type'] | null {
  const lower = name.toLowerCase()
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
): string[] {
  const prefix = cwd ? `${cwd}/` : ''
  const folders = new Set<string>()
  for (const a of assets) {
    const rel = (a.relativePath ?? a.name).replace(/\\/g, '/')
    if (cwd && !rel.startsWith(prefix)) continue
    if (!cwd && rel.includes('/') === false && !a.relativePath) {
      // bundled root assets without relativePath — no folders
      continue
    }
    const rest = cwd ? rel.slice(prefix.length) : rel
    const slash = rest.indexOf('/')
    if (slash > 0) folders.add(rest.slice(0, slash))
  }
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

  const w = window as Window & {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
  }
  if (!w.showDirectoryPicker) {
    throw new Error(
      'Open Project needs the desktop app, or a Chromium browser with folder access.',
    )
  }
  const handle = await w.showDirectoryPicker()
  browserDirHandle = handle
  browserHandleCache.clear()
  browserHandleCache.set('', handle)
  return `browser:${handle.name}`
}

let browserDirHandle: FileSystemDirectoryHandle | null = null
const browserHandleCache = new Map<string, FileSystemDirectoryHandle>()

async function getBrowserDir(
  relativeDir: string,
): Promise<FileSystemDirectoryHandle | null> {
  if (!browserDirHandle) return null
  if (!relativeDir) return browserDirHandle
  if (browserHandleCache.has(relativeDir)) {
    return browserHandleCache.get(relativeDir)!
  }
  const parts = relativeDir.split('/').filter(Boolean)
  let cur: FileSystemDirectoryHandle = browserDirHandle
  let built = ''
  for (const part of parts) {
    built = built ? `${built}/${part}` : part
    if (browserHandleCache.has(built)) {
      cur = browserHandleCache.get(built)!
      continue
    }
    // File System Access API getDirectoryHandle
    const next = await cur.getDirectoryHandle(part)
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
      if (SKIP_DIRS.has(name) || name.startsWith('.')) continue
      const nextRel = relativeDir ? `${relativeDir}/${name}` : name
      browserHandleCache.set(nextRel, handle as FileSystemDirectoryHandle)
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
    const dir = await getBrowserDir(dirPath)
    if (!dir) throw new Error('Folder not found')
    const handle = await dir.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(contents)
    await writable.close()
    return
  }
  if (!isTauri()) throw new Error('Saving project files requires desktop app')
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('write_project_file', { path, contents })
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
  errors: string[]
}> {
  const scripts: AssetItem[] = []
  const assets: AssetItem[] = []
  const errors: string[] = []
  let sceneText: string | null = null
  let preferredScene: string | null = null

  for (const f of files) {
    const relativePath = f.relativePath || f.name
    try {
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
        } else if (!sceneText) {
          sceneText = f.content ?? null
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
  return { scripts, assets, sceneText, errors }
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
