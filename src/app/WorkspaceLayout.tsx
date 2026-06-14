import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react'

import { findActiveHeadingId, type HeadingTarget } from './outline-active-heading'
import { VisualMarkdownEditor } from '../editor/visual-markdown-editor'
import { ReadonlyMarkdownRenderer } from '../document-renderer/readonly-markdown-renderer'
import {
  extractMarkdownHeadings,
  type MarkdownHeading,
} from '../markdown/heading-outline'
import type { FileTreeNode } from '../workspace/file-tree-types'
import type { RegularViewState, WorkspaceMode } from './TopBar'

interface WorkspaceLayoutProps {
  mode: WorkspaceMode
  regularViewState: RegularViewState
  fileTree: FileTreeNode[]
  currentDocumentPath: string | null
  currentDocumentContent: string | null
  editingDocumentContent?: string | null
  isDocumentLoading?: boolean
  statusMessage: string | null
  sidebarWidth: number
  outlineWidth: number
  hasProjects: boolean
  onDocumentSelect: (path: string) => void
  onEditingDocumentContentChange?: (content: string) => void
  onEditingCompositionStart?: () => void
  onEditingCompositionEnd?: () => void
  onSidebarWidthChange: (width: number) => void
  onSidebarWidthCommit: (width: number) => void | Promise<void>
  onOutlineWidthChange: (width: number) => void
  onOutlineWidthCommit: (width: number) => void | Promise<void>
}

