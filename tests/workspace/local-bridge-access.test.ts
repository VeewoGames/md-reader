import { describe, expect, it, vi } from 'vitest'

import {
  getDocumentContentFromBridge,
  getLocalBridgeHealth,
  listProjectsFromBridge,
  restartLocalBridgeService,
  registerProjectWithBridge,
  saveDocumentContentToBridge,
  stopLocalBridgeService,
} from '../../src/workspace/local-bridge-access'

describe('local bridge access', () => {
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
