import type { KeyValueStore } from '../shared/key-value-store'
import { STORAGE_KEYS } from '../shared/storage-keys'

export type ProjectPermissionState = 'granted' | 'permission-required'

export interface ProjectRegistryRecord {
  id: string
  name: string
  rootHandleKey: string
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
  async function getSnapshot(): Promise<ProjectRegistrySnapshot> {
    return (await storage.getItem<ProjectRegistrySnapshot>(STORAGE_KEYS.projectRegistry)) ?? EMPTY_REGISTRY
  }

  async function saveSnapshot(snapshot: ProjectRegistrySnapshot): Promise<void> {
    await storage.setItem(STORAGE_KEYS.projectRegistry, snapshot)
  }

  return {
    getSnapshot,
    async upsertProject(project: ProjectRegistryRecord): Promise<void> {
      const snapshot = await getSnapshot()
      const index = snapshot.projects.findIndex((entry) => entry.id === project.id)
      const projects = [...snapshot.projects]

      if (index >= 0) {
        projects[index] = project
      } else {
        projects.push(project)
      }

      await saveSnapshot({
        ...snapshot,
        projects,
      })
    },
    async setActiveProjectId(projectId: string | null): Promise<void> {
      const snapshot = await getSnapshot()

      await saveSnapshot({
        ...snapshot,
        activeProjectId: projectId,
      })
    },
    async markPermissionRequired(projectId: string): Promise<void> {
      const snapshot = await getSnapshot()

      await saveSnapshot({
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
