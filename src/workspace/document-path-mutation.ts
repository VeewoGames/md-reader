import type { WorkspaceLocalState } from './local-state'
import type { WorkspaceProfile } from './profile-store'
import type { WorkspaceSession } from './workspace-session'
import {
  removeNodeFromManualOrder,
  rewriteManualOrderPaths,
} from './file-tree-order'

export function rewriteSessionDocumentPath(
  session: WorkspaceSession,
  sourcePath: string,
  targetPath: string,
): WorkspaceSession {
  return {
    ...session,
    activeTabId: session.activeTabId === sourcePath ? targetPath : session.activeTabId,
    tabs: session.tabs.map((tab) =>
      tab.documentPath === sourcePath
        ? {
            ...tab,
            id: targetPath,
            documentPath: targetPath,
          }
        : tab,
    ),
  }
}

export function rewritePathCollections({
  localState,
  profile,
  sourcePath,
  targetPath,
}: {
  localState: WorkspaceLocalState
  profile: WorkspaceProfile
  sourcePath: string
  targetPath: string
}) {
  return {
    localState: {
      ...localState,
      openDocumentPaths: rewritePathArray(localState.openDocumentPaths, sourcePath, targetPath),
      activeDocumentPath:
        localState.activeDocumentPath === sourcePath ? targetPath : localState.activeDocumentPath,
      tabStateByDocument: rewritePathRecord(localState.tabStateByDocument, sourcePath, targetPath),
      readingProgressByDocument: rewritePathRecord(
        localState.readingProgressByDocument,
        sourcePath,
        targetPath,
      ),
    },
    profile: {
      ...profile,
      navigation: {
        ...profile.navigation,
        hiddenPaths: rewritePathArray(profile.navigation.hiddenPaths, sourcePath, targetPath),
        favoritePaths: rewritePathArray(profile.navigation.favoritePaths, sourcePath, targetPath),
        manualNodeOrderByParent: rewriteManualOrderPaths(
          profile.navigation.manualNodeOrderByParent,
          sourcePath,
          targetPath,
        ),
      },
    },
  }
}

export function removePathCollections({
  localState,
  profile,
  targetPath,
}: {
  localState: WorkspaceLocalState
  profile: WorkspaceProfile
  targetPath: string
}) {
  const { [targetPath]: _removedTabState, ...nextTabStateByDocument } = localState.tabStateByDocument
  const { [targetPath]: _removedReadingProgress, ...nextReadingProgressByDocument } =
    localState.readingProgressByDocument

  return {
    localState: {
      ...localState,
      openDocumentPaths: localState.openDocumentPaths.filter((path) => path !== targetPath),
      activeDocumentPath:
        localState.activeDocumentPath === targetPath ? null : localState.activeDocumentPath,
      tabStateByDocument: nextTabStateByDocument,
      readingProgressByDocument: nextReadingProgressByDocument,
    },
    profile: {
      ...profile,
      navigation: {
        ...profile.navigation,
        hiddenPaths: profile.navigation.hiddenPaths.filter((path) => path !== targetPath),
        favoritePaths: profile.navigation.favoritePaths.filter((path) => path !== targetPath),
        manualNodeOrderByParent: removeNodeFromManualOrder(
          profile.navigation.manualNodeOrderByParent,
          targetPath,
        ),
      },
    },
  }
}

function rewritePathArray(paths: string[] | undefined, sourcePath: string, targetPath: string) {
  return (paths ?? []).map((path) => (path === sourcePath ? targetPath : path))
}

function rewritePathRecord<T>(
  record: Record<string, T> | undefined,
  sourcePath: string,
  targetPath: string,
) {
  return Object.fromEntries(
    Object.entries(record ?? {}).map(([key, value]) => [
      key === sourcePath ? targetPath : key,
      value,
    ]),
  )
}
