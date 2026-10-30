export type WorkspaceLocator = { projectId: string; profileId: string }
export type DeepLinkTarget = WorkspaceLocator & { documentPath: string; headingId: string | null }

export function parseWorkspaceLocatorFromLocation(
  location: Pick<Location, 'search' | 'hash'>,
): WorkspaceLocator | DeepLinkTarget | null | 'invalid' {
  const params = new URLSearchParams(location.search)
  const keys = ['project', 'profile', 'path'] as const
  const hasAny = keys.some((key) => params.has(key))
  if (!hasAny) return null
  if (params.getAll('project').length !== 1 || params.getAll('profile').length !== 1) return 'invalid'
  if (params.has('path') && params.getAll('path').length !== 1) return 'invalid'
  const projectId = params.get('project') ?? ''
  const profileId = params.get('profile') ?? ''
  if (!projectId || !profileId) {
    return 'invalid'
  }
  const documentPath = params.get('path')
  if (documentPath == null) return { projectId, profileId }
  if (!documentPath || documentPath.startsWith('/') || documentPath.includes('\\') || documentPath.split('/').includes('..')) return 'invalid'
  const rawHash = location.hash.slice(1)
  try {
    return { projectId, profileId, documentPath, headingId: rawHash ? decodeURIComponent(rawHash) : null }
  } catch {
    return 'invalid'
  }
}

export function parseDeepLinkFromLocation(location: Pick<Location, 'search' | 'hash'>): DeepLinkTarget | null | 'invalid' {
  const locator = parseWorkspaceLocatorFromLocation(location)
  if (locator == null || locator === 'invalid') return locator
  return 'documentPath' in locator ? locator : null
}

export function parseWorkspaceLocator(): WorkspaceLocator | DeepLinkTarget | null | 'invalid' {
  return parseWorkspaceLocatorFromLocation(window.location)
}

export function createWorkspaceHref(projectId: string, profileId: string) {
  const url = new URL(window.location.href)
  url.search = new URLSearchParams({ project: projectId, profile: profileId }).toString()
  url.hash = ''
  return url.toString()
}

export function replaceWorkspaceHref(projectId: string, profileId: string) {
  window.history.replaceState(null, '', createWorkspaceHref(projectId, profileId))
}

export function createDocumentShareHref(projectId: string, profileId: string, documentPath: string, headingId: string | null) {
  const url = new URL(window.location.href)
  url.search = new URLSearchParams({ project: projectId, profile: profileId, path: documentPath }).toString()
  url.hash = headingId ? encodeURIComponent(headingId) : ''
  return url.toString()
}

export function createNavigationPersistenceCoordinator() {
  let queue: Promise<void> = Promise.resolve()
  return {
    enqueue(
      requestId: number,
      getLatestRequestId: () => number,
      persist: () => Promise<void>,
    ): Promise<boolean> {
      const result = queue.then(async () => {
        if (getLatestRequestId() !== requestId) return false
        await persist()
        return getLatestRequestId() === requestId
      })
      queue = result.then(() => undefined, () => undefined)
      return result
    },
  }
}
