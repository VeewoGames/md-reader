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
        hiddenPaths: ['docs/private', 'docs/guides/draft.md'],
        favoritePaths: ['docs/guides/guide.md'],
        manualNodeOrderByParent: {
          docs: ['docs/guides', 'docs/guide.md'],
        },
      },
    }

    await store.saveProfile('notes', profile)

    const restored = await store.getProfile('notes', 'writer')

    expect(restored).toEqual({ ...profile, appearance: { ...profile.appearance, maxUnpinnedTabs: 10 } })
  })

  it('returns a default profile when none has been stored', async () => {
    const storage = createMemoryKeyValueStore()
    const store = createProfileStore(storage)

    const restored = await store.getProfile('notes', 'default')

    expect(restored.id).toBe('default')
    expect(restored.appearance.lineHeight).toBe(1.6)
    expect(restored.appearance.hideFileTitleDate).toBe(false)
    expect(restored.appearance.maxUnpinnedTabs).toBe(10)
    expect(restored.layout.sidebarCollapsed).toBe(false)
    expect(restored.navigation.expandedFileNodes).toEqual([])
    expect(restored.navigation.hiddenPaths).toEqual([])
    expect(restored.navigation.favoritePaths).toEqual([])
    expect(restored.navigation.manualNodeOrderByParent).toEqual({})
  })

  it('clamps stored tab limits and handles invalid values', async () => {
    const store = createProfileStore(createMemoryKeyValueStore())
    const profile = await store.getProfile('notes', 'default')
    for (const [value, expected] of [[0, 1], [31, 30], [14, 14], [NaN, 10]] as const) {
      await store.saveProfile('notes', { ...profile, appearance: { ...profile.appearance, maxUnpinnedTabs: value } })
      expect((await store.getProfile('notes', 'default')).appearance.maxUnpinnedTabs).toBe(expected)
    }
  })
})
