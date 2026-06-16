import type { FileTreeDirectoryNode, FileTreeNode } from './file-tree-types'

export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeDirectoryNode = {
    id: '__root__',
    kind: 'directory',
    name: '__root__',
    path: '',
    children: [],
  }

  for (const path of paths) {
    const segments = path.split('/').filter(Boolean)
    let current = root

    for (const [index, segment] of segments.entries()) {
      const nextPath = segments.slice(0, index + 1).join('/')
      const isFile = index === segments.length - 1
      const existing = current.children.find((child) => child.path === nextPath)

      if (existing && existing.kind === 'directory') {
        current = existing
        continue
      }

      if (existing) {
        continue
      }

      if (isFile) {
        current.children.push({
          id: nextPath,
          kind: 'file',
          name: segment,
          path: nextPath,
        })
        continue
      }

      const directory: FileTreeDirectoryNode = {
        id: nextPath,
        kind: 'directory',
        name: segment,
        path: nextPath,
        children: [],
      }

      current.children.push(directory)
      current = directory
    }
  }

  return root.children
}

export function filterFileTree(nodes: FileTreeNode[], query: string): FileTreeNode[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  if (normalizedQuery.length === 0) {
    return nodes
  }

  return nodes.flatMap((node) => {
    const matchesNode =
      node.name.toLocaleLowerCase().includes(normalizedQuery) ||
      node.path.toLocaleLowerCase().includes(normalizedQuery)

    if (node.kind === 'file') {
      return matchesNode ? [node] : []
    }

    const filteredChildren = matchesNode ? node.children : filterFileTree(node.children, normalizedQuery)

    if (filteredChildren.length === 0) {
      return []
    }

    return [
      {
        ...node,
        children: filteredChildren,
      } satisfies FileTreeDirectoryNode,
    ]
  })
}
