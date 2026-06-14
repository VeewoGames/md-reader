import type { KeyValueStore } from '../shared/key-value-store'
import { STORAGE_KEYS } from '../shared/storage-keys'
import type { ProjectRegistryRecord } from './registry'

export type BrowserFileHandle = {
  kind: 'file'
  name: string
  getFile?: () => Promise<{
    text: () => Promise<string>
  }>
}

export type BrowserDirectoryHandle = {
  kind: 'directory'
  name: string
  values: () => AsyncIterable<BrowserHandle>
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>
}

export type BrowserHandle = BrowserFileHandle | BrowserDirectoryHandle

function isMarkdownFile(name: string): boolean {
  return name.endsWith('.md') || name.endsWith('.mdx')
}

async function collectMarkdownPaths(
  handle: BrowserDirectoryHandle,
  prefix = '',
): Promise<string[]> {
  const results: string[] = []

  for await (const entry of handle.values()) {
    const nextPath = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.kind === 'directory') {
      results.push(...(await collectMarkdownPaths(entry, nextPath)))
      continue
    }

    if (isMarkdownFile(entry.name)) {
      results.push(nextPath)
    }
  }

  return results
}

export function canUseDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

async function persistProjectDirectoryHandle(
  storage: KeyValueStore,
  rootHandleKey: string,
  handle: BrowserDirectoryHandle,
): Promise<void> {
  await storage.setItem(STORAGE_KEYS.directoryHandle(rootHandleKey), handle)
}

export async function registerProjectFromDirectory(
  storage: KeyValueStore,
  handle: BrowserDirectoryHandle,
): Promise<ProjectRegistryRecord> {
  const id = handle.name.toLowerCase().replace(/\s+/g, '-')
  const rootHandleKey = `project:${crypto.randomUUID()}`

  await persistProjectDirectoryHandle(storage, rootHandleKey, handle)

  return {
    id,
    name: handle.name,
    rootHandleKey,
    contentRoots: ['.'],
    permissionState: 'granted',
  }
}

export async function getProjectDirectoryHandle(
  storage: KeyValueStore,
  rootHandleKey: string,
): Promise<BrowserDirectoryHandle | null> {
  return (await storage.getItem<BrowserDirectoryHandle>(STORAGE_KEYS.directoryHandle(rootHandleKey))) ?? null
}

export async function getProjectPermissionState(
  storage: KeyValueStore,
  project: ProjectRegistryRecord,
): Promise<ProjectRegistryRecord['permissionState']> {
  if (!project.rootHandleKey) {
    return 'permission-required'
  }

  const handle = await getProjectDirectoryHandle(storage, project.rootHandleKey)

  if (!handle) {
    return 'permission-required'
  }

  if (typeof handle.queryPermission !== 'function') {
    return 'granted'
  }

  try {
    const permission = await handle.queryPermission({ mode: 'read' })
    return permission === 'granted' ? 'granted' : 'permission-required'
  } catch {
    return 'permission-required'
  }
}

export async function readProjectMarkdownPaths(
  storage: KeyValueStore,
  project: ProjectRegistryRecord,
): Promise<string[]> {
  if (!project.rootHandleKey) {
    return []
  }

  const handle = await getProjectDirectoryHandle(storage, project.rootHandleKey)

  if (!handle) {
    return []
  }

  return collectMarkdownPaths(handle)
}

export async function readProjectMarkdownDocument(
  storage: KeyValueStore,
  project: ProjectRegistryRecord,
  documentPath: string,
): Promise<string> {
  if (!project.rootHandleKey) {
    throw new Error('当前项目没有可用的目录句柄')
  }

  const handle = await getProjectDirectoryHandle(storage, project.rootHandleKey)

  if (!handle) {
    throw new Error('当前项目的目录句柄不存在')
  }

  const fileHandle = await findFileHandle(handle, documentPath.split('/'))

  if (!fileHandle || typeof fileHandle.getFile !== 'function') {
    throw new Error(`找不到文档：${documentPath}`)
  }

  const file = await fileHandle.getFile()
  return file.text()
}

async function findFileHandle(
  directoryHandle: BrowserDirectoryHandle,
  pathSegments: string[],
): Promise<BrowserFileHandle | null> {
  const [head, ...tail] = pathSegments
  if (!head) {
    return null
  }

  for await (const entry of directoryHandle.values()) {
    if (entry.name !== head) {
      continue
    }

    if (tail.length === 0) {
      return entry.kind === 'file' ? entry : null
    }

    if (entry.kind !== 'directory') {
      return null
    }

    return findFileHandle(entry, tail)
  }

  return null
}
