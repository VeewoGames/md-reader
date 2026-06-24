import type {
  FileTreeDirectoryNode,
  FileTreeNode,
  VisibleFileTreeNode,
  VisibleFileTreeResult,
} from './file-tree-types'

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

  return nodes.reduce<FileTreeNode[]>((result, node) => {
    const matchesNode =
      node.name.toLocaleLowerCase().includes(normalizedQuery) ||
      node.path.toLocaleLowerCase().includes(normalizedQuery)

    if (node.kind === 'file') {
      if (matchesNode) {
        result.push(node)
      }
      return result
    }

    const filteredChildren = matchesNode ? node.children : filterFileTree(node.children, normalizedQuery)

    if (filteredChildren.length === 0) {
      return result
    }

    result.push({
        ...node,
        children: filteredChildren,
      } satisfies FileTreeDirectoryNode)
    return result
  }, [])
}

export function filterFileTreeByFavorites(
  nodes: VisibleFileTreeNode[],
  favoritePaths: string[],
): VisibleFileTreeNode[] {
  const favoritePathSet = new Set(favoritePaths)

  function visit(node: VisibleFileTreeNode): VisibleFileTreeNode | null {
    if (node.kind === 'file') {
      return favoritePathSet.has(node.path) ? node : null
    }

    const nextChildren = node.children
      .map(visit)
      .filter((child): child is VisibleFileTreeNode => child != null)

    if (nextChildren.length === 0) {
      return null
    }

    return {
      ...node,
      children: nextChildren,
    }
  }

  return nodes
    .map(visit)
    .filter((node): node is VisibleFileTreeNode => node != null)
}

function listAncestorPaths(path: string): string[] {
  const segments = path.split('/').filter(Boolean)
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'))
}

export function isPathExplicitlyHidden(path: string, hiddenPaths: Set<string>): boolean {
  return hiddenPaths.has(path)
}

export function isPathHiddenByAncestor(path: string, hiddenPaths: Set<string>): boolean {
  return listAncestorPaths(path).some((ancestorPath) => hiddenPaths.has(ancestorPath))
}

export function createVisibleFileTree({
  sourceNodes,
  hiddenPaths,
  showHiddenItems,
}: {
  sourceNodes: FileTreeNode[]
  hiddenPaths: string[]
  showHiddenItems: boolean
}): VisibleFileTreeResult {
  const hiddenPathSet = new Set(hiddenPaths)
  const availableDirectoryPaths = new Set<string>()

  function visit(node: FileTreeNode): VisibleFileTreeNode | null {
    const isExplicitlyHidden = isPathExplicitlyHidden(node.path, hiddenPathSet)
    const isHiddenByAncestor = isPathHiddenByAncestor(node.path, hiddenPathSet)
    const isHidden = isExplicitlyHidden || isHiddenByAncestor
    const isVisibleInCurrentMode = showHiddenItems || !isHidden

    if (node.kind === 'file') {
      if (!isVisibleInCurrentMode) {
        return null
      }

      return {
        ...node,
        meta: {
          isExplicitlyHidden,
          isHiddenByAncestor,
          isVisibleInCurrentMode,
        },
      }
    }

    availableDirectoryPaths.add(node.path)
    const nextChildren = node.children
      .map(visit)
      .filter((child): child is VisibleFileTreeNode => child != null)

    if (!isVisibleInCurrentMode && nextChildren.length === 0) {
      return null
    }

    return {
      ...node,
      children: nextChildren,
      meta: {
        isExplicitlyHidden,
        isHiddenByAncestor,
        isVisibleInCurrentMode,
      },
    }
  }

  const visibleNodes = sourceNodes
    .map(visit)
    .filter((node): node is VisibleFileTreeNode => node != null)

  return {
    visibleNodes,
    availableDirectoryPaths: [...availableDirectoryPaths],
  }
}
