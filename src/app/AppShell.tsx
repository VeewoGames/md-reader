import type { CSSProperties } from 'react'

import { TopBar, type RegularViewState, type WorkspaceMode } from './TopBar'
import { WorkspaceLayout } from './WorkspaceLayout'
import type { FileTreeNode } from '../workspace/file-tree-types'
import type { ProjectRegistryRecord } from '../workspace/registry'
import type { TabSaveState } from '../workspace/workspace-session'
import type { DocumentLineHeight, PageWidthMode } from '../workspace/profile-store'

interface AppShellTab {
  id: string
  documentPath: string
  title: string
  saveState: TabSaveState
  saveErrorMessage: string | null
}

interface AppShellProps {
  projects: ProjectRegistryRecord[]
  activeProjectId: string | null
  profileIds: string[]
  activeProfileId: string
  tabs: AppShellTab[]
  activeTabId: string | null
  canManageService?: boolean
  isServiceActionPending?: boolean
  mode: WorkspaceMode
  regularViewState: RegularViewState
  fileTree: FileTreeNode[]
  currentDocumentPath: string | null
  currentDocumentContent: string | null
  editingDocumentContent?: string | null
  saveIndicator?: string | null
  isDocumentLoading?: boolean
  statusMessage: string | null
  sidebarWidth: number
  outlineWidth: number
  documentFontSize?: number
  documentPageWidth?: PageWidthMode
  documentLineHeight?: DocumentLineHeight
  onConnectProject: () => void
  onProjectChange: (projectId: string) => void
  onProfileChange: (profileId: string) => void
  onModeChange: (mode: WorkspaceMode) => void
  onToggleRegularLock: () => void
  onTabSelect: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onTabReorder: (nextOrderedTabIds: string[]) => void
  onRestartService?: () => void
  onStopService?: () => void
  onDocumentSelect: (path: string) => void
  onDocumentFontSizeChange?: (fontSize: number) => void
  onDocumentPageWidthChange?: (pageWidth: PageWidthMode) => void
  onDocumentLineHeightChange?: (lineHeight: DocumentLineHeight) => void
  onEditingDocumentContentChange?: (content: string) => void
  onEditingCompositionStart?: () => void
  onEditingCompositionEnd?: () => void
  onSidebarWidthChange: (width: number) => void
  onSidebarWidthCommit: (width: number) => void | Promise<void>
  onOutlineWidthChange: (width: number) => void
  onOutlineWidthCommit: (width: number) => void | Promise<void>
}

export function AppShell(props: AppShellProps) {
  const documentFontSize = props.documentFontSize ?? 16
  const documentPageWidth = props.documentPageWidth ?? 'narrow'
  const documentLineHeight = props.documentLineHeight ?? 1.6
  const documentMaxWidth = documentPageWidth === 'wide' ? '960px' : '720px'

  return (
    <div
      className="app-shell"
      style={
        {
          '--doc-body-font-size': `${documentFontSize}px`,
          '--doc-max-width': documentMaxWidth,
          '--doc-body-line-height': String(documentLineHeight),
        } as CSSProperties
      }
    >
      <TopBar
        projects={props.projects}
        activeProjectId={props.activeProjectId}
        profileIds={props.profileIds}
        activeProfileId={props.activeProfileId}
        tabs={props.tabs}
        activeTabId={props.activeTabId}
        canManageService={props.canManageService}
        isServiceActionPending={props.isServiceActionPending}
        mode={props.mode}
        regularViewState={props.regularViewState}
        statusMessage={props.statusMessage}
        saveIndicator={props.saveIndicator}
        onConnectProject={props.onConnectProject}
        onProjectChange={props.onProjectChange}
        onProfileChange={props.onProfileChange}
        onModeChange={props.onModeChange}
        onToggleRegularLock={props.onToggleRegularLock}
        onTabSelect={props.onTabSelect}
        onTabClose={props.onTabClose}
        onTabReorder={props.onTabReorder}
        onRestartService={props.onRestartService}
        onStopService={props.onStopService}
        documentFontSize={documentFontSize}
        documentPageWidth={documentPageWidth}
        documentLineHeight={documentLineHeight}
        onDocumentFontSizeChange={props.onDocumentFontSizeChange}
        onDocumentPageWidthChange={props.onDocumentPageWidthChange}
        onDocumentLineHeightChange={props.onDocumentLineHeightChange}
      />
      <WorkspaceLayout
        mode={props.mode}
        regularViewState={props.regularViewState}
        fileTree={props.fileTree}
        currentDocumentPath={props.currentDocumentPath}
        currentDocumentContent={props.currentDocumentContent}
        editingDocumentContent={props.editingDocumentContent}
        isDocumentLoading={props.isDocumentLoading}
        statusMessage={props.statusMessage}
        sidebarWidth={props.sidebarWidth}
        outlineWidth={props.outlineWidth}
        hasProjects={props.projects.length > 0}
        onDocumentSelect={props.onDocumentSelect}
        onEditingDocumentContentChange={props.onEditingDocumentContentChange}
        onEditingCompositionStart={props.onEditingCompositionStart}
        onEditingCompositionEnd={props.onEditingCompositionEnd}
        onSidebarWidthChange={props.onSidebarWidthChange}
        onSidebarWidthCommit={props.onSidebarWidthCommit}
        onOutlineWidthChange={props.onOutlineWidthChange}
        onOutlineWidthCommit={props.onOutlineWidthCommit}
      />
    </div>
  )
}
