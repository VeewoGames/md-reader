import { StrictMode, useEffect, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/editor/visual-markdown-editor', () => ({
  VisualMarkdownEditor: ({ value, readonly }: { value: string; readonly?: boolean }) => {
    const [isReady, setIsReady] = useState(false)
    const lines = value.split(/\r?\n/)

    useEffect(() => {
      const timer = window.setTimeout(() => {
        setIsReady(true)
      }, 0)

      return () => {
        window.clearTimeout(timer)
      }
    }, [])

    if (!isReady) {
      return <div role="status">正在加载可视编辑器…</div>
    }

    return (
      <div
        aria-label="可视 Markdown 编辑器"
        data-testid="visual-markdown-editor"
        data-readonly={readonly ? 'true' : 'false'}
      >
        {lines.map((line, index) => {
          const match = line.match(/^(#{1,6})\s+(.*)$/)

          if (match) {
            const HeadingTag = `h${match[1].length}` as keyof JSX.IntrinsicElements
            return <HeadingTag key={`heading-${index}`}>{match[2]}</HeadingTag>
          }

          if (line.trim().length === 0) {
            return null
          }

          return <p key={`paragraph-${index}`}>{line}</p>
        })}
      </div>
    )
  },
}))

vi.mock('../../src/document-renderer/readonly-markdown-renderer', () => ({
  ReadonlyMarkdownRenderer: ({ value }: { value: string }) => {
    const lines = value.split(/\r?\n/)

    return (
      <article aria-label="只读 Markdown 渲染器" className="readonly-markdown-renderer">
        {lines.map((line, index) => {
          const match = line.match(/^(#{1,6})\s+(.*)$/)

          if (match) {
            const HeadingTag = `h${match[1].length}` as keyof JSX.IntrinsicElements
            return (
              <HeadingTag key={`heading-${index}`} data-heading-id={match[2]}>
                {match[2]}
              </HeadingTag>
            )
          }

          if (line.trim().length === 0) {
            return null
          }

          return <p key={`paragraph-${index}`}>{line}</p>
        })}
      </article>
    )
  },
}))

import { WorkspaceLayout } from '../../src/app/WorkspaceLayout'

describe('WorkspaceLayout outline navigation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clicks outline items to scroll to the matching heading', async () => {
    const user = userEvent.setup()

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={[]}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 总览\n\n## 提交信息格式\n\n内容'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    await screen.findByLabelText('可视 Markdown 编辑器')
    const heading = screen.getByRole('heading', { name: '提交信息格式' })
    const scrollIntoView = vi.fn()

    Object.defineProperty(heading, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    await user.click(screen.getByRole('button', { name: '提交信息格式' }))

    expect(scrollIntoView).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '提交信息格式' })).toHaveAttribute(
      'aria-current',
      'location',
    )
  })

  it('updates the active outline item when the document scroll position changes', async () => {
    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={[]}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 总览\n\n## 第二节\n\n## 第三节'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    await screen.findByLabelText('可视 Markdown 编辑器')
    const headingElements = screen.getAllByRole('heading')
    const canvasPanel = document.querySelector('.panel__content--canvas') as HTMLDivElement | null

    expect(canvasPanel).not.toBeNull()

    Object.defineProperty(canvasPanel as HTMLDivElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 260 }),
    })

    Object.defineProperty(headingElements[0], 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 210 }),
    })
    Object.defineProperty(headingElements[1], 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 284 }),
    })
    Object.defineProperty(headingElements[2], 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 520 }),
    })

    canvasPanel?.dispatchEvent(new Event('scroll'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '第二节' })).toHaveAttribute(
        'aria-current',
        'location',
      )
    })
  })

  it('renders outline targets that map to real headings under StrictMode', async () => {
    render(
      <StrictMode>
        <WorkspaceLayout
          mode="regular"
          regularViewState="locked"
          fileTree={[]}
          currentDocumentPath="docs/guide.md"
          currentDocumentContent={'# 总览\n\n## 第二节\n\n### 第三节\n\n## 第四节'}
          statusMessage="当前项目：Notes"
          sidebarWidth={280}
          outlineWidth={320}
          hasProjects
          onDocumentSelect={() => {}}
          onSidebarWidthChange={() => {}}
          onSidebarWidthCommit={() => {}}
          onOutlineWidthChange={() => {}}
          onOutlineWidthCommit={() => {}}
        />
      </StrictMode>,
    )

    await screen.findByLabelText('可视 Markdown 编辑器')

    await waitFor(() => {
      expect(document.querySelectorAll('[data-heading-id]')).toHaveLength(4)
    })

    const headingIds = new Set(
      Array.from(document.querySelectorAll('[data-heading-id]')).map((element) =>
        element.getAttribute('data-heading-id'),
      ),
    )

    const outlineIds = Array.from(document.querySelectorAll('.outline-nav__item')).map((element) =>
      element.getAttribute('data-outline-id'),
    )

    expect(outlineIds).toEqual(['总览', '第二节', '第三节', '第四节'])
    expect(outlineIds.every((id) => id != null && headingIds.has(id))).toBe(true)
  })

  it('updates and commits pane widths when dragging resize separators', () => {
    const onSidebarWidthChange = vi.fn()
    const onSidebarWidthCommit = vi.fn()
    const onOutlineWidthChange = vi.fn()
    const onOutlineWidthCommit = vi.fn()

    render(
        <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={[]}
        currentDocumentPath={null}
        currentDocumentContent={null}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onSidebarWidthChange={onSidebarWidthChange}
        onSidebarWidthCommit={onSidebarWidthCommit}
        onOutlineWidthChange={onOutlineWidthChange}
        onOutlineWidthCommit={onOutlineWidthCommit}
      />,
    )

    fireEvent.pointerDown(screen.getByRole('separator', { name: '调整左侧文件列表宽度' }), {
      clientX: 300,
    })
    fireEvent.pointerMove(window, { clientX: 340 })
    fireEvent.pointerUp(window, { clientX: 340 })

    expect(onSidebarWidthChange).toHaveBeenLastCalledWith(320)
    expect(onSidebarWidthCommit).toHaveBeenLastCalledWith(320)

    fireEvent.pointerDown(screen.getByRole('separator', { name: '调整右侧标题导航宽度' }), {
      clientX: 900,
    })
    fireEvent.pointerMove(window, { clientX: 860 })
    fireEvent.pointerUp(window, { clientX: 860 })

    expect(onOutlineWidthChange).toHaveBeenLastCalledWith(360)
    expect(onOutlineWidthCommit).toHaveBeenLastCalledWith(360)
  })

  it('renders a locked visual markdown editor shell in regular mode', async () => {
    const { container } = render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={[]}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        editingDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
        onEditingDocumentContentChange={() => {}}
      />,
    )

    expect(await screen.findByLabelText('可视 Markdown 编辑器')).toHaveAttribute(
      'data-readonly',
      'true',
    )
    expect(screen.queryByRole('textbox', { name: 'Markdown 编辑器' })).not.toBeInTheDocument()
    expect(container.querySelector('.workspace__document-workarea')).not.toBeNull()
    expect(container.querySelector('.workspace__editor-pane')).not.toBeNull()
  })

  it('clicks outline items to scroll to the matching heading in regular editable mode', async () => {
    const user = userEvent.setup()

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="editable"
        fileTree={[]}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 总览\n\n## 提交信息格式\n\n内容'}
        editingDocumentContent={'# 总览\n\n## 提交信息格式\n\n内容'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
        onEditingDocumentContentChange={() => {}}
      />,
    )

    await screen.findByLabelText('可视 Markdown 编辑器')
    const heading = screen.getByRole('heading', { name: '提交信息格式' })
    const scrollIntoView = vi.fn()

    Object.defineProperty(heading, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    await user.click(screen.getByRole('button', { name: '提交信息格式' }))

    expect(scrollIntoView).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '提交信息格式' })).toHaveAttribute(
      'aria-current',
      'location',
    )
  })

  it('injects data-heading-id onto regular mode headings for unified outline targeting', async () => {
    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="editable"
        fileTree={[]}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 总览\n\n## 提交信息格式\n\n内容'}
        editingDocumentContent={'# 总览\n\n## 提交信息格式\n\n内容'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
        onEditingDocumentContentChange={() => {}}
      />,
    )

    await screen.findByLabelText('可视 Markdown 编辑器')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '总览' })).toHaveAttribute('data-heading-id', '总览')
      expect(screen.getByRole('heading', { name: '提交信息格式' })).toHaveAttribute(
        'data-heading-id',
        '提交信息格式',
      )
    })
  })

  it('renders editor and preview together in split mode', () => {
    const { container } = render(
      <WorkspaceLayout
        mode="split"
        regularViewState="locked"
        fileTree={[]}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 旧标题'}
        editingDocumentContent={'# 新标题\n\n内容'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
        onEditingDocumentContentChange={() => {}}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Markdown 编辑器' })).toHaveValue('# 新标题\n\n内容')
    expect(screen.getByLabelText('只读 Markdown 渲染器')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '新标题' })).toBeInTheDocument()
    expect(container.querySelectorAll('.workspace__split-pane')).toHaveLength(2)
  })

  it('renders the same visual editor skeleton in regular editable mode', async () => {
    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="editable"
        fileTree={[]}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 总览\n\n内容'}
        editingDocumentContent={'# 总览\n\n内容'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    expect(await screen.findByLabelText('可视 Markdown 编辑器')).toHaveAttribute(
      'data-readonly',
      'false',
    )
    expect(screen.getByRole('heading', { name: '总览' })).toBeInTheDocument()
  })

  it('does not attach a mutation observer to the editor pane in regular mode', async () => {
    const observe = vi.fn()
    const disconnect = vi.fn()

    class MockMutationObserver {
      constructor(_callback: MutationCallback) {}

      observe = observe
      disconnect = disconnect
    }

    vi.stubGlobal('MutationObserver', MockMutationObserver)

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="editable"
        fileTree={[]}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        editingDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
        onEditingDocumentContentChange={() => {}}
      />,
    )

    await screen.findByLabelText('可视 Markdown 编辑器')

    const editorPane = document.querySelector('.workspace__editor-pane')
    const observedEditorPane = observe.mock.calls.some(([target]) => target === editorPane)

    expect(observedEditorPane).toBe(false)
  })

})
