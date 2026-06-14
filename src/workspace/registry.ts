import type { KeyValueStore } from '../shared/key-value-store'
import { STORAGE_KEYS } from '../shared/storage-keys'

export type ProjectPermissionState = 'granted' | 'permission-required'

export interface ProjectRegistryRecord {
  id: string
  name: string
  rootHandleKey?: string
  rootPath?: string
  accessMode?: 'browser' | 'local-service'
  contentRoots: string[]
  permissionState: ProjectPermissionState
}

export interface ProjectRegistrySnapshot {
  version: 1
  activeProjectId: string | null
  projects: ProjectRegistryRecord[]
}

const EMPTY_REGISTRY: ProjectRegistrySnapshot = {
  version: 1,
  activeProjectId: null,
  projects: [],
}

export function createProjectRegistryStore(storage: KeyValueStore) {
  async function getSnapshot(profileId: string): Promise<ProjectRegistrySnapshot> {
    return (
      (await storage.getItem<ProjectRegistrySnapshot>(STORAGE_KEYS.projectRegistry(profileId))) ??
      EMPTY_REGISTRY
    )
  }

  async function saveSnapshot(profileId: string, snapshot: ProjectRegistrySnapshot): Promise<void> {
    await storage.setItem(STORAGE_KEYS.projectRegistry(profileId), snapshot)
  }

  return {
    getSnapshot,
    async upsertProject(profileId: string, project: ProjectRegistryRecord): Promise<void> {
      const snapshot = await getSnapshot(profileId)
      const index = snapshot.projects.findIndex((entry) => entry.id === project.id)
      const projects = [...snapshot.projects]

      if (index >= 0) {
        projects[index] = project
      } else {
        projects.push(project)
      }

      await saveSnapshot(profileId, {
        ...snapshot,
        projects,
      })
    },
    async setActiveProjectId(profileId: string, projectId: string | null): Promise<void> {
      const snapshot = await getSnapshot(profileId)

      await saveSnapshot(profileId, {
        ...snapshot,
        activeProjectId: projectId,
      })
    },
    async markPermissionRequired(profileId: string, projectId: string): Promise<void> {
      const snapshot = await getSnapshot(profileId)

      await saveSnapshot(profileId, {
        ...snapshot,
        projects: snapshot.projects.map((project) =>
          project.id === projectId
            ? {
                ...project,
                permissionState: 'permission-required',
              }
            : project,
        ),
      })
    },
  }
}
