import { describe, expect, it } from 'vitest'

import { createMemoryKeyValueStore } from '../../src/shared/key-value-store'
import { createLocalStateStore } from '../../src/workspace/local-state'

describe('local state store', () => {
  it('returns the default multi-tab local state when nothing has been stored', async () => {
    const storage = createMemoryKeyValueStore()
    const store = createLocalStateStore(storage)

    const restored = await store.getState('notes')

    expect(restored.openDocumentPaths).toEqual([])
    expect(restored.activeDocumentPath).toBeNull()
    expect(restored.activeMode).toBe('regular')
    expect(restored.regularViewState).toBe('locked')
    expect(restored.tabStateByDocument).toEqual({})
    expect(restored.readingProgressByDocument).toEqual({})
  })

  it('persists open tabs, active tab and per-document tab state locally', async () => {
    const storage = createMemoryKeyValueStore()
    const store = createLocalStateStore(storage)

    await store.saveState('notes', {
      openDocumentPaths: ['docs/README.md', 'docs/guide.md'],
      activeDocumentPath: 'docs/README.md',
      activeMode: 'split',
      regularViewState: 'editable',
      tabStateByDocument: {
        'docs/README.md': { lastKnownScrollTop: 128 },
        'docs/guide.md': { lastKnownScrollTop: 512 },
      },
      readingProgressByDocument: {
        'docs/README.md': 128,
        'docs/guide.md': 512,
      },
    })

    const restored = await store.getState('notes')

    expect(restored.openDocumentPaths).toEqual(['docs/README.md', 'docs/guide.md'])
    expect(restored.activeDocumentPath).toBe('docs/README.md')
    expect(restored.activeMode).toBe('split')
    expect(restored.regularViewState).toBe('editable')
    expect(restored.tabStateByDocument['docs/guide.md']).toEqual({ lastKnownScrollTop: 512 })
    expect(restored.readingProgressByDocument['docs/guide.md']).toBe(512)
  })
})
