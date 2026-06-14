import type { RegularViewState, WorkspaceMode } from '../app/TopBar'

export type TabSaveState =
  | 'clean'
  | 'typing'
  | 'save_queued'
  | 'saving_background'
  | 'save_failed_retryable'
  | 'conflict_hard'
  | 'leaving_with_pending_flush'

export interface WorkspaceTab {
  id: string
  documentPath: string
  persistedContent: string | null
  draftContent: string | null
  mtimeMs: number | null
  saveState: TabSaveState
  saveErrorMessage: string | null
  lastKnownScrollTop: number
}

export interface WorkspaceSession {
  tabs: WorkspaceTab[]
  activeTabId: string | null
  mode: WorkspaceMode
  regularViewState: RegularViewState
}

export function getActiveTab(session: WorkspaceSession): WorkspaceTab | null {
  return session.tabs.find((tab) => tab.id === session.activeTabId) ?? null
}
