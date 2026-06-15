import { describe, expect, it } from 'vitest'

import {
  createProfileStore,
  type WorkspaceProfile,
} from '../../src/workspace/profile-store'
import { createMemoryKeyValueStore } from '../../src/shared/key-value-store'

describe('profile store', () => {
  it('saves and restores explicit project profiles', async () => {
    const storage = createMemoryKeyValueStore()
    const store = createProfileStore(storage)
    const profile: WorkspaceProfile = {
      id: 'writer',
      appearance: {
        theme: 'light',
        fontSize: 16,
        pageWidth: 'wide',
        lineHeight: 1.7,
      },
      layout: {
        sidebarWidth: 280,
        outlineWidth: 320,
        sidebarCollapsed: false,
        outlineCollapsed: true,
      },
      navigation: {
        expandedFileNodes: ['docs', 'docs/guides'],
        expandedHeadingNodes: {},
      },
    }

    await store.saveProfile('notes', profile)

    const restored = await store.getProfile('notes', 'writer')

    expect(restored).toEqual(profile)
  })

  it('returns a default profile when none has been stored', async () => {
    const storage = createMemoryKeyValueStore()
    const store = createProfileStore(storage)

    const restored = await store.getProfile('notes', 'default')

    expect(restored.id).toBe('default')
    expect(restored.appearance.lineHeight).toBe(1.6)
    expect(restored.layout.sidebarCollapsed).toBe(false)
    expect(restored.navigation.expandedFileNodes).toEqual([])
  })
})
