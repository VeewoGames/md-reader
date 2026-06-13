import type { KeyValueStore } from '../shared/key-value-store'
import { STORAGE_KEYS } from '../shared/storage-keys'

export interface WorkspaceLocalState {
  activeDocumentPath: string | null
  activeMode: 'read' | 'edit' | 'split'
  lastKnownScrollTop: number
}

const DEFAULT_LOCAL_STATE: WorkspaceLocalState = {
  activeDocumentPath: null,
  activeMode: 'read',
  lastKnownScrollTop: 0,
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
