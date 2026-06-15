import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ReadonlyMarkdownRendererImpl } from '../../src/document-renderer/readonly-markdown-renderer-impl'

describe('ReadonlyMarkdownRendererImpl', () => {
  it('renders markdown headings and paragraphs with standard semantics', () => {
    render(
      <ReadonlyMarkdownRendererImpl
        value={'# 词缀系统\n\n## 概述\n\n词缀系统是夜曲装备系统的核心数值层。'}
      />,
    )

    expect(screen.getByRole('group', { name: '只读 Markdown 渲染器' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '词缀系统' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '概述' })).toBeInTheDocument()
    expect(screen.getByText('词缀系统是夜曲装备系统的核心数值层。').tagName).toBe('P')
  })

  it('supports gfm links in readonly preview', () => {
    render(<ReadonlyMarkdownRendererImpl value={'[Notion 文档](https://example.com)'} />)

    expect(screen.getByRole('link', { name: 'Notion 文档' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
  })

  it('treats --- after a paragraph as a thematic break instead of a setext heading', () => {
    const { container } = render(
      <ReadonlyMarkdownRendererImpl
        value={
          '# 词缀系统\n\n## 概述\n\n词缀系统是夜曲装备系统的核心数值层。\n---\n## 2026-04-28 修订：装备词缀池落地规则'
        }
      />,
    )

    expect(screen.getByText('词缀系统是夜曲装备系统的核心数值层。').tagName).toBe('P')
    expect(container.querySelector('hr')).not.toBeNull()
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: '2026-04-28 修订：装备词缀池落地规则',
      }),
    ).toBeInTheDocument()
  })

  it('does not show synced_block wrapper text when adjacent wrappers share a line', () => {
    render(
      <ReadonlyMarkdownRendererImpl
        value={
          '# 标题\n</synced_block> <synced_block url="https://example.com/block">\n正文段落'
        }
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: '标题' })).toBeInTheDocument()
    expect(screen.getByText('正文段落')).toBeInTheDocument()
    expect(screen.queryByText(/synced_block/i)).toBeNull()
  })

  it('does not show escaped synced_block export artifacts from malformed markdown', () => {
    render(
      <ReadonlyMarkdownRendererImpl
        value={[
          '# 代理系统',
          '',
          '\\<synced\\_block url="[https://www.notion.so/90ab2848635246b0828a0dd1055582a5#65e61e90cf0749709caa73df726c8ba6">](https://www.notion.so/90ab2848635246b0828a0dd1055582a5#65e61e90cf0749709caa73df726c8ba6">)',
          '',
          '## 真实召唤物',
          '',
          '正文',
          '',
          '\\</synced\\_block>',
        ].join('\n')}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: '代理系统' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '真实召唤物' })).toBeInTheDocument()
    expect(screen.getByText('正文')).toBeInTheDocument()
    expect(screen.queryByText(/synced_block/i)).toBeNull()
  })
})
