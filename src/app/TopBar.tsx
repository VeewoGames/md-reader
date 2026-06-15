import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import type { ProjectRegistryRecord } from '../workspace/registry'
import { preloadVisualMarkdownEditor } from '../editor/visual-markdown-editor'
import type { TabSaveState } from '../workspace/workspace-session'

export type WorkspaceMode = 'regular' | 'split'
export type RegularViewState = 'locked' | 'unlocking' | 'editable' | 'locking'

interface TopBarTab {
  id: string
  documentPath: string
  title: string
  saveState: TabSaveState
  saveErrorMessage: string | null
}

interface TopBarProps {
  projects: ProjectRegistryRecord[]
  activeProjectId: string | null
  profileIds: string[]
  activeProfileId: string
  tabs: TopBarTab[]
  activeTabId: string | null
  canManageService?: boolean
  isServiceActionPending?: boolean
  mode: WorkspaceMode
  regularViewState: RegularViewState
  statusMessage: string | null
  saveIndicator?: string | null
  onConnectProject: () => void
  onProjectChange: (projectId: string) => void
  onProfileChange: (profileId: string) => void
  onModeChange: (mode: WorkspaceMode) => void
  onToggleRegularLock: () => void
  onTabSelect: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onRestartService?: () => void
  onStopService?: () => void
}

const MODE_LABELS: Record<WorkspaceMode, string> = {
  regular: '常规',
  split: '分栏',
}

