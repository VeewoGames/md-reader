import type { FileTreeNode } from '../workspace/file-tree-types'

interface WorkspaceLayoutProps {
  fileTree: FileTreeNode[]
  currentDocumentPath: string | null
  statusMessage: string | null
  hasProjects: boolean
  onDocumentSelect: (path: string) => void
}

function FileTreeBranch({
  nodes,
  currentDocumentPath,
  onDocumentSelect,
}: {
  nodes: FileTreeNode[]
  currentDocumentPath: string | null
  onDocumentSelect: (path: string) => void
}) {
  return (
    <ul className="file-tree">
      {nodes.map((node) => (
        <li key={node.id} className="file-tree__item">
          {node.kind === 'directory' ? (
            <>
              <div className="file-tree__directory">{node.name}</div>
              <FileTreeBranch
                nodes={node.children}
                currentDocumentPath={currentDocumentPath}
                onDocumentSelect={onDocumentSelect}
              />
            </>
          ) : (
            <button
              type="button"
              className="file-tree__file"
              aria-current={currentDocumentPath === node.path ? 'page' : undefined}
              onClick={() => onDocumentSelect(node.path)}
            >
              {node.name}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

export function WorkspaceLayout({
  fileTree,
  currentDocumentPath,
  statusMessage,
  hasProjects,
  onDocumentSelect,
}: WorkspaceLayoutProps) {
  return (
    <main className="workspace">
      <aside className="workspace__sidebar workspace__sidebar--left">
        <div className="panel">
          <div className="panel__header">文件列表</div>
          {fileTree.length > 0 ? (
            <FileTreeBranch
              nodes={fileTree}
              currentDocumentPath={currentDocumentPath}
              onDocumentSelect={onDocumentSelect}
            />
          ) : (
            <p className="panel__empty">
              {hasProjects ? '当前项目还没有可用的 Markdown 文件' : '还没有接入任何 Markdown 项目'}
            </p>
          )}
        </div>
      </aside>

      <section className="workspace__center">
        <div className="panel panel--canvas">
          <div className="panel__header">文档工作区</div>
          <div className="workspace__empty-state">
            <h1>纯浏览器 Markdown 工作区</h1>
            <p>
              当前阶段先打通项目接入、文件树与三栏壳层。阅读器、编辑器、右侧标题导航会在后续阶段接入。
            </p>
            {statusMessage ? <div className="workspace__status">{statusMessage}</div> : null}
          </div>
        </div>
      </section>

      <aside className="workspace__sidebar workspace__sidebar--right">
        <div className="panel">
          <div className="panel__header">标题导航</div>
          <p className="panel__empty">当前阶段先保留右侧挂载位，后续接入基于 Markdown 标题的导航树。</p>
        </div>
      </aside>
    </main>
  )
}
