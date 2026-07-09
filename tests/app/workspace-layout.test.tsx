import { StrictMode, useEffect, useState } from 'react'
import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import { buildFileTree, createVisibleFileTree } from '../../src/workspace/file-tree'

function createVisibleTree(paths: string[], hiddenPaths: string[] = [], showHiddenItems = false) {
  return createVisibleFileTree({
    sourceNodes: buildFileTree(paths),
    hiddenPaths,
    showHiddenItems,
  }).visibleNodes
}

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

  it('aligns outline navigation clicks to the document anchor in locked mode', async () => {
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
    const canvasPanel = document.querySelector('.panel__content--canvas') as HTMLDivElement | null
    const scrollTo = vi.fn()

    expect(canvasPanel).not.toBeNull()

    Object.defineProperty(canvasPanel as HTMLDivElement, 'scrollTop', {
      configurable: true,
      value: 180,
      writable: true,
    })
    Object.defineProperty(canvasPanel as HTMLDivElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100 }),
    })
    Object.defineProperty(canvasPanel as HTMLDivElement, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    Object.defineProperty(heading, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 356 }),
    })

    await user.click(screen.getByRole('button', { name: '提交信息格式' }))

    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 412 })
  })

  it('reapplies heading targets after a late regular-mode DOM replacement', async () => {
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
    const canvasPanel = document.querySelector('.panel__content--canvas') as HTMLDivElement | null
    const scrollTo = vi.fn()

    expect(canvasPanel).not.toBeNull()

    const originalHeading = await screen.findByRole('heading', { name: '提交信息格式' })

    await waitFor(() => {
      expect(originalHeading).toHaveAttribute('data-heading-id', '提交信息格式')
    })

    const replacementHeading = originalHeading.cloneNode(true) as HTMLElement
    replacementHeading.removeAttribute('data-heading-id')
    replacementHeading.removeAttribute('id')
    originalHeading.replaceWith(replacementHeading)

    Object.defineProperty(canvasPanel as HTMLDivElement, 'scrollTop', {
      configurable: true,
      value: 180,
      writable: true,
    })
    Object.defineProperty(canvasPanel as HTMLDivElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100 }),
    })
    Object.defineProperty(canvasPanel as HTMLDivElement, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    Object.defineProperty(replacementHeading, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 356 }),
    })

    await waitFor(() => {
      expect(replacementHeading).toHaveAttribute('data-heading-id', '提交信息格式')
    })

    await user.click(screen.getByRole('button', { name: '提交信息格式' }))

    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 412 })
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

  it('aligns outline navigation clicks to the document anchor in regular editable mode', async () => {
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
    const canvasPanel = document.querySelector('.panel__content--canvas') as HTMLDivElement | null
    const scrollTo = vi.fn()

    expect(canvasPanel).not.toBeNull()

    await waitFor(() => {
      expect(heading).toHaveAttribute('data-heading-id', '提交信息格式')
    })

    Object.defineProperty(canvasPanel as HTMLDivElement, 'scrollTop', {
      configurable: true,
      value: 240,
      writable: true,
    })
    Object.defineProperty(canvasPanel as HTMLDivElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 120 }),
    })
    Object.defineProperty(canvasPanel as HTMLDivElement, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    Object.defineProperty(heading, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 402 }),
    })

    await user.click(screen.getByRole('button', { name: '提交信息格式' }))

    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 498 })
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

  it('attaches a mutation observer to the editor pane in regular mode', async () => {
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

    expect(observedEditorPane).toBe(true)
  })

  it('reapplies heading targets when a later non-heading mutation leaves headings without ids', async () => {
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

    const heading = await screen.findByRole('heading', { name: '提交信息格式' })
    const paragraph = screen.getByText('内容')

    await waitFor(() => {
      expect(heading).toHaveAttribute('data-heading-id', '提交信息格式')
    })

    heading.removeAttribute('data-heading-id')
    heading.removeAttribute('id')
    paragraph.textContent = '内容更新'

    await waitFor(() => {
      expect(heading).toHaveAttribute('data-heading-id', '提交信息格式')
    })
  })

  it('keeps outline targeting stable when the editor rewrites heading ids', async () => {
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
    const canvasPanel = document.querySelector('.panel__content--canvas') as HTMLDivElement | null
    const scrollTo = vi.fn()

    expect(canvasPanel).not.toBeNull()

    await waitFor(() => {
      expect(heading).toHaveAttribute('data-heading-id', '提交信息格式')
    })

    heading.removeAttribute('data-heading-id')
    heading.id = '编辑器自己的标题-id'

    Object.defineProperty(canvasPanel as HTMLDivElement, 'scrollTop', {
      configurable: true,
      value: 240,
      writable: true,
    })
    Object.defineProperty(canvasPanel as HTMLDivElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 120 }),
    })
    Object.defineProperty(canvasPanel as HTMLDivElement, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    Object.defineProperty(heading, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 402 }),
    })

    await user.click(screen.getByRole('button', { name: '提交信息格式' }))

    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 498 })
  })

  it('filters file tree entries from the sidebar search box and still opens matched files', async () => {
    const user = userEvent.setup()
    const onDocumentSelect = vi.fn()

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={createVisibleTree(['docs/guide.md', 'docs/api/reference.md', 'notes/meeting.md'])}
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
        fileTree={createVisibleTree(['docs/guide.md'])}
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
        fileTree={createVisibleTree(['docs/guides/guide.md', 'notes/todo.md'])}
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
        fileTree={createVisibleTree(['docs/guides/guide.md'])}
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

  it('renames a document inline from the context menu without using a browser prompt', async () => {
    const user = userEvent.setup()
    const onRenameDocument = vi.fn().mockResolvedValue(true)

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={createVisibleTree(['docs/guide.md'])}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onRenameDocument={onRenameDocument}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: 'guide.md' }))
    await user.click(screen.getByRole('menuitem', { name: '重命名' }))

    const renameInput = screen.getByRole('textbox', { name: '重命名 guide.md' })

    expect(renameInput).toHaveValue('guide.md')

    fireEvent.change(renameInput, { target: { value: 'guide-v2.md' } })
    await user.keyboard('{Enter}')

    expect(onRenameDocument).toHaveBeenCalledWith('docs/guide.md', 'guide-v2.md')
    expect(screen.queryByRole('textbox', { name: '重命名 guide.md' })).not.toBeInTheDocument()
  })

  it('cancels inline rename with Escape', async () => {
    const user = userEvent.setup()
    const onRenameDocument = vi.fn()

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={createVisibleTree(['docs/guide.md'])}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onRenameDocument={onRenameDocument}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: 'guide.md' }))
    await user.click(screen.getByRole('menuitem', { name: '重命名' }))

    const renameInput = screen.getByRole('textbox', { name: '重命名 guide.md' })
    await user.keyboard('{Escape}')

    expect(onRenameDocument).not.toHaveBeenCalled()
    expect(renameInput).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'guide.md' })).toBeInTheDocument()
  })

  it('creates a duplicate immediately from the context menu without opening inline rename UI', async () => {
    const user = userEvent.setup()
    const onDuplicateDocument = vi.fn().mockResolvedValue(true)

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={createVisibleTree(['docs/guide.md'])}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onDuplicateDocument={onDuplicateDocument}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: 'guide.md' }))
    await user.click(screen.getByRole('menuitem', { name: '创建副本' }))

    expect(onDuplicateDocument).toHaveBeenCalledWith('docs/guide.md', 'guide-副本.md')
    expect(screen.queryByRole('textbox', { name: '创建副本 guide.md' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'guide.md' })).toBeInTheDocument()
  })

  it('increments the default duplicate name when the first copy name already exists', async () => {
    const user = userEvent.setup()
    const onDuplicateDocument = vi.fn().mockResolvedValue(true)

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={createVisibleTree(['docs/guide.md', 'docs/guide-副本.md'])}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onDuplicateDocument={onDuplicateDocument}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: 'guide.md' }))
    await user.click(screen.getByRole('menuitem', { name: '创建副本' }))

    expect(onDuplicateDocument).toHaveBeenCalledWith('docs/guide.md', 'guide-副本-2.md')
  })

  it('moves a dragged document into a directory drop target', async () => {
    const onMoveDocument = vi.fn()
    const dataTransfer = {
      effectAllowed: 'all',
      dropEffect: 'none',
      setData: vi.fn(),
      getData: vi.fn(),
    }

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={createVisibleTree(['docs/guides/guide.md', 'docs/archive/old.md'])}
        currentDocumentPath="docs/guides/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onMoveDocument={onMoveDocument}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    const guideButton = screen.getByRole('button', { name: 'guide.md' })
    const archiveButton = screen.getByRole('button', { name: 'archive' })
    const archiveRow = archiveButton.closest('.file-tree__row')
    const fileTreeRoot = archiveButton.closest('.file-tree')

    expect(archiveRow).not.toBeNull()
    expect(fileTreeRoot).not.toBeNull()

    fireEvent.dragStart(guideButton, { dataTransfer })
    expect(fileTreeRoot).toHaveAttribute('data-drag-active', 'true')
    fireEvent.dragOver(archiveButton, { dataTransfer })
    expect(archiveRow).toHaveAttribute('data-drop-target', 'true')
    fireEvent.drop(archiveButton, { dataTransfer })

    expect(onMoveDocument).toHaveBeenCalledWith('docs/guides/guide.md', 'docs/archive')
    expect(onMoveDocument).toHaveBeenCalledTimes(1)
    expect(archiveRow).not.toHaveAttribute('data-drop-target')
    expect(fileTreeRoot).not.toHaveAttribute('data-drag-active')
  })

  it('reorders sibling files when dragging over the upper half of a row', async () => {
    const onReorderFileTreeNode = vi.fn()
    const dragStore = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: 'all',
      dropEffect: 'none',
      setData: vi.fn((type: string, value: string) => {
        dragStore.set(type, value)
      }),
      getData: vi.fn((type: string) => dragStore.get(type) ?? ''),
    }

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={createVisibleTree(['docs/guide.md', 'docs/reference.md'])}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onReorderFileTreeNode={onReorderFileTreeNode}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    const guideButton = screen.getByRole('button', { name: 'guide.md' })
    const referenceRow = screen.getByRole('button', { name: 'reference.md' }).closest('.file-tree__row')

    expect(referenceRow).not.toBeNull()

    Object.defineProperty(referenceRow as HTMLDivElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100, height: 40 }),
    })

    fireEvent.dragStart(guideButton, { dataTransfer })
    const reorderOverEvent = createEvent.dragOver(referenceRow as HTMLDivElement)
    Object.defineProperties(reorderOverEvent, {
      clientY: { value: 108 },
      dataTransfer: { value: dataTransfer },
    })
    fireEvent(referenceRow as HTMLDivElement, reorderOverEvent)
    expect(referenceRow).toHaveAttribute('data-reorder-target', 'before')

    const reorderDropEvent = createEvent.drop(referenceRow as HTMLDivElement)
    Object.defineProperties(reorderDropEvent, {
      clientY: { value: 108 },
      dataTransfer: { value: dataTransfer },
    })
    fireEvent(referenceRow as HTMLDivElement, reorderDropEvent)

    await waitFor(() => {
      expect(onReorderFileTreeNode).toHaveBeenCalledWith({
        sourcePath: 'docs/guide.md',
        sourceParentPath: 'docs',
        targetPath: 'docs/reference.md',
        targetParentPath: 'docs',
        position: 'before',
      })
    })
  })

  it('treats the full file row as a sortable insert target instead of requiring a narrow edge band', async () => {
    const onReorderFileTreeNode = vi.fn()
    const dragStore = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: 'all',
      dropEffect: 'none',
      setData: vi.fn((type: string, value: string) => {
        dragStore.set(type, value)
      }),
      getData: vi.fn((type: string) => dragStore.get(type) ?? ''),
    }

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={createVisibleTree(['docs/guide.md', 'docs/reference.md'])}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onReorderFileTreeNode={onReorderFileTreeNode}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    const guideButton = screen.getByRole('button', { name: 'guide.md' })
    const referenceRow = screen.getByRole('button', { name: 'reference.md' }).closest('.file-tree__row')

    expect(referenceRow).not.toBeNull()

    Object.defineProperty(referenceRow as HTMLDivElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100, height: 40 }),
    })

    fireEvent.dragStart(guideButton, { dataTransfer })
    const reorderOverEvent = createEvent.dragOver(referenceRow as HTMLDivElement)
    Object.defineProperties(reorderOverEvent, {
      clientY: { value: 120 },
      dataTransfer: { value: dataTransfer },
    })
    fireEvent(referenceRow as HTMLDivElement, reorderOverEvent)

    expect(referenceRow).toHaveAttribute('data-reorder-target', 'after')

    const reorderDropEvent = createEvent.drop(referenceRow as HTMLDivElement)
    Object.defineProperties(reorderDropEvent, {
      clientY: { value: 120 },
      dataTransfer: { value: dataTransfer },
    })
    fireEvent(referenceRow as HTMLDivElement, reorderDropEvent)

    await waitFor(() => {
      expect(onReorderFileTreeNode).toHaveBeenCalledWith({
        sourcePath: 'docs/guide.md',
        sourceParentPath: 'docs',
        targetPath: 'docs/reference.md',
        targetParentPath: 'docs',
        position: 'after',
      })
    })
  })

  it('reorders root directories and supports full-row drag for folders', async () => {
    const onReorderFileTreeNode = vi.fn()
    const dragStore = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: 'all',
      dropEffect: 'none',
      setData: vi.fn((type: string, value: string) => {
        dragStore.set(type, value)
      }),
      getData: vi.fn((type: string) => dragStore.get(type) ?? ''),
    }

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={createVisibleTree(['docs/guide.md', 'notes/todo.md'])}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onReorderFileTreeNode={onReorderFileTreeNode}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    const docsRow = screen.getByRole('button', { name: 'docs' }).closest('.file-tree__row')
    const notesRow = screen.getByRole('button', { name: 'notes' }).closest('.file-tree__row')

    expect(docsRow).not.toBeNull()
    expect(notesRow).not.toBeNull()

    Object.defineProperty(notesRow as HTMLDivElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 200, height: 40 }),
    })

    fireEvent.dragStart(docsRow as HTMLDivElement, { dataTransfer })
    const directoryReorderOverEvent = createEvent.dragOver(notesRow as HTMLDivElement)
    Object.defineProperties(directoryReorderOverEvent, {
      clientY: { value: 232 },
      dataTransfer: { value: dataTransfer },
    })
    fireEvent(notesRow as HTMLDivElement, directoryReorderOverEvent)

    const directoryReorderDropEvent = createEvent.drop(notesRow as HTMLDivElement)
    Object.defineProperties(directoryReorderDropEvent, {
      clientY: { value: 232 },
      dataTransfer: { value: dataTransfer },
    })
    fireEvent(notesRow as HTMLDivElement, directoryReorderDropEvent)

    await waitFor(() => {
      expect(onReorderFileTreeNode).toHaveBeenCalledWith({
        sourcePath: 'docs',
        sourceParentPath: null,
        targetPath: 'notes',
        targetParentPath: null,
        position: 'after',
      })
    })
  })

  it('keeps a narrow center band on same-parent directories for real move-to-folder drops', async () => {
    const onMoveDocument = vi.fn()
    const onReorderFileTreeNode = vi.fn()
    const dragStore = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: 'all',
      dropEffect: 'none',
      setData: vi.fn((type: string, value: string) => {
        dragStore.set(type, value)
      }),
      getData: vi.fn((type: string) => dragStore.get(type) ?? ''),
      types: [
        'application/x-md-reader-document-path',
        'application/x-md-reader-tree-node-path',
        'text/plain',
      ],
    }

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={createVisibleTree(['docs/guide.md', 'docs/archive/index.md'])}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onMoveDocument={onMoveDocument}
        onReorderFileTreeNode={onReorderFileTreeNode}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    const guideButton = screen.getByRole('button', { name: 'guide.md' })
    const archiveRow = screen.getByRole('button', { name: 'archive' }).closest('.file-tree__row')

    expect(archiveRow).not.toBeNull()

    Object.defineProperty(archiveRow as HTMLDivElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100, height: 40 }),
    })

    fireEvent.dragStart(guideButton, { dataTransfer })
    const moveOverEvent = createEvent.dragOver(archiveRow as HTMLDivElement)
    Object.defineProperties(moveOverEvent, {
      clientY: { value: 120 },
      dataTransfer: { value: dataTransfer },
    })
    fireEvent(archiveRow as HTMLDivElement, moveOverEvent)

    expect(archiveRow).toHaveAttribute('data-drop-target', 'true')
    expect(archiveRow).not.toHaveAttribute('data-reorder-target')

    const moveDropEvent = createEvent.drop(archiveRow as HTMLDivElement)
    Object.defineProperties(moveDropEvent, {
      clientY: { value: 120 },
      dataTransfer: { value: dataTransfer },
    })
    fireEvent(archiveRow as HTMLDivElement, moveDropEvent)

    await waitFor(() => {
      expect(onMoveDocument).toHaveBeenCalledWith('docs/guide.md', 'docs/archive')
    })
    expect(onReorderFileTreeNode).not.toHaveBeenCalled()
  })

  it('disables tree drag when sidebar filtering is active', async () => {
    const user = userEvent.setup()
    const onReorderFileTreeNode = vi.fn()

    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={createVisibleTree(['docs/guide.md', 'docs/reference.md'])}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        onDocumentSelect={() => {}}
        onReorderFileTreeNode={onReorderFileTreeNode}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    await user.type(screen.getByRole('searchbox', { name: '搜索文件' }), 'ref')

    const referenceButton = screen.getByRole('button', { name: 'reference.md' }) as HTMLButtonElement

    expect(referenceButton.draggable).toBe(false)
  })

  it('disables tree drag when favorites-only mode is active', () => {
    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={createVisibleTree(['docs/guide.md', 'docs/reference.md'])}
        currentDocumentPath="docs/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        sidebarWidth={280}
        outlineWidth={320}
        hasProjects
        favoritePaths={['docs/reference.md']}
        showFavoritesOnly
        onDocumentSelect={() => {}}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    const referenceButton = screen.getByRole('button', { name: 'reference.md' }) as HTMLButtonElement

    expect(referenceButton.draggable).toBe(false)
  })

  it('renders an action toast for immediate file-tree feedback', () => {
    render(
      <WorkspaceLayout
        mode="regular"
        regularViewState="locked"
        fileTree={createVisibleTree(['docs/guides/guide.md'])}
        currentDocumentPath="docs/guides/guide.md"
        currentDocumentContent={'# 标题\n\n正文'}
        statusMessage="当前项目：Notes"
        actionToast={{
          id: 1,
          tone: 'success',
          message: '已移动：docs/guides/guide.md -> docs/archive/guide.md',
        }}
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

    const toast = screen.getByText('操作完成').closest('[role="status"]')

    expect(toast).not.toBeNull()
    expect(toast).toHaveTextContent('已移动：docs/guides/guide.md -> docs/archive/guide.md')
  })

})
