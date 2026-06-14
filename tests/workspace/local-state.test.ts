import { describe, expect, it } from 'vitest'

import { createMemoryKeyValueStore } from '../../src/shared/key-value-store'
import { createLocalStateStore } from '../../src/workspace/local-state'

describe('local state store', () => {
  it('returns the default local state when nothing has been stored', async () => {
    const storage = createMemoryKeyValueStore()
    const store = createLocalStateStore(storage)

    const restored = await store.getState('notes')

    expect(restored.activeDocumentPath).toBeNull()
    expect(restored.activeMode).toBe('regular')
    expect(restored.lastKnownScrollTop).toBe(0)
    expect(restored.readingProgressByDocument).toEqual({})
  })

  it('persists active document and per-document reading progress locally', async () => {
    const storage = createMemoryKeyValueStore()
    const store = createLocalStateStore(storage)

    await store.saveState('notes', {
      activeDocumentPath: 'docs/README.md',
      activeMode: 'regular',
      lastKnownScrollTop: 128,
      readingProgressByDocument: {
        'docs/README.md': 128,
        'docs/guide.md': 512,
      },
    })

    const restored = await store.getState('notes')

    expect(restored.activeDocumentPath).toBe('docs/README.md')
    expect(restored.readingProgressByDocument['docs/guide.md']).toBe(512)
  })
})
