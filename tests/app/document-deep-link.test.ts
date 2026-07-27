import { describe, expect, it } from 'vitest'

import {
  createDocumentShareHref,
  createNavigationPersistenceCoordinator,
  parseDeepLinkFromLocation,
} from '../../src/App'

describe('document deep-link helpers', () => {
  it('parses a valid deep link and rejects incomplete or duplicate parameters', () => {
    expect(
      parseDeepLinkFromLocation({
        search: '?project=notes&profile=writer&path=docs%2Fguide.md',
        hash: '#design-goal',
      }),
    ).toEqual({ projectId: 'notes', profileId: 'writer', documentPath: 'docs/guide.md', headingId: 'design-goal' })
    expect(parseDeepLinkFromLocation({ search: '?project=notes&path=docs%2Fguide.md', hash: '' })).toBe('invalid')
    expect(parseDeepLinkFromLocation({ search: '?project=notes&project=other&profile=writer&path=docs%2Fguide.md', hash: '' })).toBe('invalid')
  })

  it('creates the canonical copy and replaceState URL shape', () => {
    const originalHref = window.location.href
    window.history.replaceState(null, '', 'http://localhost:3000/?legacy=value')
    const href = createDocumentShareHref('notes', 'writer', 'docs/guide.md', 'design-goal')
    const parsed = new URL(href)
    expect(parsed.search).toBe('?project=notes&profile=writer&path=docs%2Fguide.md')
    expect(parsed.hash).toBe('#design-goal')
    window.history.replaceState(null, '', href)
    expect(window.location.search).toBe('?project=notes&profile=writer&path=docs%2Fguide.md')
    expect(window.location.hash).toBe('#design-goal')
    window.history.replaceState(null, '', originalHref)
  })

  it('serializes delayed persistence so an older navigation cannot win the final state', async () => {
    const coordinator = createNavigationPersistenceCoordinator()
    let latestRequestId = 1
    let releaseOldSave: (() => void) | null = null
    const writes: string[] = []
    const oldResult = coordinator.enqueue(1, () => latestRequestId, async () => {
      await new Promise<void>((resolve) => {
        releaseOldSave = resolve
      })
      if (latestRequestId === 1) writes.push('old')
    })

    await Promise.resolve()
    latestRequestId = 2
    const newResult = coordinator.enqueue(2, () => latestRequestId, async () => {
      writes.push('new')
    })
    releaseOldSave?.()

    expect(await oldResult).toBe(false)
    expect(await newResult).toBe(true)
    expect(writes).toEqual(['new'])
  })
})
