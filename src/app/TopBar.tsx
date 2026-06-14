import type { ProjectRegistryRecord } from '../workspace/registry'
import { preloadVisualMarkdownEditor } from '../editor/visual-markdown-editor'

export type WorkspaceMode = 'regular' | 'split'
export type RegularViewState = 'locked' | 'unlocking' | 'editable' | 'locking'

interface TopBarProps {
  projects: ProjectRegistryRecord[]
  activeProjectId: string | null
  profileIds: string[]
  activeProfileId: string
  canManageService?: boolean
  isServiceActionPending?: boolean
  mode: WorkspaceMode
  regularViewState: RegularViewState
  currentDocumentPath: string | null
  saveIndicator?: string | null
  statusMessage: string | null
  onConnectProject: () => void
  onProjectChange: (projectId: string) => void
  onProfileChange: (profileId: string) => void
  onModeChange: (mode: WorkspaceMode) => void
  onToggleRegularLock: () => void
  onRestartService?: () => void
  onStopService?: () => void
}

const MODE_LABELS: Record<WorkspaceMode, string> = {
  regular: '常规',
  split: '分栏',
}

export function TopBar({
  projects,
  activeProjectId,
  profileIds,
  activeProfileId,
  canManageService = false,
  isServiceActionPending = false,
  mode,
  regularViewState,
  currentDocumentPath,
  saveIndicator,
  statusMessage,
  onConnectProject,
  onProjectChange,
  onProfileChange,
  onModeChange,
  onToggleRegularLock,
  onRestartService,
  onStopService,
}: TopBarProps) {
  const activeProjectName =
    projects.find((project) => project.id === activeProjectId)?.name ?? '未接入项目'
  const currentDocumentName = currentDocumentPath?.split('/').at(-1) ?? '未打开文档'
  const isRegularMode = mode === 'regular'
  const isLockActionPending =
    regularViewState === 'unlocking' || regularViewState === 'locking'
  const isUnlocked = regularViewState === 'editable' || regularViewState === 'locking'
  const lockButtonLabel = isUnlocked ? '锁定' : '解锁'

  return (
    <header className="topbar" role="banner">
      <div className="topbar__group topbar__group--start">
        <label className="topbar__field topbar__field--project">
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

        <button type="button" className="topbar__action" onClick={onConnectProject}>
          接入项目
        </button>
      </div>

      <div className="topbar__status" aria-label="当前工作区状态">
        <div className="topbar__status-line">
          <strong>{activeProjectName}</strong>
          <span>{currentDocumentName}</span>
        </div>
        <div className="topbar__status-meta">
          状态：{statusMessage ?? '等待载入项目'}
        </div>
        <div className="topbar__status-meta">
          保存：{saveIndicator ?? '未打开文档'}
        </div>
      </div>

      <div className="topbar__group topbar__group--end">
        <div className="topbar__field">
          <div className="topbar__mode-cluster">
            {isRegularMode ? (
              <button
                type="button"
                className="topbar__lock-toggle"
                aria-pressed={isUnlocked}
                aria-label={lockButtonLabel}
                disabled={isLockActionPending}
                onPointerEnter={preloadVisualMarkdownEditor}
                onFocus={preloadVisualMarkdownEditor}
                onClick={onToggleRegularLock}
              >
                <span className="topbar__lock-icon" aria-hidden="true">
                  {isUnlocked ? (
                    <svg viewBox="0 0 16 16" focusable="false">
                      <path
                        d="M11.25 6H4.75A1.75 1.75 0 0 0 3 7.75v4.5C3 13.216 3.784 14 4.75 14h6.5A1.75 1.75 0 0 0 13 12.25v-4.5A1.75 1.75 0 0 0 11.25 6ZM12 12.25a.75.75 0 0 1-.75.75h-6.5A.75.75 0 0 1 4 12.25v-4.5A.75.75 0 0 1 4.75 7h6.5a.75.75 0 0 1 .75.75v4.5ZM6.25 5V4.5a1.75 1.75 0 0 1 3.158-1.037.5.5 0 1 0 .814-.58A2.75 2.75 0 0 0 5.25 4.5V5a.5.5 0 0 0 1 0Z"
                        fill="currentColor"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" focusable="false">
                      <path
                        d="M5.25 5V4.5a2.75 2.75 0 1 1 5.5 0V5h.5A1.75 1.75 0 0 1 13 6.75v5.5A1.75 1.75 0 0 1 11.25 14h-6.5A1.75 1.75 0 0 1 3 12.25v-5.5A1.75 1.75 0 0 1 4.75 5h.5Zm1 0h3.5V4.5a1.75 1.75 0 1 0-3.5 0V5Zm-1.5 1A.75.75 0 0 0 4 6.75v5.5c0 .414.336.75.75.75h6.5a.75.75 0 0 0 .75-.75v-5.5a.75.75 0 0 0-.75-.75h-6.5Z"
                        fill="currentColor"
                      />
                    </svg>
                  )}
                </span>
                <span>{lockButtonLabel}</span>
              </button>
            ) : null}

            <div className="topbar__modes" role="group" aria-label="模式切换">
            {(Object.keys(MODE_LABELS) as WorkspaceMode[]).map((nextMode) => (
              <button
                key={nextMode}
                type="button"
                className="topbar__mode"
                aria-pressed={mode === nextMode}
                onPointerEnter={nextMode === 'regular' ? preloadVisualMarkdownEditor : undefined}
                onFocus={nextMode === 'regular' ? preloadVisualMarkdownEditor : undefined}
                onClick={() => onModeChange(nextMode)}
              >
                {MODE_LABELS[nextMode]}
              </button>
            ))}
            </div>
          </div>
        </div>

        <label className="topbar__field topbar__field--profile">
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

        {canManageService ? (
          <div className="topbar__service-actions" role="group" aria-label="服务操作">
            <button
              type="button"
              className="topbar__service-button"
              aria-label="重启服务"
              title="重启服务"
              disabled={isServiceActionPending}
              onClick={onRestartService}
            >
              ↻
            </button>
            <button
              type="button"
              className="topbar__service-button"
              aria-label="关闭服务"
              title="关闭服务"
              disabled={isServiceActionPending}
              onClick={onStopService}
            >
              ⏻
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
