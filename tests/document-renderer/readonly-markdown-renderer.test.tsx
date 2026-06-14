import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/document-renderer/readonly-markdown-renderer-impl', () => ({
  ReadonlyMarkdownRendererImpl: ({ value }: { value: string }) => (
    <div aria-label="只读 Markdown 渲染器" data-value={value}>
      {value}
    </div>
  ),
}))

import { ReadonlyMarkdownRenderer } from '../../src/document-renderer/readonly-markdown-renderer'

describe('ReadonlyMarkdownRenderer', () => {
  it('strips leading HTML comments before passing value to readonly renderer', async () => {
    render(<ReadonlyMarkdownRenderer value={'<!-- note -->\n<!-- keep -->\n# 标题\n\n正文'} />)

    const renderer = await screen.findByLabelText('只读 Markdown 渲染器')

    expect(renderer).toHaveAttribute('data-value', '# 标题\n\n正文')
    expect(renderer).not.toHaveTextContent('note')
    expect(renderer).not.toHaveTextContent('keep')
  })
})
