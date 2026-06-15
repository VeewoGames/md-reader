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
}

export interface BridgeProjectProfilesPayload {
  profileIds: string[]
}

interface BridgeErrorPayload {
  error?: string
  code?: string
  conflictKind?: 'content-changed' | 'unknown'
  path?: string
  currentMtimeMs?: number | null
  currentContentHash?: string | null
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
  options: FetchOptions = {},
): Promise<string[]> {
  const fetchImpl = getFetch(options.fetchImpl)
  const baseUrl = getBaseUrl(options.baseUrl)
  const response = await fetchImpl(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/tree?profileId=${encodeURIComponent(profileId)}`,
  )
  const payload = await readJsonResponse<{ paths: string[] }>(response)
  return payload.paths
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
