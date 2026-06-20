export interface FileTreeFileNode {
  id: string
  kind: 'file'
  name: string
  path: string
}

export interface FileTreeDirectoryNode {
  id: string
  kind: 'directory'
  name: string
  path: string
  children: FileTreeNode[]
}

export type FileTreeNode = FileTreeFileNode | FileTreeDirectoryNode

export interface FileTreeNodeMeta {
  isExplicitlyHidden: boolean
  isHiddenByAncestor: boolean
  isVisibleInCurrentMode: boolean
}

export interface VisibleFileTreeFileNode extends FileTreeFileNode {
  meta: FileTreeNodeMeta
}

export interface VisibleFileTreeDirectoryNode
  extends Omit<FileTreeDirectoryNode, 'children'> {
  children: VisibleFileTreeNode[]
  meta: FileTreeNodeMeta
}

export type VisibleFileTreeNode = VisibleFileTreeFileNode | VisibleFileTreeDirectoryNode

export interface VisibleFileTreeResult {
  visibleNodes: VisibleFileTreeNode[]
  availableDirectoryPaths: string[]
}
