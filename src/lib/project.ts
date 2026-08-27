import { isTauri } from '@/lib/tauri'
import type { AssetItem } from '@/types/scene'

export type ProjectFile = {
  name: string
  path: string
  kind: string
  size: number
  content?: string | null
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

  // Browser File System Access API
  const w = window as Window & {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
  }
  if (!w.showDirectoryPicker) {
    throw new Error(
      'Open Project needs the desktop app, or a Chromium browser with folder access.',
    )
  }
  const handle = await w.showDirectoryPicker()
  // Browser can't give a real OS path — use a virtual marker + handle cache
  browserDirHandle = handle
  return `browser:${handle.name}`
}

let browserDirHandle: FileSystemDirectoryHandle | null = null

async function listBrowserProject(): Promise<ProjectFile[]> {
  if (!browserDirHandle) return []
  const out: ProjectFile[] = []
  for await (const [name, handle] of browserDirHandle.entries()) {
    if (handle.kind !== 'file') continue
    const lower = name.toLowerCase()
    let kind: string | null = null
    if (lower.endsWith('.rg')) kind = 'script'
    else if (lower.endsWith('.scene') || lower.endsWith('.json')) kind = 'scene'
    else if (/\.(png|jpe?g|webp|gif)$/.test(lower)) kind = 'texture'
    else if (/\.(wav|mp3|ogg)$/.test(lower)) kind = 'audio'
    if (!kind) continue
    const file = await (handle as FileSystemFileHandle).getFile()
    let content: string | undefined
    if (kind === 'script' || kind === 'scene') {
      content = await file.text()
    }
    out.push({
      name,
      path: `browser:${browserDirHandle.name}/${name}`,
      kind,
      size: file.size,
      content,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
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
    const name = path.split('/').pop()!
    const handle = await browserDirHandle.getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    await writable.write(contents)
    await writable.close()
    return
  }
  if (!isTauri()) throw new Error('Saving project files requires desktop app')
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('write_project_file', { path, contents })
}

export function projectFilesToAssets(files: ProjectFile[]): {
  scripts: AssetItem[]
  assets: AssetItem[]
  sceneText: string | null
} {
  const scripts: AssetItem[] = []
  const assets: AssetItem[] = []
  let sceneText: string | null = null

  for (const f of files) {
    if (f.kind === 'script') {
      scripts.push({
        id: `file:${f.path}`,
        name: f.name,
        type: 'script',
        language: 'rosegold',
        content: f.content ?? '',
        size: `${f.size} B`,
      })
    } else if (f.kind === 'scene' && f.name.endsWith('.scene')) {
      sceneText = f.content ?? null
      assets.push({
        id: `file:${f.path}`,
        name: f.name,
        type: 'scene',
        size: `${f.size} B`,
        content: f.content ?? undefined,
      })
    } else if (f.kind === 'texture' || f.kind === 'audio' || f.kind === 'scene') {
      assets.push({
        id: `file:${f.path}`,
        name: f.name,
        type: f.kind as AssetItem['type'],
        size: `${f.size} B`,
      })
    }
  }
  return { scripts, assets, sceneText }
}

export function joinProjectPath(projectPath: string, fileName: string): string {
  if (projectPath.startsWith('browser:')) {
    return `${projectPath}/${fileName}`
  }
  const sep = projectPath.includes('\\') ? '\\' : '/'
  return `${projectPath.replace(/[\\/]$/, '')}${sep}${fileName}`
}
