import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

function createDeferredModule() {
  let resolve: ((value: { VisualMarkdownEditorImpl: React.ComponentType<any> }) => void) | null = null
  const promise = new Promise<{ VisualMarkdownEditorImpl: React.ComponentType<any> }>((nextResolve) => {
    resolve = nextResolve
  })

  return {
    promise,
    resolve(value: { VisualMarkdownEditorImpl: React.ComponentType<any> }) {
      resolve?.(value)
    },
  }
}

describe('VisualMarkdownEditor lazy wrapper', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('shows a loading shell first and then renders the loaded visual editor', async () => {
    vi.doMock('../../src/editor/visual-markdown-editor-impl', async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))

      return {
        VisualMarkdownEditorImpl: ({ value }: { value: string }) => (
          <div data-testid="loaded-editor">{value}</div>
        ),
      }
    })

    const { VisualMarkdownEditor } = await import('../../src/editor/visual-markdown-editor')

    render(<VisualMarkdownEditor value={'# 标题\n\n正文'} onChange={() => {}} />)

    expect(screen.getByText('正在加载可视编辑器…')).toBeInTheDocument()
    expect(await screen.findByTestId('loaded-editor')).toHaveTextContent(/# 标题\s+正文/)
  })

  it('drops stale async results after unmounting during lazy load', async () => {
    const deferredModule = createDeferredModule()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.doMock(
      '../../src/editor/visual-markdown-editor-impl',
      () => deferredModule.promise as Promise<{ VisualMarkdownEditorImpl: React.ComponentType<any> }>,
    )

    const { VisualMarkdownEditor } = await import('../../src/editor/visual-markdown-editor')
    const view = render(<VisualMarkdownEditor value={'# 标题'} onChange={() => {}} />)

    expect(screen.getByText('正在加载可视编辑器…')).toBeInTheDocument()

    view.unmount()

    await act(async () => {
      deferredModule.resolve({
        VisualMarkdownEditorImpl: ({ value }: { value: string }) => (
          <div data-testid="should-not-render">{value}</div>
        ),
      })
      await Promise.resolve()
    })

    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('hides leading html comments from the visual editor while preserving them on change', async () => {
    const handleChange = vi.fn()
    let capturedProps: { value: string; readonly?: boolean; onChange: (nextValue: string) => void } | null = null

    vi.doMock('../../src/editor/visual-markdown-editor-impl', async () => ({
      VisualMarkdownEditorImpl: (props: {
        value: string
        readonly?: boolean
        onChange: (nextValue: string) => void
      }) => {
        capturedProps = props
        return <div data-testid="loaded-editor">{props.value}</div>
      },
    }))

    const { VisualMarkdownEditor } = await import('../../src/editor/visual-markdown-editor')

    render(
      <VisualMarkdownEditor
        value={'<!-- page_id: test-123 -->\n# 标题\n\n正文'}
        onChange={handleChange}
      />,
    )

    expect(await screen.findByTestId('loaded-editor')).toHaveTextContent(/# 标题\s+正文/)
    expect(capturedProps?.value).toBe('# 标题\n\n正文')

    capturedProps?.onChange('# 新标题\n\n新正文')

    expect(handleChange).toHaveBeenCalledWith('<!-- page_id: test-123 -->\n# 新标题\n\n新正文')
  })

  it('passes readonly through the lazy editor wrapper', async () => {
    let capturedProps:
      | { value: string; readonly?: boolean; onChange: (nextValue: string) => void }
      | null = null

    vi.doMock('../../src/editor/visual-markdown-editor-impl', async () => ({
      VisualMarkdownEditorImpl: (props: {
        value: string
        readonly?: boolean
        onChange: (nextValue: string) => void
      }) => {
        capturedProps = props
        return (
          <div
            data-testid="loaded-editor"
            data-readonly={String(Boolean(props.readonly))}
          >
            {props.value}
          </div>
        )
      },
    }))

    const { VisualMarkdownEditor } = await import('../../src/editor/visual-markdown-editor')

    render(<VisualMarkdownEditor value={'# 锁定标题'} readonly onChange={() => {}} />)

    expect(await screen.findByTestId('loaded-editor')).toHaveAttribute('data-readonly', 'true')
    expect(capturedProps?.readonly).toBe(true)
  })

  it('applies markdown display transforms only in readonly mode', async () => {
    const capturedValues: string[] = []

    vi.doMock('../../src/editor/visual-markdown-editor-impl', async () => ({
      VisualMarkdownEditorImpl: (props: {
        value: string
        readonly?: boolean
        onChange: (nextValue: string) => void
      }) => {
        capturedValues.push(props.value)
        return <div data-testid="loaded-editor">{props.value}</div>
      },
    }))

    const { VisualMarkdownEditor } = await import('../../src/editor/visual-markdown-editor')
    const sampleMarkdown = '普通段落\n---\n## 下一节'
    const { rerender } = render(
      <VisualMarkdownEditor value={sampleMarkdown} readonly onChange={() => {}} />,
    )

    await screen.findByTestId('loaded-editor')

    rerender(<VisualMarkdownEditor value={sampleMarkdown} onChange={() => {}} />)

    expect(capturedValues[0]).toBe('普通段落\n\n---\n\n## 下一节')
    expect(capturedValues.at(-1)).toBe(sampleMarkdown)
  })
})
