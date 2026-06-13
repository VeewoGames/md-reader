import { TopBar, type WorkspaceMode } from './TopBar'
import { WorkspaceLayout } from './WorkspaceLayout'
import type { FileTreeNode } from '../workspace/file-tree-types'
import type { ProjectRegistryRecord } from '../workspace/registry'

interface AppShellProps {
  projects: ProjectRegistryRecord[]
  activeProjectId: string | null
  profileIds: string[]
  activeProfileId: string
  mode: WorkspaceMode
  fileTree: FileTreeNode[]
  currentDocumentPath: string | null
  statusMessage: string | null
  onConnectProject: () => void
  onProjectChange: (projectId: string) => void
  onProfileChange: (profileId: string) => void
  onModeChange: (mode: WorkspaceMode) => void
  onDocumentSelect: (path: string) => void
}

export function AppShell(props: AppShellProps) {
  return (
    <div className="app-shell">
      <TopBar
        projects={props.projects}
        activeProjectId={props.activeProjectId}
        profileIds={props.profileIds}
        activeProfileId={props.activeProfileId}
        mode={props.mode}
        onConnectProject={props.onConnectProject}
        onProjectChange={props.onProjectChange}
        onProfileChange={props.onProfileChange}
        onModeChange={props.onModeChange}
      />
      <WorkspaceLayout
        fileTree={props.fileTree}
        currentDocumentPath={props.currentDocumentPath}
        statusMessage={props.statusMessage}
        hasProjects={props.projects.length > 0}
        onDocumentSelect={props.onDocumentSelect}
      />
    </div>
  )
}
