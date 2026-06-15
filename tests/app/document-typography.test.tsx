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
          <ul>
            <li>
              <p>紧邻三级标题的列表项</p>
            </li>
          </ul>
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
          <ul>
            <li>
              <p>
                <strong>加粗前缀</strong>
                {' ：说明文本'}
              </p>
            </li>
          </ul>
          <pre>
            <code>const sample = true</code>
          </pre>
          <table>
            <thead>
              <tr>
                <th>
                  <p>表头一</p>
                </th>
                <th>表头二</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <p>单元格一</p>
                </td>
                <td>单元格二</td>
              </tr>
            </tbody>
          </table>
        </article>
        <div className="visual-markdown-editor">
          <div className="editor">
            <h1>标题</h1>
            <h2>二级标题</h2>
            <h3>三级标题</h3>
            <ul>
              <li>
                <p>紧邻三级标题的列表项</p>
              </li>
            </ul>
            <h4>四级标题</h4>
            <p>正文段落</p>
            <pre>
              <code>const sample = true</code>
            </pre>
            <table>
              <thead>
                <tr>
                  <th>
                    <p>表头一</p>
                  </th>
                  <th>表头二</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <p>单元格一</p>
                  </td>
                  <td>单元格二</td>
                </tr>
              </tbody>
            </table>
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
    const readonlyLists = container.querySelectorAll('.markdown-document ul')
    const readonlyH3AdjacentList = readonlyLists[0] ?? null
    const readonlyUl = readonlyLists[1] ?? null
    const readonlyFirstListItem = readonlyLists[1]?.querySelector('li') ?? null
    const readonlyListItemParagraph = container.querySelector('.markdown-document li > p')
    const readonlySecondListItem = container.querySelector('.markdown-document li + li')
    const readonlyPre = container.querySelector('.markdown-document pre')
    const readonlyTable = container.querySelector('.markdown-document table')
    const readonlyHeadCell = container.querySelector('.markdown-document thead th')
    const readonlyBodyCell = container.querySelector('.markdown-document tbody td')
    const readonlyBodyCellParagraph = container.querySelector('.markdown-document tbody td p')
    const visualPre = container.querySelector('.visual-markdown-editor .editor pre')
    const visualTable = container.querySelector('.visual-markdown-editor .editor table')
    const visualHeadCell = container.querySelector('.visual-markdown-editor .editor thead th')
    const visualBodyCell = container.querySelector('.visual-markdown-editor .editor tbody td')
    const visualBodyCellParagraph = container.querySelector('.visual-markdown-editor .editor tbody td p')

    expect(readonlyRoot).not.toBeNull()
    expect(visualRoot).not.toBeNull()
    expect(workarea).not.toBeNull()
    expect(readonlyH2).not.toBeNull()
    expect(readonlyH3).not.toBeNull()
    expect(readonlyH4).not.toBeNull()
    expect(readonlyH3AdjacentList).not.toBeNull()
    expect(readonlyUl).not.toBeNull()
    expect(readonlyFirstListItem).not.toBeNull()
    expect(readonlyListItemParagraph).not.toBeNull()
    expect(readonlySecondListItem).not.toBeNull()
    expect(readonlyPre).not.toBeNull()
    expect(readonlyTable).not.toBeNull()
    expect(readonlyHeadCell).not.toBeNull()
    expect(readonlyBodyCell).not.toBeNull()
    expect(readonlyBodyCellParagraph).not.toBeNull()
    expect(visualPre).not.toBeNull()
    expect(visualTable).not.toBeNull()
    expect(visualHeadCell).not.toBeNull()
    expect(visualBodyCell).not.toBeNull()
    expect(visualBodyCellParagraph).not.toBeNull()

    const readonlyStyle = getComputedStyle(readonlyRoot as HTMLElement)
    const visualStyle = getComputedStyle(visualRoot as HTMLElement)
    const workareaStyle = getComputedStyle(workarea as HTMLElement)
    const readonlyH2Style = getComputedStyle(readonlyH2 as HTMLElement)
    const readonlyH3Style = getComputedStyle(readonlyH3 as HTMLElement)
    const readonlyH4Style = getComputedStyle(readonlyH4 as HTMLElement)
    const readonlyH3AdjacentListStyle = getComputedStyle(readonlyH3AdjacentList as HTMLElement)
    const readonlyUlStyle = getComputedStyle(readonlyUl as HTMLElement)
    const readonlyFirstListItemStyle = getComputedStyle(readonlyFirstListItem as HTMLElement)
    const readonlyListItemParagraphStyle = getComputedStyle(readonlyListItemParagraph as HTMLElement)
    const readonlySecondListItemStyle = getComputedStyle(readonlySecondListItem as HTMLElement)
    const readonlyTableStyle = getComputedStyle(readonlyTable as HTMLElement)
    const readonlyHeadCellStyle = getComputedStyle(readonlyHeadCell as HTMLElement)
    const readonlyBodyCellStyle = getComputedStyle(readonlyBodyCell as HTMLElement)
    const readonlyBodyCellParagraphStyle = getComputedStyle(readonlyBodyCellParagraph as HTMLElement)
    const visualTableStyle = getComputedStyle(visualTable as HTMLElement)
    const visualHeadCellStyle = getComputedStyle(visualHeadCell as HTMLElement)
    const visualBodyCellStyle = getComputedStyle(visualBodyCell as HTMLElement)
    const visualBodyCellParagraphStyle = getComputedStyle(visualBodyCellParagraph as HTMLElement)
    const rootStyle = getComputedStyle(document.documentElement)

    expect(rootStyle.getPropertyValue('--doc-max-width').trim()).toBe('720px')
    expect(rootStyle.getPropertyValue('--doc-font-family')).toContain('Inter')
    expect(rootStyle.getPropertyValue('--doc-body-line-height').trim()).toBe('1.6')
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
    expect(readonlyH3AdjacentListStyle.marginTop).toBe('1rem')
    expect(readonlyUlStyle.paddingLeft).toBe('0px')
    expect(readonlyFirstListItemStyle.paddingLeft).toBe('26px')
    expect(readonlyFirstListItemStyle.lineHeight).toBe(readonlyStyle.lineHeight)
    expect(readonlyListItemParagraphStyle.marginBottom).toBe('0px')
    expect(readonlySecondListItemStyle.marginTop).toBe('0.55rem')
    expect(readonlyTableStyle.borderTopWidth).toBe('1px')
    expect(readonlyTableStyle.borderRightWidth).toBe('1px')
    expect(readonlyTableStyle.borderBottomWidth).toBe('1px')
    expect(readonlyTableStyle.borderLeftWidth).toBe('1px')
    expect(readonlyTableStyle.borderTopStyle).toBe('solid')
    expect(readonlyTableStyle.borderRadius).toBe('10px')
    expect(readonlyTableStyle.fontSize).toBe('14px')
    expect(['var(--doc-pre-bg)', rootStyle.getPropertyValue('--doc-pre-bg').trim()]).toContain(
      readonlyTableStyle.backgroundColor,
    )
    expect(['var(--line)', rootStyle.getPropertyValue('--line').trim()]).toContain(
      readonlyTableStyle.borderTopColor,
    )
    expect(readonlyTableStyle.marginTop).toBe('1.5rem')
    expect(readonlyTableStyle.marginBottom).toBe('1.5rem')
    expect(readonlyHeadCellStyle.paddingTop).toBe('0.5rem')
    expect(readonlyHeadCellStyle.paddingRight).toBe('0.75rem')
    expect(readonlyHeadCellStyle.paddingBottom).toBe('0.5rem')
    expect(readonlyHeadCellStyle.paddingLeft).toBe('0.75rem')
    expect(readonlyHeadCellStyle.whiteSpace).toBe('nowrap')
    expect(readonlyBodyCellStyle.paddingTop).toBe('0.42rem')
    expect(readonlyBodyCellStyle.paddingRight).toBe('0.75rem')
    expect(readonlyBodyCellStyle.paddingBottom).toBe('0.42rem')
    expect(readonlyBodyCellStyle.paddingLeft).toBe('0.75rem')
    expect(readonlyBodyCellParagraphStyle.marginTop).toBe('0px')
    expect(readonlyBodyCellParagraphStyle.marginBottom).toBe('0px')
    expect(visualTableStyle.fontSize).toBe(readonlyTableStyle.fontSize)
    expect(visualTableStyle.borderRadius).toBe(readonlyTableStyle.borderRadius)
    expect(['var(--doc-pre-bg)', rootStyle.getPropertyValue('--doc-pre-bg').trim()]).toContain(
      visualTableStyle.backgroundColor,
    )
    expect(['var(--line)', rootStyle.getPropertyValue('--line').trim()]).toContain(
      visualTableStyle.borderTopColor,
    )
    expect(visualTableStyle.marginTop).toBe(readonlyTableStyle.marginTop)
    expect(visualTableStyle.marginBottom).toBe(readonlyTableStyle.marginBottom)
    expect(visualHeadCellStyle.paddingTop).toBe(readonlyHeadCellStyle.paddingTop)
    expect(visualHeadCellStyle.whiteSpace).toBe(readonlyHeadCellStyle.whiteSpace)
    expect(visualBodyCellStyle.paddingTop).toBe(readonlyBodyCellStyle.paddingTop)
    expect(visualBodyCellParagraphStyle.marginBottom).toBe(readonlyBodyCellParagraphStyle.marginBottom)
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
