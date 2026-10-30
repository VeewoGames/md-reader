import { describe, expect, it } from 'vitest'

import { createMemoryKeyValueStore } from '../../src/shared/key-value-store'
import { createLocalStateStore } from '../../src/workspace/local-state'

describe('local state store', () => {
  it('returns the default multi-tab local state when nothing has been stored', async () => {
    const storage = createMemoryKeyValueStore()
    const store = createLocalStateStore(storage)

    const restored = await store.getState('notes', 'default')

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

    await store.saveState('notes', 'writer', {
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

    const restored = await store.getState('notes', 'writer')

    expect(restored.openDocumentPaths).toEqual(['docs/README.md', 'docs/guide.md'])
    expect(restored.activeDocumentPath).toBe('docs/README.md')
    expect(restored.activeMode).toBe('split')
    expect(restored.regularViewState).toBe('editable')
    expect(restored.tabStateByDocument['docs/guide.md']).toEqual({ lastKnownScrollTop: 512 })
    expect(restored.readingProgressByDocument['docs/guide.md']).toBe(512)
    expect(restored.tabOpenOrder).toEqual(['docs/README.md', 'docs/guide.md'])
    expect(restored.pinnedDocumentPaths).toEqual([])
  })

  it('restores opening order and pins only for open documents', async () => {
    const store = createLocalStateStore(createMemoryKeyValueStore())
    await store.saveState('notes', 'writer', {
      openDocumentPaths: ['b.md', 'a.md'], activeDocumentPath: 'a.md',
      activeMode: 'regular', regularViewState: 'locked', tabStateByDocument: {},
      readingProgressByDocument: {}, tabOpenOrder: ['a.md', 'removed.md', 'a.md'],
      pinnedDocumentPaths: ['a.md', 'removed.md', 'a.md'],
    })
    const restored = await store.getState('notes', 'writer')
    expect(restored.tabOpenOrder).toEqual(['a.md', 'b.md'])
    expect(restored.pinnedDocumentPaths).toEqual(['a.md'])
  })

  it('serializes updates to the same project and profile without losing fields', async () => {
    const store = createLocalStateStore(createMemoryKeyValueStore())
    await Promise.all([
      store.updateState('notes', 'writer', (state) => ({ ...state, openDocumentPaths: ['a.md'], activeDocumentPath: 'a.md' })),
      store.updateState('notes', 'writer', (state) => ({ ...state, tabStateByDocument: { 'a.md': { lastKnownScrollTop: 123 } } })),
    ])
    const result = await store.getState('notes', 'writer')
    expect(result.openDocumentPaths).toEqual(['a.md'])
    expect(result.tabStateByDocument['a.md']).toEqual({ lastKnownScrollTop: 123 })
  })

  it('keeps the queue usable after a failed write', async () => {
    const storage = createMemoryKeyValueStore()
    const write = storage.setItem.bind(storage)
    let fail = true
    storage.setItem = async (key, value) => {
      if (fail) { fail = false; throw new Error('storage unavailable') }
      await write(key, value)
    }
    const store = createLocalStateStore(storage)
    await expect(store.updateState('notes', 'writer', (state) => ({ ...state, activeDocumentPath: 'a.md' }))).rejects.toThrow('storage unavailable')
    await store.updateState('notes', 'writer', (state) => ({ ...state, openDocumentPaths: ['b.md'], activeDocumentPath: 'b.md' }))
    expect((await store.getState('notes', 'writer')).openDocumentPaths).toEqual(['b.md'])
  })

  it('preserves tab order, pin and scroll updates when a write is delayed', async () => {
    const storage = createMemoryKeyValueStore()
    const write = storage.setItem.bind(storage)
    let release!: () => void
    const barrier = new Promise<void>((resolve) => { release = resolve })
    let first = true
    storage.setItem = async (key, value) => {
      if (first) { first = false; await barrier }
      await write(key, value)
    }
    const store = createLocalStateStore(storage)
    const opening = store.updateState('notes', 'writer', (state) => ({ ...state,
      openDocumentPaths: ['b.md', 'a.md'], activeDocumentPath: 'a.md', tabOpenOrder: ['a.md', 'b.md'] }))
    const pin = store.updateState('notes', 'writer', (state) => ({ ...state, pinnedDocumentPaths: ['a.md'] }))
    const scroll = store.updateState('notes', 'writer', (state) => ({ ...state, tabStateByDocument: { 'b.md': { lastKnownScrollTop: 99 } } }))
    release()
    await Promise.all([opening, pin, scroll])
    const restored = await store.getState('notes', 'writer')
    expect(restored.openDocumentPaths).toEqual(['b.md', 'a.md'])
    expect(restored.tabOpenOrder).toEqual(['a.md', 'b.md'])
    expect(restored.pinnedDocumentPaths).toEqual(['a.md'])
    expect(restored.tabStateByDocument['b.md']).toEqual({ lastKnownScrollTop: 99 })
  })

  it('isolates sessions by profile and migrates the legacy project-only state on first read', async () => {
    const storage = createMemoryKeyValueStore()
    const store = createLocalStateStore(storage)
    await storage.setItem('workspace:local-state:notes', {
      openDocumentPaths: ['docs/legacy.md'],
      activeDocumentPath: 'docs/legacy.md',
    })

    expect((await store.getState('notes', 'writer')).activeDocumentPath).toBe('docs/legacy.md')
    await store.saveState('notes', 'reviewer', {
      openDocumentPaths: ['docs/review.md'],
      activeDocumentPath: 'docs/review.md',
      activeMode: 'regular',
      regularViewState: 'locked',
      tabStateByDocument: {},
      readingProgressByDocument: {},
    })

    expect((await store.getState('notes', 'writer')).activeDocumentPath).toBe('docs/legacy.md')
    expect((await store.getState('notes', 'reviewer')).activeDocumentPath).toBe('docs/review.md')
  })
})
