import type { ProjectRegistryRecord } from './registry'
import type { WorkspaceProfile } from './profile-store'

export interface LocalBridgeHealth {
  ok: boolean
  mode: 'local-service' | 'offline'
  projectsLoaded: number
  port: number
}

export interface BridgeProjectsSnapshot {
  activeProjectId: string | null
  projects: ProjectRegistryRecord[]
}

export interface BridgeDocumentPayload {
  path: string
  content: string
  mtimeMs: number
  size: number
  treeEntry?: ProjectTreeDocumentEntry
  treeStatus?: 'dirty'
}

export interface BridgeNodePayload {
  path: string
  mtimeMs?: number
  size?: number
}

export interface ProjectTreeDocumentEntry {
  path: string
  createdAtMs: number
  modifiedAtMs: number
  recentAtMs: number
}

export interface ProjectTreeSnapshot {
  entries: ProjectTreeDocumentEntry[]
}

export interface BridgeProjectProfilesPayload {
  profileIds: string[]
}

export type BridgeTreePayload =
  | { status: 'ready'; snapshot: ProjectTreeSnapshot; refreshId: string | null }
  | { status: 'indexing' | 'refreshing'; refreshId: string; requestedGeneration?: number }

export interface BridgeTreeRequestOptions extends FetchOptions {
  mode?: 'prefer-cache' | 'wait' | 'force'
  refreshId?: string
}

export interface FileTreeLoadOptions extends FetchOptions {
  onIndexing?: (payload: Extract<BridgeTreePayload, { status: 'indexing' | 'refreshing' }>) => void | Promise<void>
}

interface BridgeErrorPayload {
  error?: string
  code?: string
  conflictKind?: 'content-changed' | 'unknown'
  path?: string
  currentMtimeMs?: number | null
  currentContentHash?: string | null
  document?: BridgeDocumentPayload
  treeEntry?: ProjectTreeDocumentEntry
}

export class BridgeDocumentConflictError extends Error {
  readonly code: 'DOCUMENT_CONFLICT'
  readonly conflictKind: 'content-changed' | 'unknown'
  readonly path: string | null
  readonly currentMtimeMs: number | null
  readonly currentContentHash: string | null

  constructor(payload: BridgeErrorPayload) {
    super(payload.error ?? '文档保存冲突')
    this.name = 'BridgeDocumentConflictError'
    this.code = 'DOCUMENT_CONFLICT'
    this.conflictKind = payload.conflictKind ?? 'unknown'
    this.path = payload.path ?? null
    this.currentMtimeMs = payload.currentMtimeMs ?? null
    this.currentContentHash = payload.currentContentHash ?? null
  }
}

export class BridgeDocumentSavedCacheInvalidationError extends Error {
  readonly document: BridgeDocumentPayload

  constructor(payload: BridgeErrorPayload) {
    super(payload.error ?? '文件已保存，但最近索引同步失败')
    this.name = 'BridgeDocumentSavedCacheInvalidationError'
    if (!payload.document || !payload.treeEntry) {
      throw new Error('Invalid saved-document cache invalidation payload')
    }
    this.document = { ...payload.document, treeEntry: payload.treeEntry }
  }
}

interface FetchOptions {
  fetchImpl?: typeof fetch
  baseUrl?: string
}

const DEFAULT_BRIDGE_PORT = 8797
const DEFAULT_BRIDGE_URL = `http://127.0.0.1:${DEFAULT_BRIDGE_PORT}`

function getFetch(fetchImpl?: typeof fetch): typeof fetch {
  return fetchImpl ?? fetch
}

