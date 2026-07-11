import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import '../../src/index.css'

describe('Mermaid diagram styles', () => {
  it('contains wide diagrams without expanding the document layout', () => {
    const { container } = render(
      <figure className="mermaid-diagram">
        <div className="mermaid-diagram__toolbar" />
        <div className="mermaid-diagram__viewport">
          <div className="mermaid-diagram__canvas" style={{ width: '75%' }}>
            <div className="mermaid-diagram__surface">
              <svg viewBox="0 0 1200 600" />
            </div>
          </div>
        </div>
      </figure>,
    )

    const figure = container.querySelector('.mermaid-diagram')
    const viewport = container.querySelector('.mermaid-diagram__viewport')
    const canvas = container.querySelector('.mermaid-diagram__canvas')
    const svg = container.querySelector('.mermaid-diagram__surface svg')

    expect(figure).not.toBeNull()
    expect(viewport).not.toBeNull()
    expect(canvas).not.toBeNull()
    expect(svg).not.toBeNull()
    expect(getComputedStyle(figure as HTMLElement).overflow).toBe('hidden')
    expect(getComputedStyle(figure as HTMLElement).width).toBe('100%')
    expect(getComputedStyle(viewport as HTMLElement).overflowX).toBe('auto')
    expect(getComputedStyle(viewport as HTMLElement).overflowY).toBe('hidden')
    expect((canvas as HTMLElement).style.width).toBe('75%')
    expect(getComputedStyle(canvas as HTMLElement).minWidth).toBe('50%')
    expect(getComputedStyle(svg as SVGElement).maxWidth).toBe('none')
    expect(getComputedStyle(svg as SVGElement).width).toBe('100%')
  })
})
