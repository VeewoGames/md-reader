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

  it('hides synced_block wrapper lines from rendered markdown content', () => {
    expect(
      applyMarkdownTransforms(
        '# 标题\n<synced_block url="https://example.com/block">\n正文\n</synced_block>\n## 下一节',
      ),
    ).toBe('# 标题\n正文\n## 下一节')
  })

  it('keeps synced_block lines inside fenced code blocks unchanged', () => {
    expect(
      applyMarkdownTransforms(
        '```md\n<synced_block url="https://example.com/block">\n正文\n</synced_block>\n```',
      ),
    ).toBe('```md\n<synced_block url="https://example.com/block">\n正文\n</synced_block>\n```')
  })

  it('removes adjacent synced_block wrappers that appear on the same line', () => {
    expect(
      applyMarkdownTransforms(
        '# 标题\n</synced_block> <synced_block url="https://example.com/block">\n正文\n## 下一节',
      ),
    ).toBe('# 标题\n正文\n## 下一节')
  })

  it('removes escaped synced_block artifact lines produced by malformed markdown exports', () => {
    const transformed = applyMarkdownTransforms(
      [
        '# 代理系统',
        '',
        '\\<synced\\_block url="[https://www.notion.so/90ab2848635246b0828a0dd1055582a5#65e61e90cf0749709caa73df726c8ba6">](https://www.notion.so/90ab2848635246b0828a0dd1055582a5#65e61e90cf0749709caa73df726c8ba6">)',
        '',
        '## 真实召唤物',
        '',
        '正文',
        '',
        '\\</synced\\_block>',
      ].join('\n'),
    )

    expect(transformed).not.toContain('synced_block')
    expect(transformed).toContain('# 代理系统')
    expect(transformed).toContain('## 真实召唤物')
    expect(transformed).toContain('正文')
  })
})
