import { describe, expect, it, vi } from 'vitest'

import {
  createDirectoryNodeInBridge,
  createDocumentNodeInBridge,
  deleteDocumentNodeInBridge,
  duplicateDocumentNodeInBridge,
  getDocumentContentFromBridge,
  getFileTreePathsFromBridge,
  refreshFileTreeFromBridge,
  getProfileFromBridge,
  getLocalBridgeHealth,
  listProjectsFromBridge,
  listProjectProfilesFromBridge,
  moveDocumentNodeInBridge,
  renameDocumentNodeInBridge,
  restartLocalBridgeService,
  registerProjectWithBridge,
  reorderProjectsWithBridge,
  setActiveProjectWithBridge,
  reconcileProjectsWithBridge,
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
        json: async () => ({ status: 'ready', snapshot: { entries: [{ path: 'docs/guide.md', createdAtMs: 1, modifiedAtMs: 1, recentAtMs: 1 }] }, refreshId: 'tree-7' }),
      })

    const paths = await getFileTreePathsFromBridge('notes', 'Lans', { fetchImpl: fetchMock, onIndexing })

    expect(onIndexing).toHaveBeenCalledWith({ status: 'indexing', refreshId: 'tree-7', requestedGeneration: 1 })
    expect(paths).toEqual(['docs/guide.md'])
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8797/api/projects/notes/tree?profileId=Lans&mode=wait&refreshId=tree-7',
    )
  })

  it('forces a tree refresh and waits for the refreshed snapshot', async () => {
    const onIndexing = vi.fn()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'refreshing', refreshId: 'tree-8', requestedGeneration: 2 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ready', snapshot: { entries: [{ path: 'docs/new.md', createdAtMs: 1, modifiedAtMs: 1, recentAtMs: 1 }] }, refreshId: 'tree-8' }),
      })

    await expect(refreshFileTreeFromBridge('notes', 'Lans', { fetchImpl: fetchMock, onIndexing })).resolves.toEqual([
      'docs/new.md',
    ])
    expect(onIndexing).toHaveBeenCalledWith({ status: 'refreshing', refreshId: 'tree-8', requestedGeneration: 2 })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:8797/api/projects/notes/tree?profileId=Lans&mode=force',
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8797/api/projects/notes/tree?profileId=Lans&mode=wait&refreshId=tree-8',
    )
  })

  it('reads local service health from the bridge endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        serviceId: 'md-reader-bridge',
        mode: 'local-service',
        projectsLoaded: 2,
        port: 8797,
      }),
    })

    const health = await getLocalBridgeHealth({ fetchImpl: fetchMock })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8797/api/health', {
      signal: expect.any(AbortSignal),
    })
    expect(health).toEqual({
      ok: true,
      serviceId: 'md-reader-bridge',
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

  it('rejects a responding process with the wrong service identity', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, serviceId: 'another-service', port: 8797 }),
    })

    await expect(getLocalBridgeHealth({ fetchImpl: fetchMock })).resolves.toMatchObject({
      ok: false,
      mode: 'offline',
    })
  })

  it('aborts a health probe at its deadline', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })) as unknown as typeof fetch

    await expect(getLocalBridgeHealth({ fetchImpl: fetchMock, timeoutMs: 5 })).resolves.toMatchObject({
      ok: false,
      mode: 'offline',
    })
  })

  it('registers a project with a version and returns its saved snapshot', async () => {
    const project = { id: 'notes', name: 'Notes', rootPath: '/notes', contentRoots: ['.'], permissionState: 'granted' }
    const snapshot = { initialized: true, revision: 1, activeProjectId: 'notes', projects: [project] }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ project, snapshot }) })
    const result = await registerProjectWithBridge('default', '/notes', 0, { fetchImpl: fetchMock })
    expect(result.snapshot).toEqual(snapshot)
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8797/api/profiles/default/projects/register', expect.objectContaining({ body: JSON.stringify({ rootPath: '/notes', expectedRevision: 0 }) }))
  })

  it('loads versioned project lists from the bridge', async () => {
    const snapshot = { initialized: true, revision: 1, activeProjectId: 'notes', projects: [{ id: 'notes', name: 'Notes', rootPath: '/notes', contentRoots: ['.'], permissionState: 'granted' }] }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot })
    expect(await listProjectsFromBridge('default', { fetchImpl: fetchMock })).toEqual(snapshot)
  })

  it('distinguishes structured rejection from unknown transport or unreadable success', async () => {
    const rejected = vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ code: 'REGISTRY_CONFLICT', error: 'newer list' }) })
    await expect(reorderProjectsWithBridge('default', [], 2, { fetchImpl: rejected })).rejects.toMatchObject({ code: 'REGISTRY_CONFLICT', outcomeUnknown: false })
    const unreadable = vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('bad json') } })
    await expect(setActiveProjectWithBridge('default', 'a', 2, { fetchImpl: unreadable })).rejects.toMatchObject({ outcomeUnknown: true })
    const offline = vi.fn().mockRejectedValue(new Error('network lost'))
    await expect(reconcileProjectsWithBridge('default', 2, { fetchImpl: offline })).rejects.toMatchObject({ outcomeUnknown: true })
  })

  it('keeps a committed snapshot successful when cleanup reports a warning', async () => {
    const snapshot = { initialized: true, revision: 2, projects: [], activeProjectId: null, lockCleanupWarning: 'cleanup needs maintenance' }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot })
    expect(await reconcileProjectsWithBridge('default', 1, { fetchImpl: fetchMock })).toEqual(snapshot)
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
