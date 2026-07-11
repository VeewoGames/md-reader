import { describe, expect, it } from 'vitest'

import { findCodeBlockStrongRanges } from '../../src/editor/code-block-strong-decorations'

describe('findCodeBlockStrongRanges', () => {
  it('finds both markers and the content for a strong Markdown span', () => {
    expect(findCodeBlockStrongRanges('**特质详情**：普通文字')).toEqual([
      {
        openingMarkerFrom: 0,
        openingMarkerTo: 2,
        contentFrom: 2,
        contentTo: 6,
        closingMarkerFrom: 6,
        closingMarkerTo: 8,
      },
    ])
  })

  it('finds each independent strong Markdown span on the same line', () => {
    expect(findCodeBlockStrongRanges('**定义** 与 **设计分类**')).toEqual([
      {
        openingMarkerFrom: 0,
        openingMarkerTo: 2,
        contentFrom: 2,
        contentTo: 4,
        closingMarkerFrom: 4,
        closingMarkerTo: 6,
      },
      {
        openingMarkerFrom: 9,
        openingMarkerTo: 11,
        contentFrom: 11,
        contentTo: 15,
        closingMarkerFrom: 15,
        closingMarkerTo: 17,
      },
    ])
  })

  it('leaves unclosed or empty marker pairs as ordinary code text', () => {
    expect(findCodeBlockStrongRanges('**未闭合\n****')).toEqual([])
  })
})
