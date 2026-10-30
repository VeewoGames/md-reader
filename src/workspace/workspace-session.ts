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
  /** Distinguishes a closed and reopened path from its previous lifetime. */
  instanceId?: symbol
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
  /** Opening order is independent of the user-controlled visual order. */
  tabOpenOrder?: string[]
  pinnedDocumentPaths?: string[]
  activeTabId: string | null
  mode: WorkspaceMode
  regularViewState: RegularViewState
}

export function sessionTabMetadata(session: WorkspaceSession) {
  const paths = session.tabs.map((tab) => tab.documentPath)
  const open = new Set(paths)
  const tabOpenOrder = [...new Set((session.tabOpenOrder ?? []).filter((path) => open.has(path)))]
  for (const path of paths) if (!tabOpenOrder.includes(path)) tabOpenOrder.push(path)
  return {
    tabOpenOrder,
    pinnedDocumentPaths: [...new Set((session.pinnedDocumentPaths ?? []).filter((path) => open.has(path)))],
  }
}

/** Returns the complete eviction set, or null when drafts make the limit unattainable. */
export function selectTabsForOpening(
  session: WorkspaceSession,
  limit: number,
  composingTabId: string | null,
  savingTabIds: ReadonlySet<string> = new Set(),
): string[] | null {
  const { tabOpenOrder, pinnedDocumentPaths } = sessionTabMetadata(session)
  const pinned = new Set(pinnedDocumentPaths)
  const byPath = new Map(session.tabs.map((tab) => [tab.documentPath, tab]))
  const count = session.tabs.filter((tab) => !pinned.has(tab.documentPath)).length
  const needed = Math.max(0, count + 1 - limit)
  if (needed === 0) return []
  const candidates = tabOpenOrder.flatMap((path) => {
    const tab = byPath.get(path)
    if (!tab || pinned.has(path) || tab.id === composingTabId || savingTabIds.has(tab.id) || tab.saveState !== 'clean' || tab.saveErrorMessage != null || tab.draftContent !== tab.persistedContent) return []
    return [tab]
  })
  const ordered = [...candidates.filter((tab) => tab.id !== session.activeTabId), ...candidates.filter((tab) => tab.id === session.activeTabId)]
  return ordered.length < needed ? null : ordered.slice(0, needed).map((tab) => tab.id)
}

export function getActiveTab(session: WorkspaceSession): WorkspaceTab | null {
  return session.tabs.find((tab) => tab.id === session.activeTabId) ?? null
}
