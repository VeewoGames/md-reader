import { describe, expect, it, vi } from 'vitest'

import { createWorkspaceProvider } from '../../src/workspace/workspace-provider'
import type { ProjectRegistryRecord } from '../../src/workspace/registry'

describe('workspace provider', () => {
  it('prefers local service when bridge health is available', async () => {
    const listProjects = vi.fn().mockResolvedValue({
      activeProjectId: 'nocturnel-1234abcd',
      projects: [
        {
          id: 'nocturnel-1234abcd',
          name: 'Nocturnel',
          rootPath: 'C:\\Code\\Nocturnel',
          contentRoots: ['.'],
          permissionState: 'granted',
        } satisfies ProjectRegistryRecord,
      ],
    })

    const provider = createWorkspaceProvider({
      bridge: {
        getHealth: async () => ({
          ok: true,
          mode: 'local-service',
          projectsLoaded: 1,
          port: 8797,
        }),
        listProjects,
        registerProject: vi.fn(),
        setActiveProject: vi.fn(),
        getFileTreePaths: vi.fn(),
      },
    })

    const source = await provider.getSource()
    const snapshot = await provider.listProjects('default')

    expect(source).toBe('local-service')
    expect(listProjects).toHaveBeenCalledWith('default')
    expect(snapshot.projects[0]?.name).toBe('Nocturnel')
  })

  it('falls back to offline mode when local service is offline', async () => {
    const listProjects = vi.fn()
    const provider = createWorkspaceProvider({
      bridge: {
        getHealth: async () => ({
          ok: false,
          mode: 'offline',
          projectsLoaded: 0,
          port: 8797,
        }),
        listProjects,
        registerProject: vi.fn(),
        setActiveProject: vi.fn(),
        getFileTreePaths: vi.fn(),
      },
    })

    const source = await provider.getSource()

    expect(source).toBe('offline')
    expect(listProjects).not.toHaveBeenCalled()
  })
})
