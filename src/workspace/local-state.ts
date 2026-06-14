import type { KeyValueStore } from '../shared/key-value-store'
import { STORAGE_KEYS } from '../shared/storage-keys'

export interface WorkspaceLocalState {
  openDocumentPaths: string[]
  activeDocumentPath: string | null
  activeMode: 'regular' | 'split'
  regularViewState: 'locked' | 'unlocking' | 'editable' | 'locking'
  tabStateByDocument: Record<string, { lastKnownScrollTop: number }>
  readingProgressByDocument: Record<string, number>
}

const DEFAULT_LOCAL_STATE: WorkspaceLocalState = {
  openDocumentPaths: [],
  activeDocumentPath: null,
  activeMode: 'regular',
  regularViewState: 'locked',
  tabStateByDocument: {},
  readingProgressByDocument: {},
}

type LegacyWorkspaceLocalState = Omit<Partial<WorkspaceLocalState>, 'activeMode'> & {
  activeMode?: WorkspaceLocalState['activeMode'] | 'read' | 'edit'
  lastKnownScrollTop?: number
}

function normalizeWorkspaceLocalState(
  state: LegacyWorkspaceLocalState | null | undefined,
): WorkspaceLocalState {
  const activeDocumentPath = state?.activeDocumentPath ?? null
  const openDocumentPathsFromState = state?.openDocumentPaths ?? []
  const openDocumentPaths =
    activeDocumentPath && !openDocumentPathsFromState.includes(activeDocumentPath)
      ? [...openDocumentPathsFromState, activeDocumentPath]
      : openDocumentPathsFromState
  const normalizedActiveMode =
    state?.activeMode === 'split' ? 'split' : 'regular'
  const normalizedRegularViewState =
    state?.regularViewState ??
    (state?.activeMode === 'edit' ? 'editable' : 'locked')
  const tabStateByDocument =
    state?.tabStateByDocument ??
    (activeDocumentPath
      ? {
          [activeDocumentPath]: {
            lastKnownScrollTop: state?.lastKnownScrollTop ?? 0,
          },
        }
      : {})

  return {
    openDocumentPaths,
    activeDocumentPath,
    activeMode: normalizedActiveMode,
    regularViewState: normalizedRegularViewState,
    tabStateByDocument,
    readingProgressByDocument: state?.readingProgressByDocument ?? {},
  }
}

export function createLocalStateStore(storage: KeyValueStore) {
  return {
    async getState(projectId: string): Promise<WorkspaceLocalState> {
      const rawState = await storage.getItem<LegacyWorkspaceLocalState>(
        STORAGE_KEYS.localState(projectId),
      )

      if (rawState == null) {
        return DEFAULT_LOCAL_STATE
      }

      return normalizeWorkspaceLocalState(rawState)
    },
    async saveState(projectId: string, state: WorkspaceLocalState): Promise<void> {
      await storage.setItem(STORAGE_KEYS.localState(projectId), state)
    },
  }
}
