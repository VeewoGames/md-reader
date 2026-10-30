import { describe, expect, it } from 'vitest'
import { selectTabsForOpening, type WorkspaceSession, type WorkspaceTab } from '../../src/workspace/workspace-session'

function tab(path: string, overrides: Partial<WorkspaceTab> = {}): WorkspaceTab {
  return { id: path, documentPath: path, persistedContent: 'saved', draftContent: 'saved', mtimeMs: 1,
    saveState: 'clean', saveErrorMessage: null, lastKnownScrollTop: 0, ...overrides }
}
function session(tabs: WorkspaceTab[]): WorkspaceSession {
  return { tabs, tabOpenOrder: ['a', 'b', 'c'], pinnedDocumentPaths: [], activeTabId: 'a', mode: 'regular', regularViewState: 'locked' }
}

describe('tab capacity decisions', () => {
  it('keeps the active tab and uses opening order rather than visual order', () => {
    expect(selectTabsForOpening(session([tab('c'), tab('a'), tab('b')]), 3, null)).toEqual(['b'])
  })
  it('excludes pins and protects drafts, saves and composition', () => {
    const current = session([tab('a'), tab('b', { draftContent: 'changed' }), tab('c', { saveState: 'saving_background' })])
    current.pinnedDocumentPaths = ['a']
    expect(selectTabsForOpening(current, 2, null)).toBeNull()
    current.tabs[1] = tab('b')
    expect(selectTabsForOpening(current, 2, 'b')).toBeNull()
    expect(selectTabsForOpening(current, 2, null)).toEqual(['b'])
  })
  it('evicts enough tabs after a limit reduction, or makes no partial decision', () => {
    const current = session([tab('a'), tab('b'), tab('c')])
    expect(selectTabsForOpening(current, 1, null)).toEqual(['b', 'c', 'a'])
    current.tabs[0] = tab('a', { saveState: 'conflict_hard' })
    expect(selectTabsForOpening(current, 1, null)).toBeNull()
  })
})
