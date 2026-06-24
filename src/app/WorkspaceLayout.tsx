import { useDeferredValue, useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react'
import { Eye, EyeOff, FileText, Star } from 'lucide-react'

import { findActiveHeadingId, type HeadingTarget } from './outline-active-heading'
import { VisualMarkdownEditor } from '../editor/visual-markdown-editor'
import { ReadonlyMarkdownRenderer } from '../document-renderer/readonly-markdown-renderer'
import {
  extractMarkdownHeadings,
  type MarkdownHeading,
} from '../markdown/heading-outline'
import type { VisibleFileTreeNode } from '../workspace/file-tree-types'
import { filterFileTree } from '../workspace/file-tree'
import type { RegularViewState, WorkspaceMode } from './TopBar'

export function createDefaultExpandedDirectories(
  availableDirectoryPaths: string[],
  currentDocumentPath: string | null,
): Set<string> {
  const next = new Set<string>()

  for (const path of availableDirectoryPaths) {
    if (!path.includes('/')) {
      next.add(path)
    }
  }

  if (!currentDocumentPath) {
    return next
  }

  const segments = currentDocumentPath.split('/').filter(Boolean)

  for (let index = 0; index < segments.length - 1; index += 1) {
    next.add(segments.slice(0, index + 1).join('/'))
  }

  return next
}

export function createInitialExpandedDirectories(
  availableDirectoryPaths: string[],
  currentDocumentPath: string | null,
  persistedExpandedDirectories: string[],
  hasPersistedExpandedDirectories: boolean,
): Set<string> {
  const sourceDirectories = hasPersistedExpandedDirectories
    ? persistedExpandedDirectories
    : [...createDefaultExpandedDirectories(availableDirectoryPaths, currentDocumentPath)]

  const availableDirectories = new Set(availableDirectoryPaths)
  return new Set(sourceDirectories.filter((path) => availableDirectories.has(path)))
}

interface WorkspaceLayoutProps {
  mode: WorkspaceMode
  regularViewState: RegularViewState
  fileTree: VisibleFileTreeNode[]
  availableDirectoryPaths?: string[]
  currentDocumentPath: string | null
  currentDocumentContent: string | null
  editingDocumentContent?: string | null
  isDocumentLoading?: boolean
  statusMessage: string | null
  sidebarWidth: number
  outlineWidth: number
  persistedExpandedDirectories?: string[]
  hasPersistedExpandedDirectories?: boolean
  hasProjects: boolean
  onDocumentSelect: (path: string) => void
  favoritePaths?: string[]
  showFavoritesOnly?: boolean
  showHiddenItems?: boolean
  onToggleFavoriteDocument?: (path: string) => void
  onToggleShowFavoritesOnly?: () => void
  onHidePath?: (path: string) => void
  onUnhidePath?: (path: string) => void
  onExpandedDirectoriesChange?: (paths: string[]) => void | Promise<void>
  onEditingDocumentContentChange?: (content: string) => void
  onEditingCompositionStart?: () => void
  onEditingCompositionEnd?: () => void
  onSidebarWidthChange: (width: number) => void
  onSidebarWidthCommit: (width: number) => void | Promise<void>
  onOutlineWidthChange: (width: number) => void
  onOutlineWidthCommit: (width: number) => void | Promise<void>
}

export function WorkspaceFileTree({
  nodes,
  level,
  searchActive,
  currentDocumentPath,
  expandedDirectories,
  onToggleDirectory,
  onDocumentSelect,
  favoritePaths,
  showHiddenItems,
  onToggleFavoriteDocument,
  onHidePath,
  onUnhidePath,
}: {
  nodes: VisibleFileTreeNode[]
  level: number
  searchActive: boolean
  currentDocumentPath: string | null
  expandedDirectories: Set<string>
  onToggleDirectory: (path: string) => void
  onDocumentSelect: (path: string) => void
  favoritePaths: string[]
  showHiddenItems: boolean
  onToggleFavoriteDocument: (path: string) => void
  onHidePath: (path: string) => void
  onUnhidePath: (path: string) => void
}) {
  return (
    <ul className="file-tree" data-level={level}>
      {nodes.map((node) => (
        <li key={node.id} className="file-tree__item">
          {node.kind === 'directory' ? (
            (() => {
              const isExpanded = searchActive || expandedDirectories.has(node.path)
              const isCurrentBranch =
                currentDocumentPath != null &&
                (currentDocumentPath === node.path || currentDocumentPath.startsWith(`${node.path}/`))
              const isHidden = node.meta.isExplicitlyHidden || node.meta.isHiddenByAncestor
              const canUnhideDirectly = node.meta.isExplicitlyHidden && showHiddenItems
              const shouldShowActionButton = !node.meta.isHiddenByAncestor || node.meta.isExplicitlyHidden

              return (
                <>
                  <div className="file-tree__row" data-hidden={isHidden ? 'true' : undefined}>
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
                    <div className="file-tree__actions">
                      {showHiddenItems && node.meta.isHiddenByAncestor && !node.meta.isExplicitlyHidden ? (
                        <span className="file-tree__derived-hidden-indicator" aria-hidden="true" />
                      ) : null}
                      {shouldShowActionButton ? (
                        <button
                          type="button"
                          className="file-tree__action file-tree__action--visibility"
                          aria-label={canUnhideDirectly ? `显示 ${node.name}` : `隐藏 ${node.name}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (canUnhideDirectly) {
                              onUnhidePath(node.path)
                              return
                            }
                            onHidePath(node.path)
                          }}
                        >
                          {canUnhideDirectly ? <Eye /> : <EyeOff />}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="file-tree__children">
                      <WorkspaceFileTree
                        nodes={node.children}
                        level={level + 1}
                        searchActive={searchActive}
                        currentDocumentPath={currentDocumentPath}
                        expandedDirectories={expandedDirectories}
                        onToggleDirectory={onToggleDirectory}
                        onDocumentSelect={onDocumentSelect}
                        favoritePaths={favoritePaths}
                        showHiddenItems={showHiddenItems}
                        onToggleFavoriteDocument={onToggleFavoriteDocument}
                        onHidePath={onHidePath}
                        onUnhidePath={onUnhidePath}
                      />
                    </div>
                  ) : null}
                </>
              )
            })()
          ) : (() => {
            const isHidden = node.meta.isExplicitlyHidden || node.meta.isHiddenByAncestor
            const canUnhideDirectly = node.meta.isExplicitlyHidden && showHiddenItems
            const shouldShowActionButton = !node.meta.isHiddenByAncestor || node.meta.isExplicitlyHidden
            const isFavorited = favoritePaths.includes(node.path)
            const favoriteIndicatorTestId = `favorite-indicator-${node.path.replaceAll('/', '-')}`

            return (
              <div className="file-tree__row" data-hidden={isHidden ? 'true' : undefined}>
                <button
                  type="button"
                  className="file-tree__file"
                  data-favorited={isFavorited ? 'true' : undefined}
                  aria-current={currentDocumentPath === node.path ? 'page' : undefined}
                  onClick={() => onDocumentSelect(node.path)}
                >
                  <span className="file-tree__file-icon" aria-hidden="true">
                    <FileText />
                  </span>
                  <span className="file-tree__file-name">{node.name}</span>
                </button>
                <div className="file-tree__actions">
                  <button
                    type="button"
                    className="file-tree__action file-tree__action--favorite"
                    data-favorited={isFavorited ? 'true' : undefined}
                    data-testid={favoriteIndicatorTestId}
                    aria-label={isFavorited ? `取消收藏 ${node.name}` : `收藏 ${node.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleFavoriteDocument(node.path)
                    }}
                  >
                    <Star fill={isFavorited ? 'currentColor' : 'none'} />
                  </button>
                  {showHiddenItems && node.meta.isHiddenByAncestor && !node.meta.isExplicitlyHidden ? (
                    <span className="file-tree__derived-hidden-indicator" aria-hidden="true" />
                  ) : null}
                  {shouldShowActionButton ? (
                    <button
                      type="button"
                      className="file-tree__action file-tree__action--visibility"
                      aria-label={canUnhideDirectly ? `显示 ${node.name}` : `隐藏 ${node.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (canUnhideDirectly) {
                          onUnhidePath(node.path)
                          return
                        }
                        onHidePath(node.path)
                      }}
                    >
                      {canUnhideDirectly ? <Eye /> : <EyeOff />}
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })()}
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
  persistedExpandedDirectories = [],
  hasPersistedExpandedDirectories = false,
  availableDirectoryPaths = [],
  hasProjects,
  onDocumentSelect,
  favoritePaths = [],
  showFavoritesOnly = false,
  showHiddenItems = false,
  onToggleFavoriteDocument = () => {},
  onToggleShowFavoritesOnly = () => {},
  onHidePath = () => {},
  onUnhidePath = () => {},
  onExpandedDirectoriesChange,
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
  const [fileSearchQuery, setFileSearchQuery] = useState('')
  const [documentHeadings, setDocumentHeadings] = useState<MarkdownHeading[]>([])
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const documentRef = useRef<HTMLElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const outlineRef = useRef<HTMLDivElement | null>(null)
  const minSidebarWidth = 220
  const maxSidebarWidth = 520
  const minOutlineWidth = 220
  const maxOutlineWidth = 420
  const deferredFileSearchQuery = useDeferredValue(fileSearchQuery)
  const isFilteringFiles = deferredFileSearchQuery.trim().length > 0
  const visibleFileTree = filterFileTree(
    fileTree,
    deferredFileSearchQuery,
  ) as VisibleFileTreeNode[]
  const hasFavorites = favoritePaths.length > 0

  useEffect(() => {
    setExpandedDirectories(
      createInitialExpandedDirectories(
        availableDirectoryPaths,
        currentDocumentPath,
        persistedExpandedDirectories,
        hasPersistedExpandedDirectories,
      ),
    )
  }, [availableDirectoryPaths, currentDocumentPath, persistedExpandedDirectories, hasPersistedExpandedDirectories])

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
    setExpandedDirectories((previous) => {
      const next = new Set(previous)

      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }

      void onExpandedDirectoriesChange?.([...next].sort())
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
          <div className="panel__search panel__search--with-favorites">
            <button
              type="button"
              className="panel__favorite-toggle"
              aria-label="只看收藏文档"
              aria-pressed={showFavoritesOnly}
              onClick={onToggleShowFavoritesOnly}
            >
              <Star fill={showFavoritesOnly ? 'currentColor' : 'none'} />
            </button>
            <input
              type="search"
              className="panel__search-input"
              aria-label="搜索文件"
              placeholder="搜索文件"
              value={fileSearchQuery}
              onChange={(event) => setFileSearchQuery(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="panel__content panel__content--tree">
            {fileTree.length > 0 && visibleFileTree.length > 0 ? (
              <WorkspaceFileTree
                nodes={visibleFileTree}
                level={0}
                searchActive={isFilteringFiles}
                currentDocumentPath={currentDocumentPath}
                expandedDirectories={expandedDirectories}
                onToggleDirectory={handleToggleDirectory}
                onDocumentSelect={onDocumentSelect}
                favoritePaths={favoritePaths}
                showHiddenItems={showHiddenItems}
                onToggleFavoriteDocument={onToggleFavoriteDocument}
                onHidePath={onHidePath}
                onUnhidePath={onUnhidePath}
              />
            ) : isFilteringFiles ? (
              <p className="panel__empty">没有匹配的文件</p>
            ) : showFavoritesOnly && !hasFavorites ? (
              <p className="panel__empty">当前还没有收藏文档</p>
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
