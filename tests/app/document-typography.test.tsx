import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import '../../src/index.css'

describe('document typography tokens', () => {
  it('aligns readonly and visual editor surfaces to the shared document typography baseline', () => {
    const { container } = render(
      <div className="workspace__document-workarea">
        <article className="markdown-document">
          <h1>标题</h1>
          <h2>二级标题</h2>
          <h3>三级标题</h3>
          <h4>四级标题</h4>
          <p>正文段落</p>
          <ul>
            <li>
              <p>列表项</p>
            </li>
            <li>
              <p>第二项</p>
            </li>
          </ul>
        </article>
        <div className="visual-markdown-editor">
          <div className="editor">
            <h1>标题</h1>
            <h2>二级标题</h2>
            <h3>三级标题</h3>
            <h4>四级标题</h4>
            <p>正文段落</p>
          </div>
        </div>
      </div>,
    )

    const readonlyRoot = container.querySelector('.markdown-document')
    const visualRoot = container.querySelector('.visual-markdown-editor .editor')
    const workarea = container.querySelector('.workspace__document-workarea')
    const readonlyH2 = container.querySelector('.markdown-document h2')
    const readonlyH3 = container.querySelector('.markdown-document h3')
    const readonlyH4 = container.querySelector('.markdown-document h4')
    const readonlyUl = container.querySelector('.markdown-document ul')
    const readonlyFirstListItem = container.querySelector('.markdown-document ul li')
    const readonlyListItemParagraph = container.querySelector('.markdown-document li > p')
    const readonlySecondListItem = container.querySelector('.markdown-document li + li')

    expect(readonlyRoot).not.toBeNull()
    expect(visualRoot).not.toBeNull()
    expect(workarea).not.toBeNull()
    expect(readonlyH2).not.toBeNull()
    expect(readonlyH3).not.toBeNull()
    expect(readonlyH4).not.toBeNull()
    expect(readonlyUl).not.toBeNull()
    expect(readonlyFirstListItem).not.toBeNull()
    expect(readonlyListItemParagraph).not.toBeNull()
    expect(readonlySecondListItem).not.toBeNull()

    const readonlyStyle = getComputedStyle(readonlyRoot as HTMLElement)
    const visualStyle = getComputedStyle(visualRoot as HTMLElement)
    const workareaStyle = getComputedStyle(workarea as HTMLElement)
    const readonlyH2Style = getComputedStyle(readonlyH2 as HTMLElement)
    const readonlyH3Style = getComputedStyle(readonlyH3 as HTMLElement)
    const readonlyH4Style = getComputedStyle(readonlyH4 as HTMLElement)
    const readonlyUlStyle = getComputedStyle(readonlyUl as HTMLElement)
    const readonlyFirstListItemStyle = getComputedStyle(readonlyFirstListItem as HTMLElement)
    const readonlyListItemParagraphStyle = getComputedStyle(readonlyListItemParagraph as HTMLElement)
    const readonlySecondListItemStyle = getComputedStyle(readonlySecondListItem as HTMLElement)
    const rootStyle = getComputedStyle(document.documentElement)

    expect(rootStyle.getPropertyValue('--doc-max-width').trim()).toBe('720px')
    expect(rootStyle.getPropertyValue('--doc-font-family')).toContain('Inter')
    expect(rootStyle.getPropertyValue('--doc-body-line-height').trim()).toBe('24px')
    expect(rootStyle.getPropertyValue('--doc-block-spacing').trim()).toBe('1.25rem')
    expect(rootStyle.getPropertyValue('--doc-surface-inline-padding').trim()).toBe('32px')

    expect(visualStyle.maxWidth).toBe(readonlyStyle.maxWidth)
    expect(visualStyle.fontFamily).toBe(readonlyStyle.fontFamily)
    expect(visualStyle.lineHeight).toBe(readonlyStyle.lineHeight)
    expect(readonlyStyle.marginLeft).toBe('auto')
    expect(readonlyStyle.marginRight).toBe('auto')
    expect(workareaStyle.justifyContent).toBe('center')
    expect(readonlyH2Style.fontSize).toBe('1.625rem')
    expect(readonlyH3Style.fontSize).toBe('1.25rem')
    expect(readonlyH4Style.fontSize).toBe('1.125rem')
    expect(readonlyH2Style.marginTop).toBe('2.2rem')
    expect(readonlyH3Style.marginTop).toBe('1.85rem')
    expect(readonlyH4Style.marginTop).toBe('1.45rem')
    expect(readonlyH4Style.marginBottom).toBe('0.7rem')
    expect(readonlyUlStyle.paddingLeft).toBe('0px')
    expect(readonlyFirstListItemStyle.paddingLeft).toBe('12.8px')
    expect(readonlyListItemParagraphStyle.marginBottom).toBe('0px')
    expect(readonlySecondListItemStyle.marginTop).toBe('0.55rem')
  })

  it('loads synced_block hide styles through the main style entry', () => {
    const { container } = render(
      <article className="markdown-document">
        <synced_block url="https://example.com/block">同步块占位</synced_block>
      </article>,
    )

    const syncedBlock = container.querySelector('synced_block')

    expect(syncedBlock).not.toBeNull()
    expect(getComputedStyle(syncedBlock as HTMLElement).display).toBe('none')
  })
})
