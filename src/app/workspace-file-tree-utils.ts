const FILE_TREE_EDGE_SCROLL_ZONE_PX = 48
const FILE_TREE_EDGE_SCROLL_MAX_DELTA_PX = 18

export function getFileTreeEdgeScrollDelta(
  rect: Pick<DOMRect, 'top' | 'bottom'>,
  clientY: number,
  zonePx = FILE_TREE_EDGE_SCROLL_ZONE_PX,
  maxDeltaPx = FILE_TREE_EDGE_SCROLL_MAX_DELTA_PX,
) {
  if (!Number.isFinite(clientY) || zonePx <= 0) {
    return 0
  }

  if (clientY < rect.top + zonePx) {
    return -Math.ceil(((rect.top + zonePx - clientY) / zonePx) * maxDeltaPx)
  }
  if (clientY > rect.bottom - zonePx) {
    return Math.ceil(((clientY - (rect.bottom - zonePx)) / zonePx) * maxDeltaPx)
  }
  return 0
}

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

export function formatFileTreeDisplayName(fileName: string, hideFileTitleDate: boolean) {
  return hideFileTitleDate ? fileName.replace(/^\d{4}-\d{2}-\d{2}[-_\s]+/, '') : fileName
}
