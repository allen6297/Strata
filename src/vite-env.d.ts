/// <reference types="vite/client" />

interface FileSystemHandle {
  kind: 'file' | 'directory'
  name: string
  queryPermission?(descriptor?: {
    mode?: 'read' | 'readwrite'
  }): Promise<PermissionState>
  requestPermission?(descriptor?: {
    mode?: 'read' | 'readwrite'
  }): Promise<PermissionState>
}

interface FileSystemFileHandle extends FileSystemHandle {
  kind: 'file'
  getFile(): Promise<File>
  createWritable(options?: { keepExistingData?: boolean }): Promise<{
    write(data: string | BufferSource | Blob): Promise<void>
    close(): Promise<void>
  }>
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  kind: 'directory'
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemFileHandle>
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandle>
}

interface Window {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite'
    id?: string
  }) => Promise<FileSystemDirectoryHandle>
}
