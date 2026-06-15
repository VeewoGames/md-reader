import { describe, expect, it } from 'vitest'

import { extractMarkdownHeadings } from '../../src/markdown/heading-outline'

describe('extractMarkdownHeadings', () => {
  it('extracts heading text, depth and stable ids from markdown', () => {
    expect(
      extractMarkdownHeadings(`# Title

## 子标题

## Title
`),
    ).toEqual([
      { id: 'title', text: 'Title', depth: 1 },
      { id: '子标题', text: '子标题', depth: 2 },
      { id: 'title-2', text: 'Title', depth: 2 },
    ])
  })

  it('ignores pseudo headings inside fenced code blocks', () => {
    expect(
      extractMarkdownHeadings(`## Real Heading

\`\`\`md
# Not a heading
\`\`\`
`),
    ).toEqual([{ id: 'real-heading', text: 'Real Heading', depth: 2 }])
  })

  it('does not promote a paragraph before --- into a setext heading', () => {
    expect(
      extractMarkdownHeadings(`# 词缀系统

## 概述

词缀系统是夜曲装备系统的核心数值层。
---
## 2026-04-28 修订：装备词缀池落地规则
`),
    ).toEqual([
      { id: '词缀系统', text: '词缀系统', depth: 1 },
      { id: '概述', text: '概述', depth: 2 },
      {
        id: '2026-04-28-修订-装备词缀池落地规则',
        text: '2026-04-28 修订：装备词缀池落地规则',
        depth: 2,
      },
    ])
  })
})
