import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}))

vi.mock('mermaid', () => ({
  default: mermaidMock,
}))

import { MermaidDiagram } from '../../src/document-renderer/mermaid-diagram'

describe('MermaidDiagram', () => {
  beforeEach(() => {
    mermaidMock.initialize.mockClear()
    mermaidMock.render.mockReset()
  })

  afterEach(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen
    delete (document as Partial<Document>).exitFullscreen
    delete (document as Partial<Document>).fullscreenElement
  })

  it('renders a valid chart as an accessible SVG figure', async () => {
    mermaidMock.render.mockResolvedValue({
      svg: '<svg viewBox="0 0 100 50"><text>完整流程图</text></svg>',
    })

    render(<MermaidDiagram chart={'flowchart TD\n  A --> B'} />)

    expect(screen.getByRole('status')).toHaveTextContent('正在渲染流程图')

    const figure = await screen.findByRole('figure', { name: 'Mermaid 流程图' })

    expect(figure.querySelector('svg')).not.toBeNull()
    expect(figure).toHaveTextContent('完整流程图')
    expect(mermaidMock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        look: 'classic',
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        theme: 'base',
        themeVariables: expect.objectContaining({
          primaryColor: '#fff8ec',
          lineColor: '#8a7562',
        }),
        flowchart: expect.objectContaining({
          curve: 'rounded',
          nodeSpacing: 56,
          rankSpacing: 70,
        }),
      }),
    )
    expect(mermaidMock.render).toHaveBeenCalledWith(
      expect.stringMatching(/^md-reader-mermaid-\d+$/),
      'flowchart TD\n  A --> B',
    )
  })

  it('supports zoom, fit-width, reset, and zoom boundaries without changing chart source', async () => {
    const user = userEvent.setup()
    mermaidMock.render.mockResolvedValue({
      svg: '<svg viewBox="0 0 1200 600"><text>宽流程图</text></svg>',
    })

    const { container } = render(<MermaidDiagram chart={'flowchart TD\n  A --> B'} />)

    await screen.findByRole('figure', { name: 'Mermaid 流程图' })

    const canvas = container.querySelector('.mermaid-diagram__canvas') as HTMLElement | null

    expect(screen.getByLabelText('当前缩放比例')).toHaveTextContent('75%')
    expect(canvas?.style.width).toBe('75%')

    await user.click(screen.getByRole('button', { name: '放大流程图' }))
    expect(screen.getByLabelText('当前缩放比例')).toHaveTextContent('100%')
    expect(canvas?.style.width).toBe('100%')

    await user.click(screen.getByRole('button', { name: '缩小流程图' }))
    expect(screen.getByLabelText('当前缩放比例')).toHaveTextContent('75%')

    await user.click(screen.getByRole('button', { name: '适应流程图宽度' }))
    expect(screen.getByLabelText('当前缩放比例')).toHaveTextContent('100%')

    await user.click(screen.getByRole('button', { name: '重置流程图缩放' }))
    expect(screen.getByLabelText('当前缩放比例')).toHaveTextContent('75%')

    await user.click(screen.getByRole('button', { name: '缩小流程图' }))
    expect(screen.getByLabelText('当前缩放比例')).toHaveTextContent('50%')
    expect(screen.getByRole('button', { name: '缩小流程图' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '重置流程图缩放' }))

    for (let step = 0; step < 7; step += 1) {
      await user.click(screen.getByRole('button', { name: '放大流程图' }))
    }

    expect(screen.getByLabelText('当前缩放比例')).toHaveTextContent('250%')
    expect(screen.getByRole('button', { name: '放大流程图' })).toBeDisabled()
    expect(mermaidMock.render).toHaveBeenCalledTimes(1)
  })

  it('enters and exits fullscreen through the diagram toolbar', async () => {
    const user = userEvent.setup()
    let fullscreenElement: Element | null = null

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    })
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: vi.fn(() => {
        fullscreenElement = document.querySelector('.mermaid-diagram')
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      }),
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: vi.fn(() => {
        fullscreenElement = null
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      }),
    })

    mermaidMock.render.mockResolvedValue({
      svg: '<svg viewBox="0 0 100 50"><text>全屏流程图</text></svg>',
    })

    render(<MermaidDiagram chart={'flowchart TD\n  A --> B'} />)

    const enterFullscreen = await screen.findByRole('button', { name: '全屏查看流程图' })

    expect(enterFullscreen).toBeEnabled()
    await user.click(enterFullscreen)
    expect(screen.getByRole('button', { name: '退出流程图全屏' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '退出流程图全屏' }))
    expect(screen.getByRole('button', { name: '全屏查看流程图' })).toBeInTheDocument()

  })

  it('falls back to an in-app fullscreen overlay when the native API is unavailable', async () => {
    const user = userEvent.setup()
    mermaidMock.render.mockResolvedValue({
      svg: '<svg viewBox="0 0 100 50"><text>覆盖层流程图</text></svg>',
    })

    render(<MermaidDiagram chart={'flowchart TD\n  A --> B'} />)

    const enterFullscreen = await screen.findByRole('button', { name: '全屏查看流程图' })
    expect(enterFullscreen).toBeEnabled()
    await user.click(enterFullscreen)
    expect(screen.getByRole('figure', { name: 'Mermaid 流程图' })).toHaveAttribute(
      'data-fullscreen',
      'true',
    )
    expect(screen.getByRole('button', { name: '退出流程图全屏' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.getByRole('figure', { name: 'Mermaid 流程图' })).not.toHaveAttribute(
      'data-fullscreen',
    )
    expect(screen.getByRole('button', { name: '全屏查看流程图' })).toBeInTheDocument()
  })

  it('resets view-only zoom when the chart source changes', async () => {
    const user = userEvent.setup()
    mermaidMock.render.mockResolvedValue({
      svg: '<svg viewBox="0 0 100 50"><text>流程图</text></svg>',
    })

    const { rerender } = render(<MermaidDiagram chart={'flowchart TD\n  A --> B'} />)

    await screen.findByRole('figure', { name: 'Mermaid 流程图' })
    await user.click(screen.getByRole('button', { name: '放大流程图' }))
    expect(screen.getByLabelText('当前缩放比例')).toHaveTextContent('100%')

    rerender(<MermaidDiagram chart={'flowchart TD\n  C --> D'} />)

    await screen.findByRole('figure', { name: 'Mermaid 流程图' })
    expect(screen.getByLabelText('当前缩放比例')).toHaveTextContent('75%')
    expect(mermaidMock.render).toHaveBeenCalledTimes(2)
  })

  it('falls back to the original source when Mermaid rejects invalid syntax', async () => {
    mermaidMock.render.mockRejectedValue(new Error('Parse error'))

    const { container } = render(<MermaidDiagram chart={'flowchart TD\n  A --'} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('流程图渲染失败')
    expect(container.querySelector('code.language-mermaid')?.textContent).toBe(
      'flowchart TD\n  A --',
    )
  })
})
