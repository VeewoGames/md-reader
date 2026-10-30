import type { ProjectsSnapshot, ProjectRegistration } from './project-registry-contract'
import type { FileTreeLoadOptions, LocalBridgeHealth, ProjectTreeSnapshot } from './local-bridge-access'

export type WorkspaceSource = 'local-service' | 'offline'

export type WorkspaceProjectsSnapshot = ProjectsSnapshot

interface BridgeProvider {
  getHealth: () => Promise<LocalBridgeHealth>
  listProjects: (profileId: string) => Promise<WorkspaceProjectsSnapshot>
  registerProject: (profileId: string, rootPath: string, expectedRevision: number) => Promise<ProjectRegistration>
  setActiveProject: (profileId: string, projectId: string, expectedRevision: number) => Promise<ProjectsSnapshot>
  reorderProjects: (profileId: string, orderedIds: string[], expectedRevision: number) => Promise<ProjectsSnapshot>
  unregisterProject: (profileId: string, projectId: string, replacementProjectId: string | null, expectedRevision: number) => Promise<ProjectsSnapshot>
  reconcileProjects: (profileId: string, expectedRevision: number) => Promise<ProjectsSnapshot>
  getFileTreePaths: (projectId: string, profileId: string, options?: FileTreeLoadOptions) => Promise<string[]>
  refreshFileTree: (projectId: string, profileId: string, options?: FileTreeLoadOptions) => Promise<string[]>
  getProjectTreeSnapshot?: (projectId: string, profileId: string, options?: FileTreeLoadOptions) => Promise<ProjectTreeSnapshot>
  refreshProjectTreeSnapshot?: (projectId: string, profileId: string, options?: FileTreeLoadOptions) => Promise<ProjectTreeSnapshot>
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
    async reprobeSource(): Promise<WorkspaceSource> {
      sourcePromise = null
      return getSource()
    },
    async listProjects(profileId: string): Promise<WorkspaceProjectsSnapshot> {
      if ((await getSource()) !== 'local-service') {
        return {
          initialized: false,
          revision: 0,
          activeProjectId: null,
          projects: [],
        }
      }

      return bridge.listProjects(profileId)
    },
    async registerProject(profileId: string, rootPath: string, expectedRevision: number): Promise<ProjectRegistration> {
      if (await getSource() !== 'local-service') throw new Error('本地服务不可用')
      return bridge.registerProject(profileId, rootPath, expectedRevision)
    },
    async setActiveProject(profileId: string, projectId: string, expectedRevision: number): Promise<ProjectsSnapshot> {
      if (await getSource() !== 'local-service') throw new Error('本地服务不可用')
      return bridge.setActiveProject(profileId, projectId, expectedRevision)
    },
    async reorderProjects(profileId: string, ids: string[], expectedRevision: number) {
      if (await getSource() !== 'local-service') throw new Error('本地服务不可用')
      return bridge.reorderProjects(profileId, ids, expectedRevision)
    },
    async unregisterProject(profileId: string, projectId: string, replacement: string | null, expectedRevision: number) {
      if (await getSource() !== 'local-service') throw new Error('本地服务不可用')
      return bridge.unregisterProject(profileId, projectId, replacement, expectedRevision)
    },
    async reconcileProjects(profileId: string, expectedRevision: number) {
      if (await getSource() !== 'local-service') throw new Error('本地服务不可用')
      return bridge.reconcileProjects(profileId, expectedRevision)
    },
    async getFileTreePaths(projectId: string, profileId: string, options?: FileTreeLoadOptions): Promise<string[]> {
      return bridge.getFileTreePaths(projectId, profileId, options)
    },
    async refreshFileTree(projectId: string, profileId: string, options?: FileTreeLoadOptions): Promise<string[]> {
      return bridge.refreshFileTree(projectId, profileId, options)
    },
    async getProjectTreeSnapshot(projectId: string, profileId: string, options?: FileTreeLoadOptions): Promise<ProjectTreeSnapshot> {
      if (bridge.getProjectTreeSnapshot) return bridge.getProjectTreeSnapshot(projectId, profileId, options)
      return {
        entries: (await bridge.getFileTreePaths(projectId, profileId, options)).map((path) => ({
          path,
          createdAtMs: 0,
          modifiedAtMs: 0,
          recentAtMs: 0,
        })),
      }
    },
    async refreshProjectTreeSnapshot(projectId: string, profileId: string, options?: FileTreeLoadOptions): Promise<ProjectTreeSnapshot> {
      if (bridge.refreshProjectTreeSnapshot) return bridge.refreshProjectTreeSnapshot(projectId, profileId, options)
      return {
        entries: (await bridge.refreshFileTree(projectId, profileId, options)).map((path) => ({
          path,
          createdAtMs: 0,
          modifiedAtMs: 0,
          recentAtMs: 0,
        })),
      }
    },
  }
}
