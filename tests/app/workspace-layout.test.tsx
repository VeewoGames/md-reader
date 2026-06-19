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
        {renderMockMarkdown(lines)}
      </div>
    )
  },
}))

vi.mock('../../src/document-renderer/readonly-markdown-renderer', () => ({
  ReadonlyMarkdownRenderer: ({ value }: { value: string }) => {
    const lines = value.split(/\r?\n/)

    return (
      <article aria-label="只读 Markdown 渲染器" className="readonly-markdown-renderer">
        {renderMockMarkdown(lines, true)}
      </article>
    )
  },
}))

import { WorkspaceLayout } from '../../src/app/WorkspaceLayout'
import { buildFileTree } from '../../src/workspace/file-tree'

function renderMockMarkdown(lines: string[], attachHeadingIds = false) {
  return lines.map((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.*)$/)

    if (match) {
      const HeadingTag = `h${match[1].length}` as keyof JSX.IntrinsicElements
      const headingProps = attachHeadingIds ? { 'data-heading-id': match[2] } : {}

      return (
        <HeadingTag key={`heading-${index}`} {...headingProps}>
          {match[2]}
        </HeadingTag>
      )
    }

    if (/^[ \t]{0,3}-{3,}[ \t]*$/.test(line)) {
      return <hr key={`hr-${index}`} />
    }

    if (line.trim().length === 0) {
      return null
    }

    return <p key={`paragraph-${index}`}>{line}</p>
  })
}

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

  it('renders --- consistently in locked regular mode and split preview', async () => {
    const markdown = '# 标题\n\n普通段落\n\n---\n\n## 下一节'
    const { container, rerender } = render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={[]}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={markdown}
        editingDocumentContent={markdown}
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
      'true',
    )
    expect(screen.getByText('普通段落').tagName).toBe('P')
    expect(container.querySelector('[data-testid="visual-markdown-editor"] hr')).not.toBeNull()
    expect(screen.getByRole('heading', { name: '下一节' })).toBeInTheDocument()

    rerender(
      <WorkspaceLayout
        mode="split"
        regularViewState="locked"
        fileTree={[]}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={markdown}
        editingDocumentContent={markdown}
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

    expect(screen.getByLabelText('只读 Markdown 渲染器')).toBeInTheDocument()
    expect(screen.getAllByText('普通段落')[0]?.tagName).toBe('P')
    expect(container.querySelector('.readonly-markdown-renderer hr')).not.toBeNull()
    expect(screen.getByRole('heading', { name: '下一节' })).toBeInTheDocument()
  })

  it('renders the same visual editor skeleton in regular editable mode', async () => {
    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="editable"
        fileTree={[]}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 总览\n\n普通段落\n\n---\n\n## 下一节'}
        editingDocumentContent={'# 总览\n\n普通段落\n\n---\n\n## 下一节'}
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
    expect(screen.getByText('普通段落').tagName).toBe('P')
    expect(document.querySelector('[data-testid="visual-markdown-editor"] hr')).not.toBeNull()
    expect(screen.getByRole('heading', { name: '下一节' })).toBeInTheDocument()
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

  it('filters file tree entries from the sidebar search box and still opens matched files', async () => {
    const user = userEvent.setup()
    const onDocumentSelect = vi.fn()

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={buildFileTree(['docs/guide.md', 'docs/api/reference.md', 'notes/meeting.md'])}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={onDocumentSelect}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    const searchInput = screen.getByRole('searchbox', { name: '搜索文件' })

    expect(screen.getByRole('button', { name: 'guide.md' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'reference.md' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'meeting.md' })).toBeInTheDocument()

    await user.type(searchInput, 'ref')

    expect(screen.queryByRole('button', { name: 'guide.md' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'reference.md' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'meeting.md' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'docs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'api' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'reference.md' }))

    expect(onDocumentSelect).toHaveBeenCalledWith('docs/api/reference.md')

    await user.clear(searchInput)

    expect(screen.getByRole('button', { name: 'guide.md' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'meeting.md' })).toBeInTheDocument()
  })

  it('shows an empty state when the sidebar search does not match any files', async () => {
    const user = userEvent.setup()

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={buildFileTree(['docs/guide.md'])}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
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

    await user.type(screen.getByRole('searchbox', { name: '搜索文件' }), 'zzz')

    expect(screen.getByText('没有匹配的文件')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'guide.md' })).not.toBeInTheDocument()
  })

  it('restores persisted directory expansion state exactly when a saved preference exists', () => {
    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={buildFileTree(['docs/guides/guide.md', 'notes/todo.md'])}
        currentDocumentPath="docs/guides/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        persistedExpandedDirectories={[]}
        hasPersistedExpandedDirectories
        hasProjects
        onDocumentSelect={() => {}}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'docs' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'notes' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'guide.md' })).not.toBeInTheDocument()
  })

  it('reports expanded directory changes so the caller can persist them', async () => {
    const user = userEvent.setup()
    const onExpandedDirectoriesChange = vi.fn()

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={buildFileTree(['docs/guides/guide.md'])}
        currentDocumentPath={null}
        currentDocumentContent={null}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        persistedExpandedDirectories={['docs']}
        hasPersistedExpandedDirectories
        hasProjects
        onDocumentSelect={() => {}}
        onExpandedDirectoriesChange={onExpandedDirectoriesChange}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'guides' }))

    expect(onExpandedDirectoriesChange).toHaveBeenCalledWith(['docs', 'docs/guides'])

    await user.click(screen.getByRole('button', { name: 'guides' }))

    expect(onExpandedDirectoriesChange).toHaveBeenLastCalledWith(['docs'])
  })

})
