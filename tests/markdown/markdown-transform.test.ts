import { describe, expect, it } from 'vitest'

import { applyMarkdownTransforms } from '../../src/markdown/markdown-transform'

describe('applyMarkdownTransforms', () => {
  it('inserts blank lines around --- after a paragraph so markdown parsers treat it as hr', () => {
    expect(applyMarkdownTransforms('段落\n---\n## 下一节')).toBe('段落\n\n---\n\n## 下一节')
  })

  it('keeps --- inside fenced code blocks unchanged', () => {
    expect(applyMarkdownTransforms('```md\n段落\n---\n## 下一节\n```')).toBe(
      '```md\n段落\n---\n## 下一节\n```',
    )
  })
})
