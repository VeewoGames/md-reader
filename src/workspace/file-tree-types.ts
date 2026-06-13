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
