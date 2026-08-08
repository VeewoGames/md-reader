import { describe, expect, it, vi } from 'vitest'

import {
  createDirectoryNodeInBridge,
  createDocumentNodeInBridge,
  deleteDocumentNodeInBridge,
  duplicateDocumentNodeInBridge,
  getDocumentContentFromBridge,
  getFileTreePathsFromBridge,
  getProfileFromBridge,
  getLocalBridgeHealth,
  listProjectsFromBridge,
  listProjectProfilesFromBridge,
  moveDocumentNodeInBridge,
  renameDocumentNodeInBridge,
  restartLocalBridgeService,
  registerProjectWithBridge,
  saveDocumentContentToBridge,
  saveProfileToBridge,
  stopLocalBridgeService,
} from '../../src/workspace/local-bridge-access'

describe('local bridge access', () => {
  it('notifies the caller when a tree is indexing before waiting for its completed snapshot', async () => {
    const onIndexing = vi.fn()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'indexing', refreshId: 'tree-7', requestedGeneration: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ready', tree: ['docs/guide.md'], refreshId: 'tree-7' }),
      })

    const paths = await getFileTreePathsFromBridge('notes', 'Lans', { fetchImpl: fetchMock, onIndexing })

    expect(onIndexing).toHaveBeenCalledWith({ status: 'indexing', refreshId: 'tree-7', requestedGeneration: 1 })
    expect(paths).toEqual(['docs/guide.md'])
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8797/api/projects/notes/tree?profileId=Lans&mode=wait&refreshId=tree-7',
    )
  })

  it('reads local service health from the bridge endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        mode: 'local-service',
        projectsLoaded: 2,
        port: 8797,
      }),
    })

    const health = await getLocalBridgeHealth({ fetchImpl: fetchMock })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8797/api/health')
    expect(health).toEqual({
      ok: true,
      mode: 'local-service',
      projectsLoaded: 2,
      port: 8797,
    })
  })

  it('reports offline when the local bridge is unreachable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'))

    const health = await getLocalBridgeHealth({ fetchImpl: fetchMock })

    expect(health).toEqual({
      ok: false,
      mode: 'offline',
      projectsLoaded: 0,
      port: 8797,
    })
  })

  it('registers a project through the local bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        project: {
          id: 'nocturnel-1234abcd',
          name: 'Nocturnel',
          rootPath: 'C:\\Code\\Nocturnel',
          contentRoots: ['.'],
          permissionState: 'granted',
        },
      }),
    })

    const project = await registerProjectWithBridge('default', 'C:\\Code\\Nocturnel', {
      fetchImpl: fetchMock,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8797/api/profiles/default/projects/register',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          rootPath: 'C:\\Code\\Nocturnel',
        }),
      }),
    )
    expect(project.name).toBe('Nocturnel')
  })

  it('loads project list from the local bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        projects: [
          {
            id: 'nocturnel-1234abcd',
            name: 'Nocturnel',
            rootPath: 'C:\\Code\\Nocturnel',
            contentRoots: ['.'],
            permissionState: 'granted',
          },
        ],
        activeProjectId: 'nocturnel-1234abcd',
      }),
    })

    const snapshot = await listProjectsFromBridge('default', { fetchImpl: fetchMock })

    expect(snapshot.activeProjectId).toBe('nocturnel-1234abcd')
    expect(snapshot.projects).toHaveLength(1)
  })

  it('loads repo-tracked profile ids from the local bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        profileIds: ['default', 'Lans'],
      }),
    })

    const payload = await listProjectProfilesFromBridge('notes', 'default', { fetchImpl: fetchMock })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8797/api/projects/notes/profiles?profileId=default',
    )
    expect(payload.profileIds).toEqual(['default', 'Lans'])
  })

  it('loads a repo-tracked profile payload from the local bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        profile: {
          id: 'Lans',
          appearance: {
            theme: 'system',
            fontSize: 17,
            pageWidth: 'wide',
          },
          layout: {
            sidebarWidth: 280,
            outlineWidth: 320,
            sidebarCollapsed: false,
            outlineCollapsed: false,
          },
          navigation: {
            expandedFileNodes: [],
            expandedHeadingNodes: {},
            hiddenPaths: [],
            favoritePaths: ['docs/guide.md'],
          },
        },
      }),
    })

    const payload = await getProfileFromBridge('notes', 'Lans', 'default', { fetchImpl: fetchMock })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8797/api/projects/notes/profile?profileId=Lans&registryProfileId=default',
    )
    expect(payload.id).toBe('Lans')
    expect(payload.appearance.fontSize).toBe(17)
    expect(payload.navigation.favoritePaths).toEqual(['docs/guide.md'])
  })

  it('saves a repo-tracked profile through the local bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        profile: {
          id: 'Lans',
          appearance: {
            theme: 'system',
            fontSize: 17,
            pageWidth: 'wide',
          },
          layout: {
            sidebarWidth: 280,
            outlineWidth: 320,
            sidebarCollapsed: false,
            outlineCollapsed: false,
          },
          navigation: {
            expandedFileNodes: [],
            expandedHeadingNodes: {},
            hiddenPaths: [],
            favoritePaths: ['docs/guide.md'],
          },
        },
      }),
    })

    const payload = await saveProfileToBridge(
      'notes',
      {
        id: 'Lans',
        appearance: {
          theme: 'system',
          fontSize: 17,
          pageWidth: 'wide',
        },
        layout: {
          sidebarWidth: 280,
          outlineWidth: 320,
          sidebarCollapsed: false,
          outlineCollapsed: false,
        },
        navigation: {
          expandedFileNodes: [],
          expandedHeadingNodes: {},
          hiddenPaths: [],
          favoritePaths: ['docs/guide.md'],
        },
      },
      'default',
      { fetchImpl: fetchMock },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8797/api/projects/notes/profile?registryProfileId=default',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          profile: {
            id: 'Lans',
            appearance: {
              theme: 'system',
              fontSize: 17,
              pageWidth: 'wide',
            },
            layout: {
              sidebarWidth: 280,
              outlineWidth: 320,
              sidebarCollapsed: false,
              outlineCollapsed: false,
            },
            navigation: {
              expandedFileNodes: [],
              expandedHeadingNodes: {},
              hiddenPaths: [],
              favoritePaths: ['docs/guide.md'],
            },
          },
        }),
      }),
    )
    expect(payload.id).toBe('Lans')
  })

  it('loads markdown document payload from the local bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        path: 'docs/README.md',
        content: '# Hello',
        mtimeMs: 1718265601234,
        size: 7,
      }),
    })

    const document = await getDocumentContentFromBridge('notes', 'default', 'docs/README.md', {
      fetchImpl: fetchMock,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8797/api/projects/notes/document?profileId=default&path=docs%2FREADME.md',
    )
    expect(document).toEqual({
      path: 'docs/README.md',
      content: '# Hello',
      mtimeMs: 1718265601234,
      size: 7,
    })
  })

  it('saves markdown document content through the local bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        path: 'docs/README.md',
        content: '# Updated',
        mtimeMs: 1718265605678,
        size: 9,
      }),
    })

    const document = await saveDocumentContentToBridge(
      'notes',
      'default',
      'docs/README.md',
      '# Updated',
      1718265601234,
      'abcd1234',
      {
        fetchImpl: fetchMock,
      },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8797/api/projects/notes/document?profileId=default',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          path: 'docs/README.md',
          content: '# Updated',
          expectedMtimeMs: 1718265601234,
          expectedContentHash: 'abcd1234',
        }),
      }),
    )
    expect(document).toEqual({
      path: 'docs/README.md',
      content: '# Updated',
      mtimeMs: 1718265605678,
      size: 9,
    })
  })

  it('surfaces the bridge error message when save returns a conflict payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'Document has changed on disk: docs/README.md',
        code: 'DOCUMENT_CONFLICT',
        conflictKind: 'content-changed',
        path: 'docs/README.md',
        currentMtimeMs: 1718265605678,
        currentContentHash: 'ffffeeee',
      }),
    })

    await expect(
      saveDocumentContentToBridge(
        'notes',
        'default',
        'docs/README.md',
        '# Updated',
        1718265601234,
        'abcd1234',
        {
          fetchImpl: fetchMock,
        },
      ),
    ).rejects.toMatchObject({
      message: 'Document has changed on disk: docs/README.md',
      conflictKind: 'content-changed',
      path: 'docs/README.md',
      currentMtimeMs: 1718265605678,
      currentContentHash: 'ffffeeee',
    })
  })

  it('creates a markdown document through the local bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        path: 'docs/guides/intro.md',
        mtimeMs: 1718265605678,
        size: 9,
      }),
    })

    const payload = await createDocumentNodeInBridge('notes', 'default', 'docs/guides/intro.md', '# Intro', {
      fetchImpl: fetchMock,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8797/api/projects/notes/nodes/document/create?profileId=default',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          path: 'docs/guides/intro.md',
          content: '# Intro',
        }),
      }),
    )
    expect(payload.path).toBe('docs/guides/intro.md')
  })

  it('creates a directory through the local bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        path: 'docs/guides',
      }),
    })

    const payload = await createDirectoryNodeInBridge('notes', 'default', 'docs/guides', {
      fetchImpl: fetchMock,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8797/api/projects/notes/nodes/directory/create?profileId=default',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          path: 'docs/guides',
        }),
      }),
    )
    expect(payload.path).toBe('docs/guides')
  })

  it('duplicates a document through the local bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        path: 'docs/guide-copy.md',
        mtimeMs: 1718265605678,
        size: 9,
      }),
    })

    const payload = await duplicateDocumentNodeInBridge(
      'notes',
      'default',
      'docs/guide.md',
      'docs/guide-copy.md',
      { fetchImpl: fetchMock },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8797/api/projects/notes/nodes/document/duplicate?profileId=default',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          sourcePath: 'docs/guide.md',
          targetPath: 'docs/guide-copy.md',
        }),
      }),
    )
    expect(payload.path).toBe('docs/guide-copy.md')
  })

  it('moves a document through the local bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        path: 'docs/archive/guide.md',
        mtimeMs: 1718265605678,
        size: 9,
      }),
    })

    const payload = await moveDocumentNodeInBridge(
      'notes',
      'default',
      'docs/guide.md',
      'docs/archive/guide.md',
      { fetchImpl: fetchMock },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8797/api/projects/notes/nodes/document/move?profileId=default',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          sourcePath: 'docs/guide.md',
          targetPath: 'docs/archive/guide.md',
        }),
      }),
    )
    expect(payload.path).toBe('docs/archive/guide.md')
  })

  it('renames a document through the local bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        path: 'docs/guide-v2.md',
        mtimeMs: 1718265605678,
        size: 9,
      }),
    })

    const payload = await renameDocumentNodeInBridge('notes', 'default', 'docs/guide.md', 'guide-v2.md', {
      fetchImpl: fetchMock,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8797/api/projects/notes/nodes/document/rename?profileId=default',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          sourcePath: 'docs/guide.md',
          nextName: 'guide-v2.md',
        }),
      }),
    )
    expect(payload.path).toBe('docs/guide-v2.md')
  })

  it('deletes a document through the local bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        path: 'docs/guide.md',
      }),
    })

    const payload = await deleteDocumentNodeInBridge('notes', 'default', 'docs/guide.md', {
      fetchImpl: fetchMock,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8797/api/projects/notes/nodes/document/delete?profileId=default',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          path: 'docs/guide.md',
        }),
      }),
    )
    expect(payload.path).toBe('docs/guide.md')
  })

  it('requests bridge service restart through the local control endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
      }),
    })

    await restartLocalBridgeService({ fetchImpl: fetchMock })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8797/api/service/restart', {
      method: 'POST',
    })
  })

  it('requests bridge service shutdown through the local control endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
      }),
    })

    await stopLocalBridgeService({ fetchImpl: fetchMock })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8797/api/service/stop', {
      method: 'POST',
    })
  })
})
