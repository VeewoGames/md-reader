import type { ProjectRegistryRecord } from './registry'

type BrowserFileHandle = {
  kind: 'file'
  name: string
}

type BrowserDirectoryHandle = {
  kind: 'directory'
  name: string
  values: () => AsyncIterable<BrowserHandle>
}

type BrowserHandle = BrowserFileHandle | BrowserDirectoryHandle

const sessionDirectoryHandles = new Map<string, BrowserDirectoryHandle>()

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

export async function registerProjectFromDirectory(handle: BrowserDirectoryHandle): Promise<ProjectRegistryRecord> {
  const id = handle.name.toLowerCase().replace(/\s+/g, '-')
  const rootHandleKey = `project:${crypto.randomUUID()}`

  sessionDirectoryHandles.set(rootHandleKey, handle)

  return {
    id,
    name: handle.name,
    rootHandleKey,
    contentRoots: ['.'],
    permissionState: 'granted',
  }
}

export function getProjectDirectoryHandle(rootHandleKey: string): BrowserDirectoryHandle | null {
  return sessionDirectoryHandles.get(rootHandleKey) ?? null
}

export async function readProjectMarkdownPaths(project: ProjectRegistryRecord): Promise<string[]> {
  const handle = getProjectDirectoryHandle(project.rootHandleKey)

  if (!handle) {
    return []
  }

  return collectMarkdownPaths(handle)
}
