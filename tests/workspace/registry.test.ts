import { describe, expect, it } from 'vitest'

import {
  createProjectRegistryStore,
  type ProjectRegistryRecord,
} from '../../src/workspace/registry'
import { createMemoryKeyValueStore } from '../../src/shared/key-value-store'

describe('project registry store', () => {
  it('persists projects and restores the active project', async () => {
    const storage = createMemoryKeyValueStore()
    const store = createProjectRegistryStore(storage)
    const profileId = 'default'
    const project: ProjectRegistryRecord = {
      id: 'notes',
      name: 'Notes',
      rootHandleKey: 'handle:notes',
      contentRoots: ['docs', 'notes'],
      permissionState: 'granted',
    }

    await store.upsertProject(profileId, project)
    await store.setActiveProjectId(profileId, project.id)

    const snapshot = await store.getSnapshot(profileId)

    expect(snapshot.activeProjectId).toBe('notes')
    expect(snapshot.projects).toEqual([project])
  })

  it('marks projects as permission-required when handle recovery fails', async () => {
    const storage = createMemoryKeyValueStore()
    const store = createProjectRegistryStore(storage)
    const profileId = 'default'

    await store.upsertProject(profileId, {
      id: 'notes',
      name: 'Notes',
      rootHandleKey: 'handle:notes',
      contentRoots: ['docs'],
      permissionState: 'granted',
    })

    await store.markPermissionRequired(profileId, 'notes')

    const snapshot = await store.getSnapshot(profileId)

    expect(snapshot.projects[0]?.permissionState).toBe('permission-required')
  })

  it('isolates project registry between profiles', async () => {
    const storage = createMemoryKeyValueStore()
    const store = createProjectRegistryStore(storage)

    await store.upsertProject('default', {
      id: 'notes',
      name: 'Notes',
      rootHandleKey: 'handle:notes',
      contentRoots: ['docs'],
      permissionState: 'granted',
    })

    const writerSnapshot = await store.getSnapshot('writer')

    expect(writerSnapshot.projects).toEqual([])
    expect(writerSnapshot.activeProjectId).toBeNull()
  })
})
