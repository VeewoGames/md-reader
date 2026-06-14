import { TopBar, type RegularViewState, type WorkspaceMode } from './TopBar'
import { WorkspaceLayout } from './WorkspaceLayout'
import type { FileTreeNode } from '../workspace/file-tree-types'
import type { ProjectRegistryRecord } from '../workspace/registry'

interface AppShellProps {
  projects: ProjectRegistryRecord[]
  activeProjectId: string | null
  profileIds: string[]
  activeProfileId: string
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
  onConnectProject: () => void
  onProjectChange: (projectId: string) => void
  onProfileChange: (profileId: string) => void
  onModeChange: (mode: WorkspaceMode) => void
  onToggleRegularLock: () => void
  onRestartService?: () => void
  onStopService?: () => void
  onDocumentSelect: (path: string) => void
  onEditingDocumentContentChange?: (content: string) => void
  onEditingCompositionStart?: () => void
  onEditingCompositionEnd?: () => void
  onSidebarWidthChange: (width: number) => void
  onSidebarWidthCommit: (width: number) => void | Promise<void>
  onOutlineWidthChange: (width: number) => void
  onOutlineWidthCommit: (width: number) => void | Promise<void>
}

export function AppShell(props: AppShellProps) {
  return (
    <div className="app-shell">
      <TopBar
        projects={props.projects}
        activeProjectId={props.activeProjectId}
        profileIds={props.profileIds}
        activeProfileId={props.activeProfileId}
        canManageService={props.canManageService}
        isServiceActionPending={props.isServiceActionPending}
        mode={props.mode}
        regularViewState={props.regularViewState}
        currentDocumentPath={props.currentDocumentPath}
        saveIndicator={props.saveIndicator}
        statusMessage={props.statusMessage}
        onConnectProject={props.onConnectProject}
        onProjectChange={props.onProjectChange}
        onProfileChange={props.onProfileChange}
        onModeChange={props.onModeChange}
        onToggleRegularLock={props.onToggleRegularLock}
        onRestartService={props.onRestartService}
        onStopService={props.onStopService}
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
