import { describe, expect, it } from 'vitest'

import {
  buildShiftMap,
  findDropIndexByCenter,
  moveTabId,
} from '../../src/workspace/tab-order'

describe('tab-order helpers', () => {
  it('moves a tab id to the requested index without duplicating entries', () => {
    expect(moveTabId(['a', 'b', 'c'], 'b', 0)).toEqual(['b', 'a', 'c'])
    expect(moveTabId(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
  })

  it('switches target index only after the dragged center crosses a neighbor center', () => {
    const rects = {
      a: { left: 0, width: 100, center: 50 },
      b: { left: 110, width: 100, center: 160 },
      c: { left: 220, width: 100, center: 270 },
    }

    expect(findDropIndexByCenter(['a', 'b', 'c'], 'a', 120, rects)).toBe(0)
    expect(findDropIndexByCenter(['a', 'b', 'c'], 'a', 170, rects)).toBe(1)
    expect(findDropIndexByCenter(['a', 'b', 'c'], 'a', 281, rects)).toBe(2)
  })

  it('returns shift metadata only for non-dragging tabs that need to yield', () => {
    expect(
      buildShiftMap({
        committedOrder: ['a', 'b', 'c'],
        previewOrder: ['b', 'a', 'c'],
        dragTabId: 'b',
        rectsById: {
          a: { left: 0, width: 100, center: 50 },
          b: { left: 110, width: 100, center: 160 },
          c: { left: 220, width: 100, center: 270 },
        },
      }),
    ).toEqual({
      a: 110,
      c: 0,
    })
  })

  it('shifts siblings by target slot positions when dragging the last tab to the front', () => {
    expect(
      buildShiftMap({
        committedOrder: ['a', 'b', 'c'],
        previewOrder: ['c', 'a', 'b'],
        dragTabId: 'c',
        rectsById: {
          a: { left: 0, width: 100, center: 50 },
          b: { left: 110, width: 100, center: 160 },
          c: { left: 220, width: 100, center: 270 },
        },
      }),
    ).toEqual({
      a: 110,
      b: 110,
    })
  })

})
