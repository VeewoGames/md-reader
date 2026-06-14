import { describe, expect, it } from 'vitest'

import { findActiveHeadingId } from '../../src/app/outline-active-heading'

function createHeadingTarget(id: string, top: number) {
  const element = document.createElement('h2')
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top }),
  })
  return { element, id }
}

describe('findActiveHeadingId', () => {
  it('uses the scroll container anchor instead of a fixed viewport threshold', () => {
    const headingTargets = [
      createHeadingTarget('overview', 280),
      createHeadingTarget('details', 340),
      createHeadingTarget('appendix', 620),
    ]

    expect(findActiveHeadingId(headingTargets, 324)).toBe('overview')
    expect(findActiveHeadingId(headingTargets, 300)).toBe('overview')
    expect(findActiveHeadingId(headingTargets, 320)).toBe('overview')
    expect(findActiveHeadingId(headingTargets, 339)).toBe('overview')
    expect(findActiveHeadingId(headingTargets, 340)).toBe('details')
  })

  it('falls back to the first heading when the anchor is still above the document', () => {
    const headingTargets = [
      createHeadingTarget('overview', 280),
      createHeadingTarget('details', 340),
    ]

    expect(findActiveHeadingId(headingTargets, 200)).toBe('overview')
  })
})