function TopBarSelect({
  ariaLabel,
  className,
  options,
  placeholder,
  value,
  onChange,
}: {
  ariaLabel: string
  className: string
  options: Array<{ value: string; label: string; disabled?: boolean }>
  placeholder?: string
  value: string
  onChange: (value: string) => void
}) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const selectedOption = options.find((option) => option.value === value) ?? null
  const visibleLabel = selectedOption?.label ?? placeholder ?? ''

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleWindowBlur() {
      setIsOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [])

  function commitSelection(nextValue: string) {
    setIsOpen(false)

    if (nextValue !== value) {
      onChange(nextValue)
    }
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setIsOpen(true)
      return
    }

    if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  function handleOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    nextValue: string,
    disabled = false,
  ) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setIsOpen(false)
      return
    }

    if (disabled) {
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      commitSelection(nextValue)
    }
  }

  return (
    <div ref={rootRef} className={`topbar__select ${className}`} data-open={isOpen ? 'true' : undefined}>
      <button
        type="button"
        role="combobox"
        className="topbar__select-trigger"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="topbar__select-value">{visibleLabel}</span>
        <span className="topbar__select-chevron" aria-hidden="true">
          <svg viewBox="0 0 16 16" focusable="false">
            <path
              d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
              fill="currentColor"
            />
          </svg>
        </span>
      </button>

      {isOpen ? (
        <div className="topbar__select-popover">
          <div id={listboxId} role="listbox" aria-label={ariaLabel} className="topbar__select-listbox">
            {options.map((option) => {
              const isSelected = option.value === value

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  className="topbar__select-option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onClick={() => {
                    if (!option.disabled) {
                      commitSelection(option.value)
                    }
                  }}
                  onKeyDown={(event) => handleOptionKeyDown(event, option.value, option.disabled)}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function TopBar({
  projects,
  activeProjectId,
  profileIds,
  activeProfileId,
  tabs,
  activeTabId,
  canManageService = false,
  isServiceActionPending = false,
  mode,
  regularViewState,
  statusMessage,
  saveIndicator,
  onConnectProject,
  onProjectChange,
  onProfileChange,
  onModeChange,
  onToggleRegularLock,
  onTabSelect,
  onTabClose,
  onRestartService,
  onStopService,
}: TopBarProps) {
  const isRegularMode = mode === 'regular'
  const isLockActionPending =
    regularViewState === 'unlocking' || regularViewState === 'locking'
  const isUnlocked = regularViewState === 'editable' || regularViewState === 'locking'
  const lockButtonLabel = isUnlocked ? '锁定' : '解锁'
  const projectOptions = [
    { value: '', label: '选择项目', disabled: true },
    ...projects.map((project) => ({ value: project.id, label: project.name })),
  ]
  const profileOptions = profileIds.map((profileId) => ({ value: profileId, label: profileId }))

  return (
    <header className="topbar" role="banner">
      <span className="topbar__sr-status">{statusMessage ?? '等待载入项目'}</span>
      <span className="topbar__sr-status">{`状态：${statusMessage ?? '等待载入项目'}`}</span>
      <span className="topbar__sr-status">{`保存：${saveIndicator ?? '未打开文档'}`}</span>
      <div className="topbar__group topbar__group--start">
        <TopBarSelect
          ariaLabel="项目切换"
          className="topbar__field topbar__field--project"
          options={projectOptions}
          placeholder="选择项目"
          value={activeProjectId ?? ''}
          onChange={onProjectChange}
        />

        <button
          type="button"
          className="topbar__action"
          aria-label="接入项目"
          title="接入项目"
          onClick={onConnectProject}
        >
          <span className="topbar__icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" focusable="false">
              <path
                d="M7.25 2.75a.75.75 0 0 1 1.5 0v4.5H13.25a.75.75 0 0 1 0 1.5H8.75v4.5a.75.75 0 0 1-1.5 0V8.75H2.75a.75.75 0 0 1 0-1.5h4.5Z"
                fill="currentColor"
              />
            </svg>
          </span>
        </button>
      </div>

      <div className="topbar__center">
        <div className="topbar__tabstrip" role="tablist" aria-label="打开的文档标签">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const isDirty = tab.saveState !== 'clean'
            const tabStateLabel =
              tab.saveState === 'save_failed_retryable' || tab.saveState === 'conflict_hard'
                ? `异常${tab.saveErrorMessage ? `：${tab.saveErrorMessage}` : ''}`
                : isDirty
                  ? '未保存'
                  : '已保存'

            return (
              <div
                key={tab.id}
                className="topbar__tab"
                data-active={isActive ? 'true' : undefined}
                data-editable={isActive && isUnlocked && isRegularMode ? 'true' : undefined}
                title={`${tab.documentPath}\n${tabStateLabel}`}
              >
                <button
                  type="button"
                  role="tab"
                  className="topbar__tab-button"
                  aria-selected={isActive}
                  aria-controls={undefined}
                  onClick={() => onTabSelect(tab.id)}
                >
                  <span
                    className="topbar__tab-state"
                    data-state={tab.saveState}
                    aria-hidden="true"
                  />
                  <span className="topbar__tab-label">{tab.title}</span>
                </button>
                <button
                  type="button"
                  className="topbar__tab-close"
                  aria-label={`关闭标签：${tab.title}`}
                  onClick={() => onTabClose(tab.id)}
                >
                  <svg viewBox="0 0 16 16" focusable="false">
                    <path
                      d="M4.22 4.22a.75.75 0 0 1 1.06 0L8 6.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L9.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 1 1-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 0 1 0-1.06Z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="topbar__group topbar__group--end">
        <TopBarSelect
          ariaLabel="Profile 切换"
          className="topbar__field topbar__field--profile"
          options={profileOptions}
          value={activeProfileId}
          onChange={onProfileChange}
        />

        <div className="topbar__actions-fixed">
          <div className="topbar__mode-cluster">
            {isRegularMode ? (
              <button
                type="button"
                className="topbar__lock-toggle"
                aria-pressed={isUnlocked}
                aria-label={lockButtonLabel}
                title={lockButtonLabel}
                disabled={isLockActionPending}
                onPointerEnter={preloadVisualMarkdownEditor}
                onFocus={preloadVisualMarkdownEditor}
                onClick={onToggleRegularLock}
              >
                <span className="topbar__lock-icon" aria-hidden="true">
                  {isUnlocked ? (
                    <svg viewBox="0 0 16 16" focusable="false">
                      <path
                        d="M11.5 6a1.5 1.5 0 0 1 1.5 1.5v4A2.5 2.5 0 0 1 10.5 14h-5A2.5 2.5 0 0 1 3 11.5v-4A1.5 1.5 0 0 1 4.5 6h4.75V4.75a1.75 1.75 0 0 0-3.192-.978.75.75 0 1 1-1.284-.776A3.25 3.25 0 0 1 10.75 4.75V6h.75Z"
                        fill="currentColor"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" focusable="false">
                      <path
                        d="M11.25 6H10.5V4.75a2.5 2.5 0 0 0-5 0V6h-.75A1.75 1.75 0 0 0 3 7.75v4.5A1.75 1.75 0 0 0 4.75 14h6.5A1.75 1.75 0 0 0 13 12.25v-4.5A1.75 1.75 0 0 0 11.25 6ZM7 4.75a1 1 0 1 1 2 0V6H7V4.75Z"
                        fill="currentColor"
                      />
                    </svg>
                  )}
                </span>
              </button>
            ) : null}

            <div className="topbar__modes" role="group" aria-label="模式切换">
              {(Object.keys(MODE_LABELS) as WorkspaceMode[]).map((nextMode) => (
                <button
                  key={nextMode}
                  type="button"
                  className="topbar__mode"
                  aria-pressed={mode === nextMode}
                  aria-label={MODE_LABELS[nextMode]}
                  title={MODE_LABELS[nextMode]}
                  onPointerEnter={nextMode === 'regular' ? preloadVisualMarkdownEditor : undefined}
                  onFocus={nextMode === 'regular' ? preloadVisualMarkdownEditor : undefined}
                  onClick={() => onModeChange(nextMode)}
                >
                  <span className="topbar__icon" aria-hidden="true">
                    {nextMode === 'regular' ? (
                      <svg viewBox="0 0 16 16" focusable="false">
                        <path
                          d="M3.75 3A1.75 1.75 0 0 0 2 4.75v6.5C2 12.216 2.784 13 3.75 13h8.5A1.75 1.75 0 0 0 14 11.25v-6.5A1.75 1.75 0 0 0 12.25 3h-8.5Zm0 1.5h8.5a.25.25 0 0 1 .25.25v6.5a.25.25 0 0 1-.25.25h-8.5a.25.25 0 0 1-.25-.25v-6.5a.25.25 0 0 1 .25-.25Z"
                          fill="currentColor"
                        />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 16 16" focusable="false">
                        <path
                          d="M2 4.75C2 3.784 2.784 3 3.75 3h8.5C13.216 3 14 3.784 14 4.75v6.5c0 .966-.784 1.75-1.75 1.75h-8.5A1.75 1.75 0 0 1 2 11.25v-6.5Zm1.5 0v6.5c0 .138.112.25.25.25h3.5v-7H3.75a.25.25 0 0 0-.25.25Zm5.25 6.75h3.5a.25.25 0 0 0 .25-.25v-6.5a.25.25 0 0 0-.25-.25h-3.5v7Z"
                          fill="currentColor"
                        />
                      </svg>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>

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
              <span className="topbar__icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" focusable="false">
                  <path
                    d="M8 2.5a5.5 5.5 0 0 1 4.694 2.63V3.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1 0-1.5h1.875A4 4 0 1 0 12 10a.75.75 0 0 1 1.5.14A5.5 5.5 0 1 1 8 2.5Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
            </button>
            <button
              type="button"
              className="topbar__service-button"
              aria-label="关闭服务"
              title="关闭服务"
              disabled={isServiceActionPending}
              onClick={onStopService}
            >
              <span className="topbar__icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" focusable="false">
                  <path
                    d="M8 1.75a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-1.5 0v-5A.75.75 0 0 1 8 1.75Zm3.736 1.288a.75.75 0 0 1 1.03.274A6 6 0 1 1 3.234 3.31a.75.75 0 0 1 1.304.742 4.5 4.5 0 1 0 6.924-.014.75.75 0 0 1 .274-1.03Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
            </button>
          </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
