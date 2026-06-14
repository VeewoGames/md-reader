import type { KeyValueStore } from '../shared/key-value-store'
import { STORAGE_KEYS } from '../shared/storage-keys'

export interface WorkspaceLocalState {
  activeDocumentPath: string | null
  activeMode: 'regular' | 'split' | 'read' | 'edit'
  lastKnownScrollTop: number
  readingProgressByDocument: Record<string, number>
}

const DEFAULT_LOCAL_STATE: WorkspaceLocalState = {
  activeDocumentPath: null,
  activeMode: 'regular',
  lastKnownScrollTop: 0,
  readingProgressByDocument: {},
}

export function createLocalStateStore(storage: KeyValueStore) {
  return {
    async getState(projectId: string): Promise<WorkspaceLocalState> {
      return (
        (await storage.getItem<WorkspaceLocalState>(STORAGE_KEYS.localState(projectId))) ??
        DEFAULT_LOCAL_STATE
      )
    },
    async saveState(projectId: string, state: WorkspaceLocalState): Promise<void> {
      await storage.setItem(STORAGE_KEYS.localState(projectId), state)
    },
  }
}
