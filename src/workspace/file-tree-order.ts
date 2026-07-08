import type { FileTreeDirectoryNode, FileTreeNode } from './file-tree-types'

export const ROOT_ORDER_KEY = '__root__'

export type ManualNodeOrderByParent = Record<string, string[]>

export interface ReorderManualNodeOrderPayload {
  sourcePath: string
  sourceParentPath: string | null
  targetPath?: string | null
  targetParentPath: string | null
  position: 'before' | 'after' | 'tail'
}

export function getManualOrderParentKey(parentPath?: string | null) {
  return parentPath?.trim() ? parentPath : ROOT_ORDER_KEY
}

export function getParentPath(path: string): string | null {
  const segments = path.split('/').filter(Boolean)
  if (segments.length <= 1) {
    return null
  }

  return segments.slice(0, -1).join('/')
}

export function normalizeManualNodeOrderByParent(
  orderMap: ManualNodeOrderByParent | undefined,
  nodes: FileTreeNode[],
): ManualNodeOrderByParent {
  const knownChildrenByParent = collectKnownChildrenByParent(nodes)
  const normalized = Object.fromEntries(
    Object.entries(knownChildrenByParent).map(([parentKey, childPaths]) => {
      const preferredOrder = orderMap?.[parentKey] ?? []
      const remainingChildPaths = new Set(childPaths)
      const nextOrder: string[] = []

      for (const path of preferredOrder) {
        if (!remainingChildPaths.has(path)) {
          continue
        }

        nextOrder.push(path)
        remainingChildPaths.delete(path)
      }

      for (const path of childPaths) {
        if (remainingChildPaths.has(path)) {
          nextOrder.push(path)
        }
      }

      return [parentKey, nextOrder]
    }),
  ) as ManualNodeOrderByParent

  return pruneEmptyOrderEntries(normalized)
}

export function applyManualTreeOrder(
  nodes: FileTreeNode[],
  orderMap: ManualNodeOrderByParent | undefined,
): FileTreeNode[] {
  const normalizedOrderMap = normalizeManualNodeOrderByParent(orderMap, nodes)
  return sortNodesForParent(nodes, normalizedOrderMap, null)
}

export function reorderManualNodeOrder(
  orderMap: ManualNodeOrderByParent | undefined,
  payload: ReorderManualNodeOrderPayload,
): ManualNodeOrderByParent {
  const sourceParentKey = getManualOrderParentKey(payload.sourceParentPath)
  const targetParentKey = getManualOrderParentKey(payload.targetParentPath)

  if (sourceParentKey !== targetParentKey) {
    return orderMap ?? {}
  }

  const currentOrder = [...(orderMap?.[sourceParentKey] ?? [])]
  if (currentOrder.length === 0) {
    return orderMap ?? {}
  }

  const sourceIndex = currentOrder.indexOf(payload.sourcePath)
  if (sourceIndex === -1) {
    return orderMap ?? {}
  }

  currentOrder.splice(sourceIndex, 1)

  if (payload.position === 'tail' || !payload.targetPath) {
    currentOrder.push(payload.sourcePath)
    return pruneEmptyOrderEntries({
      ...(orderMap ?? {}),
      [sourceParentKey]: currentOrder,
    })
  }

  const targetIndex = currentOrder.indexOf(payload.targetPath)
  if (targetIndex === -1) {
    currentOrder.push(payload.sourcePath)
    return pruneEmptyOrderEntries({
      ...(orderMap ?? {}),
      [sourceParentKey]: currentOrder,
    })
  }

  const insertIndex = payload.position === 'before' ? targetIndex : targetIndex + 1
  currentOrder.splice(insertIndex, 0, payload.sourcePath)

  return pruneEmptyOrderEntries({
    ...(orderMap ?? {}),
    [sourceParentKey]: currentOrder,
  })
}

export function appendNodeToManualOrder(
  orderMap: ManualNodeOrderByParent | undefined,
  targetPath: string,
): ManualNodeOrderByParent {
  const parentKey = getManualOrderParentKey(getParentPath(targetPath))
  const currentOrder = [...(orderMap?.[parentKey] ?? [])].filter((path) => path !== targetPath)
  currentOrder.push(targetPath)

  return pruneEmptyOrderEntries({
    ...(orderMap ?? {}),
    [parentKey]: currentOrder,
  })
}

