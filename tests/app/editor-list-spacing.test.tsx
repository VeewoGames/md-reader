import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import '../../src/index.css'

describe('visual editor list spacing', () => {
  it('keeps list item wrappers as block flow containers', () => {
    const { container } = render(
      <div className="visual-markdown-editor">
        <div className="milkdown">
          <div className="editor">
            <ul data-spread="true">
              <div className="milkdown-list-item-block">
                <li className="list-item">
                  <div className="children">
                    <div className="content-dom">
                      <p>第一项</p>
                    </div>
                  </div>
                </li>
              </div>
              <div className="milkdown-list-item-block">
                <li className="list-item">
                  <div className="children">
                    <div className="content-dom">
                      <p>第二项</p>
                    </div>
                  </div>
                </li>
              </div>
            </ul>
          </div>
        </div>
      </div>,
    )

    const wrappers = container.querySelectorAll('.milkdown-list-item-block')

    expect(wrappers).toHaveLength(2)
    expect(getComputedStyle(wrappers[0]).display).toBe('block')
    expect(getComputedStyle(wrappers[1]).marginTop).not.toBe('0px')
  })

  it('restores spacing between a list paragraph and nested list', () => {
    const { container } = render(
      <div className="visual-markdown-editor">
        <div className="milkdown">
          <div className="editor">
            <ul data-spread="true">
              <div className="milkdown-list-item-block">
                <li className="list-item">
                  <div className="children">
                    <div className="content-dom">
                      <p>父级条目</p>
                      <ul data-spread="false">
                        <div className="milkdown-list-item-block">
                          <li className="list-item">
                            <div className="children">
                              <div className="content-dom">
                                <p>子级条目</p>
                              </div>
                            </div>
                          </li>
                        </div>
                      </ul>
                    </div>
                  </div>
                </li>
              </div>
            </ul>
          </div>
        </div>
      </div>,
    )

    const paragraph = container.querySelector('.content-dom > p')
    const nestedList = container.querySelector('.content-dom > ul')

    expect(paragraph).not.toBeNull()
    expect(nestedList).not.toBeNull()
    expect(getComputedStyle(paragraph as HTMLElement).marginBottom).toBe('0px')
    expect(getComputedStyle(nestedList as HTMLElement).marginTop).not.toBe('0px')
    expect(getComputedStyle(nestedList as HTMLElement).marginBottom).toBe('0px')
  })
})
