import type { KeyValueStore } from '../shared/key-value-store'
import { STORAGE_KEYS } from '../shared/storage-keys'

export interface WorkspaceLocalState {
  openDocumentPaths: string[]
  activeDocumentPath: string | null
  activeMode: 'regular' | 'split'
  regularViewState: 'locked' | 'unlocking' | 'editable' | 'locking'
  tabStateByDocument: Record<string, { lastKnownScrollTop: number }>
  readingProgressByDocument: Record<string, number>
  tabOpenOrder?: string[]
  pinnedDocumentPaths?: string[]
}

const DEFAULT_LOCAL_STATE: WorkspaceLocalState = {
  openDocumentPaths: [],
  activeDocumentPath: null,
  activeMode: 'regular',
  regularViewState: 'locked',
  tabStateByDocument: {},
  readingProgressByDocument: {},
  tabOpenOrder: [],
  pinnedDocumentPaths: [],
}

type LegacyWorkspaceLocalState = Omit<Partial<WorkspaceLocalState>, 'activeMode'> & {
  activeMode?: WorkspaceLocalState['activeMode'] | 'read' | 'edit'
  lastKnownScrollTop?: number
}

function normalizeWorkspaceLocalState(
  state: LegacyWorkspaceLocalState | null | undefined,
): WorkspaceLocalState {
  const activeDocumentPath = state?.activeDocumentPath ?? null
  const openDocumentPathsFromState = Array.isArray(state?.openDocumentPaths)
    ? [...new Set(state.openDocumentPaths.filter((path): path is string => typeof path === 'string'))]
    : []
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

  const openSet = new Set(openDocumentPaths)
  const tabOpenOrder = [...new Set((Array.isArray(state?.tabOpenOrder) ? state.tabOpenOrder : []).filter((path) => openSet.has(path)))]
  for (const path of openDocumentPaths) {
    if (!tabOpenOrder.includes(path)) tabOpenOrder.push(path)
  }

  return {
    openDocumentPaths,
    activeDocumentPath,
    activeMode: normalizedActiveMode,
    regularViewState: normalizedRegularViewState,
    tabStateByDocument,
    readingProgressByDocument: state?.readingProgressByDocument ?? {},
    tabOpenOrder,
    pinnedDocumentPaths: [...new Set((Array.isArray(state?.pinnedDocumentPaths) ? state.pinnedDocumentPaths : []).filter((path) => openSet.has(path)))],
  }
}

export function createLocalStateStore(storage: KeyValueStore) {
  const pending = new Map<string, Promise<void>>()

  async function readState(projectId: string, profileId: string): Promise<WorkspaceLocalState> {
      const rawState = await storage.getItem<LegacyWorkspaceLocalState>(
        STORAGE_KEYS.localState(projectId, profileId),
      )

      if (rawState != null) {
        return normalizeWorkspaceLocalState(rawState)
      }

      const legacyState = await storage.getItem<LegacyWorkspaceLocalState>(
        STORAGE_KEYS.legacyLocalState(projectId),
      )
      if (legacyState == null) return DEFAULT_LOCAL_STATE

      const normalized = normalizeWorkspaceLocalState(legacyState)
      await storage.setItem(STORAGE_KEYS.localState(projectId, profileId), normalized)
      return normalized
  }

  function enqueue<T>(projectId: string, profileId: string, operation: () => Promise<T>): Promise<T> {
    const key = STORAGE_KEYS.localState(projectId, profileId)
    const previous = pending.get(key) ?? Promise.resolve()
    const result = previous.catch(() => {}).then(operation)
    const settled = result.then(() => {}, () => {})
    pending.set(key, settled)
    void settled.then(() => { if (pending.get(key) === settled) pending.delete(key) })
    return result
  }

  return {
    async getState(projectId: string, profileId: string): Promise<WorkspaceLocalState> {
      // A legacy read may migrate data, so reads must join the same queue.
      return enqueue(projectId, profileId, () => readState(projectId, profileId))
    },
    async saveState(projectId: string, profileId: string, state: WorkspaceLocalState): Promise<void> {
      await enqueue(projectId, profileId, () => storage.setItem(STORAGE_KEYS.localState(projectId, profileId), state))
    },
    async updateState(projectId: string, profileId: string, update: (state: WorkspaceLocalState) => WorkspaceLocalState): Promise<void> {
      await enqueue(projectId, profileId, async () => {
        const current = await readState(projectId, profileId)
        await storage.setItem(STORAGE_KEYS.localState(projectId, profileId), update(current))
      })
    },
  }
}