export function moveNodeToParentTailInManualOrder(
  orderMap: ManualNodeOrderByParent | undefined,
  sourcePath: string,
  targetPath: string,
): ManualNodeOrderByParent {
  const withoutSourcePath = removeNodeFromManualOrder(orderMap, sourcePath)
  return appendNodeToManualOrder(withoutSourcePath, targetPath)
}

export function rewriteManualOrderPaths(
  orderMap: ManualNodeOrderByParent | undefined,
  sourcePath: string,
  targetPath: string,
): ManualNodeOrderByParent {
  const nextEntries = Object.entries(orderMap ?? {}).map(([parentKey, childPaths]) => {
    const nextParentKey = rewritePathIfDescendant(parentKey, sourcePath, targetPath)
    const nextChildPaths = childPaths.map((path) => rewritePathIfDescendant(path, sourcePath, targetPath))
    return [nextParentKey, nextChildPaths] as const
  })

  return pruneEmptyOrderEntries(mergeDuplicateParentEntries(nextEntries))
}

export function removeNodeFromManualOrder(
  orderMap: ManualNodeOrderByParent | undefined,
  targetPath: string,
): ManualNodeOrderByParent {
  const nextEntries = Object.entries(orderMap ?? {})
    .filter(([parentKey]) => parentKey !== targetPath && !isDescendantPath(parentKey, targetPath))
    .map(([parentKey, childPaths]) => {
      const nextChildPaths = childPaths.filter(
        (path) => path !== targetPath && !isDescendantPath(path, targetPath),
      )
      return [parentKey, nextChildPaths] as const
    })

  return pruneEmptyOrderEntries(Object.fromEntries(nextEntries))
}

function sortNodesForParent(
  nodes: FileTreeNode[],
  orderMap: ManualNodeOrderByParent,
  parentPath: string | null,
): FileTreeNode[] {
  const parentKey = getManualOrderParentKey(parentPath)
  const nodeByPath = new Map(nodes.map((node) => [node.path, node] as const))
  const preferredOrder = orderMap[parentKey] ?? nodes.map((node) => node.path)

  return preferredOrder
    .map((path) => nodeByPath.get(path))
    .filter((node): node is FileTreeNode => node != null)
    .map((node) =>
      node.kind === 'directory'
        ? ({
            ...node,
            children: sortNodesForParent(node.children, orderMap, node.path),
          } satisfies FileTreeDirectoryNode)
        : node,
    )
}

function collectKnownChildrenByParent(nodes: FileTreeNode[]) {
  const knownChildrenByParent: ManualNodeOrderByParent = {
    [ROOT_ORDER_KEY]: nodes.map((node) => node.path),
  }

  function visit(children: FileTreeNode[], parentPath: string | null) {
    knownChildrenByParent[getManualOrderParentKey(parentPath)] = children.map((child) => child.path)

    for (const child of children) {
      if (child.kind === 'directory') {
        visit(child.children, child.path)
      }
    }
  }

  visit(nodes, null)
  return knownChildrenByParent
}

function rewritePathIfDescendant(path: string, sourcePath: string, targetPath: string) {
  if (path === ROOT_ORDER_KEY) {
    return path
  }

  if (path === sourcePath) {
    return targetPath
  }

  if (path.startsWith(`${sourcePath}/`)) {
    return `${targetPath}${path.slice(sourcePath.length)}`
  }

  return path
}

function isDescendantPath(path: string, ancestorPath: string) {
  return path.startsWith(`${ancestorPath}/`)
}

function mergeDuplicateParentEntries(
  entries: ReadonlyArray<readonly [string, string[]]>,
): ManualNodeOrderByParent {
  const merged: ManualNodeOrderByParent = {}

  for (const [parentKey, childPaths] of entries) {
    const current = merged[parentKey] ?? []
    const seen = new Set(current)

    for (const path of childPaths) {
      if (seen.has(path)) {
        continue
      }
      current.push(path)
      seen.add(path)
    }

    merged[parentKey] = current
  }

  return merged
}

function pruneEmptyOrderEntries(orderMap: ManualNodeOrderByParent) {
  return Object.fromEntries(
    Object.entries(orderMap).filter(([, childPaths]) => childPaths.length > 0),
  ) as ManualNodeOrderByParent
}