function getBaseUrl(baseUrl?: string): string {
  return baseUrl ?? DEFAULT_BRIDGE_URL
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`
    let structuredError: Error | null = null

    try {
      const payload = (await response.json()) as BridgeErrorPayload
      if (payload?.code === 'DOCUMENT_CONFLICT') {
        structuredError = new BridgeDocumentConflictError(payload)
      } else if (payload?.code === 'DOCUMENT_SAVED_CACHE_INVALIDATION_FAILED') {
        structuredError = new BridgeDocumentSavedCacheInvalidationError(payload)
      } else if (payload?.error) {
        errorMessage = payload.error
      }
    } catch {
      // Ignore non-JSON error bodies and fall back to the status line.
    }

    if (structuredError) {
      throw structuredError
    }

    throw new Error(errorMessage)
  }

  return (await response.json()) as T
}

export async function getLocalBridgeHealth(options: FetchOptions = {}): Promise<LocalBridgeHealth> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)

  try {
    const response = await fetchImpl(`${baseUrl}/api/health`)
    const payload = await readJsonResponse<LocalBridgeHealth>(response)
    return {
      ok: payload.ok,
      mode: payload.ok ? 'local-service' : 'offline',
      projectsLoaded: payload.projectsLoaded ?? 0,
      port: payload.port ?? DEFAULT_BRIDGE_PORT,
    }
  } catch {
    return {
      ok: false,
      mode: 'offline',
      projectsLoaded: 0,
      port: DEFAULT_BRIDGE_PORT,
    }
  }
}

export async function listProjectsFromBridge(
  profileId: string,
  options: FetchOptions = {},
): Promise<BridgeProjectsSnapshot> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)
  const response = await fetchImpl(`${baseUrl}/api/profiles/${encodeURIComponent(profileId)}/projects`)

  return readJsonResponse<BridgeProjectsSnapshot>(response)
}

export async function registerProjectWithBridge(
  profileId: string,
  rootPath: string,
  options: FetchOptions = {},
): Promise<ProjectRegistryRecord> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)
  const response = await fetchImpl(
    `${baseUrl}/api/profiles/${encodeURIComponent(profileId)}/projects/register`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ rootPath }),
    },
  )
  const payload = await readJsonResponse<{ project: ProjectRegistryRecord }>(response)
  return payload.project
}

export async function setActiveProjectWithBridge(
  profileId: string,
  projectId: string,
  options: FetchOptions = {},
): Promise<void> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)
  const response = await fetchImpl(
    `${baseUrl}/api/profiles/${encodeURIComponent(profileId)}/projects/active`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ projectId }),
    },
  )

  await readJsonResponse<{ ok: true }>(response)
}

export async function getFileTreePathsFromBridge(
  projectId: string,
  profileId: string,
  options: FileTreeLoadOptions = {},
): Promise<string[]> {
  const initial = await getFileTreeFromBridge(projectId, profileId, options)
  if (initial.status === 'ready') return initial.snapshot.entries.map((entry) => entry.path)
  await options.onIndexing?.(initial)
  const completed = await getFileTreeFromBridge(projectId, profileId, {
    ...options,
    mode: 'wait',
    refreshId: initial.refreshId,
  })
  if (completed.status === 'ready') return completed.snapshot.entries.map((entry) => entry.path)
  throw new Error(`Tree refresh did not complete: ${completed.status}`)
}

export async function refreshFileTreeFromBridge(
  projectId: string,
  profileId: string,
  options: FileTreeLoadOptions = {},
): Promise<string[]> {
  const initial = await getFileTreeFromBridge(projectId, profileId, {
    ...options,
    mode: 'force',
  })
  if (initial.status === 'ready') return initial.snapshot.entries.map((entry) => entry.path)
  await options.onIndexing?.(initial)
  const completed = await getFileTreeFromBridge(projectId, profileId, {
    ...options,
    mode: 'wait',
    refreshId: initial.refreshId,
  })
  if (completed.status === 'ready') return completed.snapshot.entries.map((entry) => entry.path)
  throw new Error(`Tree refresh did not complete: ${completed.status}`)
}

export async function getFileTreeFromBridge(
  projectId: string,
  profileId: string,
  options: BridgeTreeRequestOptions = {},
): Promise<BridgeTreePayload> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)
  const parameters = new URLSearchParams({
    profileId,
    mode: options.mode ?? 'prefer-cache',
  })
  if (options.refreshId) parameters.set('refreshId', options.refreshId)
  const response = await fetchImpl(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/tree?${parameters.toString()}`,
  )
  return readJsonResponse<BridgeTreePayload>(response)
}

export async function getProjectTreeSnapshotFromBridge(
  projectId: string,
  profileId: string,
  options: FileTreeLoadOptions = {},
): Promise<ProjectTreeSnapshot> {
  const initial = await getFileTreeFromBridge(projectId, profileId, options)
  if (initial.status === 'ready') return initial.snapshot
  await options.onIndexing?.(initial)
  const completed = await getFileTreeFromBridge(projectId, profileId, {
    ...options,
    mode: 'wait',
    refreshId: initial.refreshId,
  })
  if (completed.status === 'ready') return completed.snapshot
  throw new Error(`Tree refresh did not complete: ${completed.status}`)
}

export async function refreshProjectTreeSnapshotFromBridge(
  projectId: string,
  profileId: string,
  options: FileTreeLoadOptions = {},
): Promise<ProjectTreeSnapshot> {
  const initial = await getFileTreeFromBridge(projectId, profileId, { ...options, mode: 'force' })
  if (initial.status === 'ready') return initial.snapshot
  await options.onIndexing?.(initial)
  const completed = await getFileTreeFromBridge(projectId, profileId, {
    ...options,
    mode: 'wait',
    refreshId: initial.refreshId,
  })
  if (completed.status === 'ready') return completed.snapshot
  throw new Error(`Tree refresh did not complete: ${completed.status}`)
}

export async function getDocumentContentFromBridge(
  projectId: string,
  profileId: string,
  documentPath: string,
  options: FetchOptions = {},
): Promise<BridgeDocumentPayload> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)
  const response = await fetchImpl(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/document?profileId=${encodeURIComponent(profileId)}&path=${encodeURIComponent(documentPath)}`,
  )
  return readJsonResponse<BridgeDocumentPayload>(response)
}

export async function listProjectProfilesFromBridge(
  projectId: string,
  registryProfileId: string,
  options: FetchOptions = {},
): Promise<BridgeProjectProfilesPayload> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)
  const response = await fetchImpl(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/profiles?profileId=${encodeURIComponent(registryProfileId)}`,
  )

  return readJsonResponse<BridgeProjectProfilesPayload>(response)
}

