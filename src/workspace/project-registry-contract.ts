import type { ProjectRegistryRecord } from './registry'

export interface ProjectsSnapshot {
  initialized: boolean
  revision: number
  activeProjectId: string | null
  projects: ProjectRegistryRecord[]
  lockCleanupWarning?: string
}
export interface ProjectRegistration {
  project: ProjectRegistryRecord
  snapshot: ProjectsSnapshot
  lockCleanupWarning?: string
}

export class RegistryRequestError extends Error {
  readonly code: string
  readonly outcomeUnknown: boolean
  constructor(message: string, code: string, outcomeUnknown = false) {
    super(message)
    this.name = 'RegistryRequestError'
    this.code = code
    this.outcomeUnknown = outcomeUnknown
  }
}

export function isProjectsSnapshot(value: unknown): value is ProjectsSnapshot {
  if (!value || typeof value !== 'object') return false
  const s = value as ProjectsSnapshot
  return typeof s.initialized === 'boolean' && Number.isSafeInteger(s.revision) && s.revision >= 0 && Array.isArray(s.projects)
    && s.projects.every(p => p && typeof p.id === 'string' && typeof p.rootPath === 'string')
    && (s.activeProjectId === null || s.projects.some(p => p.id === s.activeProjectId))
}