function FileTreeBranch({
  nodes,
  level,
  currentDocumentPath,
  expandedDirectories,
  forcedExpandedDirectories,
  collapsedForcedDirectories,
  onToggleDirectory,
  onDocumentSelect,
}: {
  nodes: FileTreeNode[]
  level: number
  currentDocumentPath: string | null
  expandedDirectories: Set<string>
  forcedExpandedDirectories: Set<string>
  collapsedForcedDirectories: Set<string>
  onToggleDirectory: (path: string) => void
  onDocumentSelect: (path: string) => void
}) {
  return (
    <ul className="file-tree" data-level={level}>
      {nodes.map((node) => (
        <li key={node.id} className="file-tree__item">
          {node.kind === 'directory' ? (
            (() => {
              const isForcedExpanded = forcedExpandedDirectories.has(node.path)
              const isExpanded =
                expandedDirectories.has(node.path) ||
                (isForcedExpanded && !collapsedForcedDirectories.has(node.path))
              const isCurrentBranch =
                currentDocumentPath != null &&
                (currentDocumentPath === node.path || currentDocumentPath.startsWith(`${node.path}/`))

              return (
                <>
                  <button
                    type="button"
                    className="file-tree__directory"
                    aria-expanded={isExpanded}
                    data-current-branch={isCurrentBranch ? 'true' : undefined}
                    onClick={() => onToggleDirectory(node.path)}
                  >
                    <span className="file-tree__chevron" aria-hidden="true" />
                    <span className="file-tree__directory-name">{node.name}</span>
                  </button>

                  {isExpanded ? (
                    <div className="file-tree__children">
                      <FileTreeBranch
                        nodes={node.children}
                        level={level + 1}
                        currentDocumentPath={currentDocumentPath}
                        expandedDirectories={expandedDirectories}
                        forcedExpandedDirectories={forcedExpandedDirectories}
                        collapsedForcedDirectories={collapsedForcedDirectories}
                        onToggleDirectory={onToggleDirectory}
                        onDocumentSelect={onDocumentSelect}
                      />
                    </div>
                  ) : null}
                </>
              )
            })()
          ) : (
            <button
              type="button"
              className="file-tree__file"
              aria-current={currentDocumentPath === node.path ? 'page' : undefined}
              onClick={() => onDocumentSelect(node.path)}
            >
              <span className="file-tree__file-icon" aria-hidden="true">
                <svg viewBox="0 0 12 12" focusable="false">
                  <path
                    d="M1.7142857142857142 7.714491428571428v-6h6v6H1.7142857142857142ZM1.7142857142857142 0.4287805714285714c-0.7100828571428571 0 -1.2857142857142856 0.5756365714285714 -1.2857142857142856 1.2857108571428573v6c0 0.7100828571428571 0.5756314285714286 1.28568 1.2857142857142856 1.28568h6c0.7100828571428571 0 1.2857142857142856 -0.5755971428571428 1.2857142857142856 -1.28568v-6c0 -0.7100742857142858 -0.5756314285714286 -1.2857108571428573 -1.2857142857142856 -1.2857108571428573H1.7142857142857142ZM3 10.285885714285714v-0.21428571428571427H7.7142857142857135c1.3018285714285713 0 2.357142857142857 -1.0553142857142856 2.357142857142857 -2.3571085714285713v-4.714285714285714H10.285714285714285c0.7100571428571428 0 1.2857142857142856 0.5756399999999999 1.2857142857142856 1.2857142857142856v5.999965714285714c0 0.7101428571428571 -0.5756571428571428 1.2857142857142856 -1.2857142857142856 1.2857142857142856H4.285714285714286c-0.7100828571428571 0 -1.2857142857142856 -0.5755714285714285 -1.2857142857142856 -1.2857142857142856Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <span className="file-tree__file-name">{node.name}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

export function WorkspaceLayout({
  mode,
  regularViewState,
  fileTree,
  currentDocumentPath,
  currentDocumentContent,
  editingDocumentContent,
  isDocumentLoading,
  statusMessage,
  sidebarWidth,
  outlineWidth,
  hasProjects,
  onDocumentSelect,
  onEditingDocumentContentChange,
  onEditingCompositionStart,
  onEditingCompositionEnd,
  onSidebarWidthChange,
  onSidebarWidthCommit,
  onOutlineWidthChange,
  onOutlineWidthCommit,
}: WorkspaceLayoutProps) {
  const documentTitle = currentDocumentPath?.split('/').at(-1) ?? null
  const activeDocumentContent =
    mode === 'split' ? (editingDocumentContent ?? currentDocumentContent) : currentDocumentContent
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(new Set())
  const [collapsedForcedDirectories, setCollapsedForcedDirectories] = useState<Set<string>>(new Set())
  const [documentHeadings, setDocumentHeadings] = useState<MarkdownHeading[]>([])
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const documentRef = useRef<HTMLElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const outlineRef = useRef<HTMLDivElement | null>(null)
  const forcedExpandedDirectories = new Set<string>()
  const minSidebarWidth = 220
  const maxSidebarWidth = 520
  const minOutlineWidth = 220
  const maxOutlineWidth = 420

  if (currentDocumentPath) {
    const segments = currentDocumentPath.split('/').filter(Boolean)

    for (let index = 0; index < segments.length - 1; index += 1) {
      forcedExpandedDirectories.add(segments.slice(0, index + 1).join('/'))
    }
  }

  useEffect(() => {
    setExpandedDirectories((previous) => {
      const next = new Set(previous)

      for (const node of fileTree) {
        if (node.kind === 'directory') {
          next.add(node.path)
        }
      }

      return next
    })
  }, [fileTree])

  useEffect(() => {
    setCollapsedForcedDirectories(new Set())
  }, [currentDocumentPath])

  useEffect(() => {
    if (!activeDocumentContent) {
      setDocumentHeadings([])
      setActiveHeadingId(null)
      return
    }

    const nextHeadings = extractMarkdownHeadings(activeDocumentContent)
    setDocumentHeadings(nextHeadings)
    setActiveHeadingId(nextHeadings[0]?.id ?? null)
  }, [activeDocumentContent])

  useEffect(() => {
    function syncActiveHeadingSnapshot() {
      const headingTargets = Array.from(
        documentRef.current?.querySelectorAll<HTMLElement>('[data-heading-id]') ?? [],
      )
        .map((element) => {
          const id = element.dataset.headingId
          return id ? { element, id } : null
        })
        .filter((target): target is HeadingTarget => target != null)

      if (headingTargets.length === 0) {
        setActiveHeadingId(documentHeadings[0]?.id ?? null)
        return
      }

      const canvasTop = canvasRef.current?.getBoundingClientRect().top ?? 0
      const anchorTop = canvasTop + 24
      setActiveHeadingId(findActiveHeadingId(headingTargets, anchorTop))
    }

    function applyHeadingIds() {
      const headingElements = Array.from(
        documentRef.current?.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6') ?? [],
      )

      headingElements.forEach((element, index) => {
        const heading = documentHeadings[index]

        if (!heading) {
          element.removeAttribute('data-heading-id')
          return
        }

        element.dataset.headingId = heading.id
        element.id = heading.id
      })
    }

    applyHeadingIds()
    syncActiveHeadingSnapshot()

    const root = documentRef.current

    if (!root) {
      return
    }

    if (mode === 'regular') {
      let frameId = 0
      let attempts = 0

      const resyncEditHeadings = () => {
        frameId = 0
        attempts += 1
        applyHeadingIds()
        syncActiveHeadingSnapshot()

        const headingCount =
          documentRef.current?.querySelectorAll<HTMLElement>('[data-heading-id]').length ?? 0

        if (headingCount === 0 && attempts < 12) {
          frameId = window.requestAnimationFrame(resyncEditHeadings)
        }
      }

      frameId = window.requestAnimationFrame(resyncEditHeadings)

      return () => {
        if (frameId !== 0) {
          window.cancelAnimationFrame(frameId)
        }
      }
    }

    const observer = new MutationObserver(() => {
      applyHeadingIds()
      syncActiveHeadingSnapshot()
    })

    observer.observe(root, {
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
    }
  }, [documentHeadings, mode, activeDocumentContent])

  function getHeadingTargets(): HeadingTarget[] {
    return Array.from(
      documentRef.current?.querySelectorAll<HTMLElement>('[data-heading-id]') ?? [],
    )
      .map((element) => {
        const id = element.dataset.headingId
        return id ? { element, id } : null
      })
      .filter((target): target is HeadingTarget => target != null)
  }

  const syncActiveHeading = useEffectEvent(() => {
    const headingTargets = getHeadingTargets()

    if (headingTargets.length === 0) {
      setActiveHeadingId(null)
      return
    }

    const canvasTop = canvasRef.current?.getBoundingClientRect().top ?? 0
    const anchorTop = canvasTop + 24
    setActiveHeadingId(findActiveHeadingId(headingTargets, anchorTop))
  })

  useEffect(() => {
    if (documentHeadings.length === 0) {
      return
    }

    syncActiveHeading()

    function handleScroll() {
      syncActiveHeading()
    }

    canvasRef.current?.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)

    return () => {
      canvasRef.current?.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [documentHeadings, syncActiveHeading])

  useEffect(() => {
    if (!activeHeadingId) {
      return
    }

    outlineRef.current
      ?.querySelector<HTMLElement>(`[data-outline-id="${activeHeadingId}"]`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [activeHeadingId])

  function handleToggleDirectory(path: string) {
    if (forcedExpandedDirectories.has(path)) {
      setCollapsedForcedDirectories((previous) => {
        const next = new Set(previous)

        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
        }

        return next
      })
      return
    }

    setExpandedDirectories((previous) => {
      const next = new Set(previous)

      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }

      return next
    })
  }

  function handleHeadingSelect(headingId: string) {
    setActiveHeadingId(headingId)
    getHeadingTargets()
      .find((target) => target.id === headingId)
      ?.element.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  function clampSidebarWidth(nextWidth: number) {
    return Math.max(minSidebarWidth, Math.min(maxSidebarWidth, Math.round(nextWidth)))
  }

  function clampOutlineWidth(nextWidth: number) {
    return Math.max(minOutlineWidth, Math.min(maxOutlineWidth, Math.round(nextWidth)))
  }

  function beginSidebarResize(startEvent: React.PointerEvent<HTMLDivElement>) {
    startEvent.preventDefault()

    const startX = startEvent.clientX
    const startWidth = sidebarWidth
    let latestWidth = startWidth

    document.body.classList.add('is-resizing-workspace-pane')

    const handlePointerMove = (moveEvent: PointerEvent) => {
      latestWidth = clampSidebarWidth(startWidth + moveEvent.clientX - startX)
      onSidebarWidthChange(latestWidth)
    }

    const finishResize = () => {
      document.body.classList.remove('is-resizing-workspace-pane')
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      void onSidebarWidthCommit(latestWidth)
    }

    const handlePointerUp = () => {
      finishResize()
    }

    const handlePointerCancel = () => {
      finishResize()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
  }

  function beginOutlineResize(startEvent: React.PointerEvent<HTMLDivElement>) {
    startEvent.preventDefault()

    const startX = startEvent.clientX
    const startWidth = outlineWidth
    let latestWidth = startWidth

    document.body.classList.add('is-resizing-workspace-pane')

    const handlePointerMove = (moveEvent: PointerEvent) => {
      latestWidth = clampOutlineWidth(startWidth - (moveEvent.clientX - startX))
      onOutlineWidthChange(latestWidth)
    }

    const finishResize = () => {
      document.body.classList.remove('is-resizing-workspace-pane')
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      void onOutlineWidthCommit(latestWidth)
    }

    const handlePointerUp = () => {
      finishResize()
    }

    const handlePointerCancel = () => {
      finishResize()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
  }

  function renderDocumentPreview(content: string) {
    return (
      <article
        ref={(node) => {
          documentRef.current = node
        }}
        className="markdown-document markdown-document--milkdown-probe"
      >
        <ReadonlyMarkdownRenderer value={content} />
      </article>
    )
  }

  function renderDocumentWorkspace() {
    if (isDocumentLoading) {
      return <div className="workspace__status">正在读取 Markdown 内容…</div>
    }

    if (!activeDocumentContent && mode !== 'split') {
      return <div className="workspace__status">当前文档还没有可用内容</div>
    }

    if (mode === 'regular') {
      return (
        <div className="workspace__document-workarea">
          <div
            ref={(node) => {
              documentRef.current = node
            }}
            className="workspace__editor-pane"
          >
            <VisualMarkdownEditor
              value={editingDocumentContent ?? currentDocumentContent ?? ''}
              readonly={regularViewState !== 'editable'}
              onChange={(content) => onEditingDocumentContentChange?.(content)}
              onCompositionStart={onEditingCompositionStart}
              onCompositionEnd={onEditingCompositionEnd}
            />
          </div>
        </div>
      )
    }

    if (mode === 'split') {
      return (
        <div className="workspace__document-workarea">
          <div className="workspace__split">
            <div className="workspace__split-pane workspace__editor-pane">
              <textarea
                className="markdown-editor markdown-editor--split"
                aria-label="Markdown 编辑器"
                value={editingDocumentContent ?? currentDocumentContent ?? ''}
                onChange={(event) => onEditingDocumentContentChange?.(event.target.value)}
              />
            </div>
            <div className="workspace__split-pane workspace__split-preview">
              {activeDocumentContent ? (
                renderDocumentPreview(activeDocumentContent)
              ) : (
                <div className="workspace__status">当前文档还没有可用内容</div>
              )}
            </div>
          </div>
        </div>
      )
    }

    return <div className="workspace__status">当前文档还没有可用内容</div>
  }

  return (
    <main
      className="workspace"
      style={
        {
          '--workspace-sidebar-width': `${sidebarWidth}px`,
          '--workspace-outline-width': `${outlineWidth}px`,
        } as CSSProperties
      }
    >
      <aside className="workspace__sidebar workspace__sidebar--left">
        <div id="workspace-file-tree" className="panel panel--sidebar">
          <div className="panel__header">文件列表</div>
          <div className="panel__content panel__content--tree">
            {fileTree.length > 0 ? (
              <FileTreeBranch
                nodes={fileTree}
                level={0}
                currentDocumentPath={currentDocumentPath}
                expandedDirectories={expandedDirectories}
                forcedExpandedDirectories={forcedExpandedDirectories}
                collapsedForcedDirectories={collapsedForcedDirectories}
                onToggleDirectory={handleToggleDirectory}
                onDocumentSelect={onDocumentSelect}
              />
            ) : (
              <p className="panel__empty">
                {hasProjects ? '当前项目还没有可用的 Markdown 文件' : '还没有接入任何 Markdown 项目'}
              </p>
            )}
          </div>
        </div>
      </aside>

      <div
        role="separator"
        aria-label="调整左侧文件列表宽度"
        aria-controls="workspace-file-tree"
        aria-orientation="vertical"
        aria-valuemin={minSidebarWidth}
        aria-valuemax={maxSidebarWidth}
        aria-valuenow={sidebarWidth}
        className="workspace__resize-handle"
        onPointerDown={beginSidebarResize}
      />

      <section className="workspace__center">
        <div className="panel panel--canvas">
          <div className="panel__header">文档工作区</div>
          <div ref={canvasRef} className="panel__content panel__content--canvas">
            {currentDocumentPath ? (
              <div className="workspace__document">
                <div className="workspace__document-meta">
                  <strong>{documentTitle}</strong>
                  <span>{currentDocumentPath}</span>
                </div>
                {renderDocumentWorkspace()}
              </div>
            ) : (
              <div className="workspace__empty-state">
                <h1>本地服务 Markdown 工作区</h1>
                <p>
                  当前阶段先打通项目接入、文件树、常规视图、分栏、标题导航、搜索和状态恢复。
                </p>
                {statusMessage ? <div className="workspace__status">{statusMessage}</div> : null}
              </div>
            )}
          </div>
        </div>
      </section>

      <div
        role="separator"
        aria-label="调整右侧标题导航宽度"
        aria-controls="workspace-outline"
        aria-orientation="vertical"
        aria-valuemin={minOutlineWidth}
        aria-valuemax={maxOutlineWidth}
        aria-valuenow={outlineWidth}
        className="workspace__resize-handle workspace__resize-handle--outline"
        onPointerDown={beginOutlineResize}
      />

      <aside className="workspace__sidebar workspace__sidebar--right">
        <div id="workspace-outline" ref={outlineRef} className="panel panel--outline">
          <div className="panel__header">标题导航</div>
          <div className="panel__content panel__content--outline">
            {!currentDocumentPath ? (
              <p className="panel__empty">打开 Markdown 文档后，这里会基于标题节点生成快捷导航。</p>
            ) : isDocumentLoading ? (
              <p className="panel__empty">正在生成标题导航…</p>
            ) : documentHeadings.length > 0 ? (
              <nav className="outline-nav" aria-label="文档标题导航">
                {documentHeadings.map((heading) => (
                  <button
                    key={heading.id}
                    type="button"
                    className="outline-nav__item"
                    aria-current={activeHeadingId === heading.id ? 'location' : undefined}
                    data-outline-id={heading.id}
                    style={{ '--outline-level': heading.depth } as CSSProperties}
                    onClick={() => handleHeadingSelect(heading.id)}
                  >
                    {heading.text}
                  </button>
                ))}
              </nav>
            ) : (
              <p className="panel__empty">当前文档没有可用标题节点。</p>
            )}
          </div>
        </div>
      </aside>
    </main>
  )
}