export async function getProfileFromBridge(
  projectId: string,
  profileId: string,
  registryProfileId: string,
  options: FetchOptions = {},
): Promise<WorkspaceProfile> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)
  const response = await fetchImpl(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/profile?profileId=${encodeURIComponent(profileId)}&registryProfileId=${encodeURIComponent(registryProfileId)}`,
  )
  const payload = await readJsonResponse<{ profile: WorkspaceProfile }>(response)
  return payload.profile
}

export async function saveProfileToBridge(
  projectId: string,
  profile: WorkspaceProfile,
  registryProfileId: string,
  options: FetchOptions = {},
): Promise<WorkspaceProfile> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)
  const response = await fetchImpl(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/profile?registryProfileId=${encodeURIComponent(registryProfileId)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ profile }),
    },
  )
  const payload = await readJsonResponse<{ profile: WorkspaceProfile }>(response)
  return payload.profile
}

export async function saveDocumentContentToBridge(
  projectId: string,
  profileId: string,
  documentPath: string,
  content: string,
  expectedMtimeMs: number | null,
  expectedContentHash: string | null,
  options: FetchOptions = {},
): Promise<BridgeDocumentPayload> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)
  const response = await fetchImpl(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/document?profileId=${encodeURIComponent(profileId)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        path: documentPath,
        content,
        expectedMtimeMs,
        expectedContentHash,
      }),
    },
  )

  return readJsonResponse<BridgeDocumentPayload>(response)
}

export async function createDocumentNodeInBridge(
  projectId: string,
  profileId: string,
  documentPath: string,
  content = '',
  options: FetchOptions = {},
): Promise<BridgeNodePayload> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)
  const response = await fetchImpl(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/nodes/document/create?profileId=${encodeURIComponent(profileId)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        path: documentPath,
        content,
      }),
    },
  )

  return readJsonResponse<BridgeNodePayload>(response)
}

export async function createDirectoryNodeInBridge(
  projectId: string,
  profileId: string,
  directoryPath: string,
  options: FetchOptions = {},
): Promise<BridgeNodePayload> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)
  const response = await fetchImpl(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/nodes/directory/create?profileId=${encodeURIComponent(profileId)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        path: directoryPath,
      }),
    },
  )

  return readJsonResponse<BridgeNodePayload>(response)
}

export async function duplicateDocumentNodeInBridge(
  projectId: string,
  profileId: string,
  sourcePath: string,
  targetPath: string,
  options: FetchOptions = {},
): Promise<BridgeNodePayload> {
  return postDocumentPathMutation(projectId, profileId, 'duplicate', { sourcePath, targetPath }, options)
}

export async function moveDocumentNodeInBridge(
  projectId: string,
  profileId: string,
  sourcePath: string,
  targetPath: string,
  options: FetchOptions = {},
): Promise<BridgeNodePayload> {
  return postDocumentPathMutation(projectId, profileId, 'move', { sourcePath, targetPath }, options)
}

export async function renameDocumentNodeInBridge(
  projectId: string,
  profileId: string,
  sourcePath: string,
  nextName: string,
  options: FetchOptions = {},
): Promise<BridgeNodePayload> {
  return postDocumentPathMutation(projectId, profileId, 'rename', { sourcePath, nextName }, options)
}

export async function deleteDocumentNodeInBridge(
  projectId: string,
  profileId: string,
  documentPath: string,
  options: FetchOptions = {},
): Promise<BridgeNodePayload> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)
  const response = await fetchImpl(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/nodes/document/delete?profileId=${encodeURIComponent(profileId)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        path: documentPath,
      }),
    },
  )

  return readJsonResponse<BridgeNodePayload>(response)
}

async function postBridgeControl(
  action: 'restart' | 'stop',
  options: FetchOptions = {},
): Promise<void> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)
  const response = await fetchImpl(`${baseUrl}/api/service/${action}`, {
    method: 'POST',
  })

  await readJsonResponse<{ ok: true }>(response)
}

export async function restartLocalBridgeService(options: FetchOptions = {}): Promise<void> {
  await postBridgeControl('restart', options)
}

export async function stopLocalBridgeService(options: FetchOptions = {}): Promise<void> {
  await postBridgeControl('stop', options)
}

async function postDocumentPathMutation(
  projectId: string,
  profileId: string,
  action: 'duplicate' | 'move' | 'rename',
  body: Record<string, string>,
  options: FetchOptions = {},
): Promise<BridgeNodePayload> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)
  const response = await fetchImpl(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/nodes/document/${action}?profileId=${encodeURIComponent(profileId)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  return readJsonResponse<BridgeNodePayload>(response)
}
