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
})
