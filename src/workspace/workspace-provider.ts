import type { ProjectRegistryRecord } from './registry'
import type { LocalBridgeHealth } from './local-bridge-access'

export type WorkspaceSource = 'local-service' | 'offline'

export interface WorkspaceProjectsSnapshot {
  activeProjectId: string | null
  projects: ProjectRegistryRecord[]
}

interface BridgeProvider {
  getHealth: () => Promise<LocalBridgeHealth>
  listProjects: (profileId: string) => Promise<WorkspaceProjectsSnapshot>
  registerProject: (profileId: string, rootPath: string) => Promise<ProjectRegistryRecord>
  setActiveProject: (profileId: string, projectId: string) => Promise<void>
  getFileTreePaths: (projectId: string, profileId: string) => Promise<string[]>
}

interface WorkspaceProviderDeps {
  bridge: BridgeProvider
}

export function createWorkspaceProvider({ bridge }: WorkspaceProviderDeps) {
  let sourcePromise: Promise<WorkspaceSource> | null = null

  async function getSource(): Promise<WorkspaceSource> {
    if (!sourcePromise) {
      sourcePromise = (async () => {
        const health = await bridge.getHealth()
        if (health.ok) return 'local-service'
        return 'offline'
      })()
    }

    return sourcePromise
  }

  return {
    getSource,
    async listProjects(profileId: string): Promise<WorkspaceProjectsSnapshot> {
      if ((await getSource()) !== 'local-service') {
        return {
          activeProjectId: null,
          projects: [],
        }
      }

      return bridge.listProjects(profileId)
    },
    async registerProject(profileId: string, rootPath: string): Promise<ProjectRegistryRecord> {
      return bridge.registerProject(profileId, rootPath)
    },
    async setActiveProject(profileId: string, projectId: string): Promise<void> {
      await bridge.setActiveProject(profileId, projectId)
    },
    async getFileTreePaths(projectId: string, profileId: string): Promise<string[]> {
      return bridge.getFileTreePaths(projectId, profileId)
    },
  }
}
