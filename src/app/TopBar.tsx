import type { ProjectRegistryRecord } from '../workspace/registry'

export type WorkspaceMode = 'read' | 'edit' | 'split'

interface TopBarProps {
  projects: ProjectRegistryRecord[]
  activeProjectId: string | null
  profileIds: string[]
  activeProfileId: string
  mode: WorkspaceMode
  onConnectProject: () => void
  onProjectChange: (projectId: string) => void
  onProfileChange: (profileId: string) => void
  onModeChange: (mode: WorkspaceMode) => void
}

const MODE_LABELS: Record<WorkspaceMode, string> = {
  read: '阅读',
  edit: '编辑',
  split: '分栏',
}

export function TopBar({
  projects,
  activeProjectId,
  profileIds,
  activeProfileId,
  mode,
  onConnectProject,
  onProjectChange,
  onProfileChange,
  onModeChange,
}: TopBarProps) {
  return (
    <header className="topbar" role="banner">
      <div className="topbar__brand">
        <strong>md-reader</strong>
        <span>Markdown-first workspace</span>
      </div>

      <div className="topbar__controls">
        <label className="topbar__field">
          <span>项目</span>
          <select
            aria-label="项目切换"
            value={activeProjectId ?? ''}
            onChange={(event) => onProjectChange(event.target.value)}
          >
            <option value="" disabled>
              选择项目
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <div className="topbar__field">
          <span>接入</span>
          <button type="button" className="topbar__action" onClick={onConnectProject}>
            接入项目
          </button>
        </div>

        <label className="topbar__field">
          <span>Profile</span>
          <select
            aria-label="Profile 切换"
            value={activeProfileId}
            onChange={(event) => onProfileChange(event.target.value)}
          >
            {profileIds.map((profileId) => (
              <option key={profileId} value={profileId}>
                {profileId}
              </option>
            ))}
          </select>
        </label>

        <div className="topbar__field">
          <span>模式</span>
          <div className="topbar__modes" role="group" aria-label="模式切换">
            {(Object.keys(MODE_LABELS) as WorkspaceMode[]).map((nextMode) => (
              <button
                key={nextMode}
                type="button"
                className="topbar__mode"
                aria-pressed={mode === nextMode}
                onClick={() => onModeChange(nextMode)}
              >
                {MODE_LABELS[nextMode]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}
