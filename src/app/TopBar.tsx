import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import {
  ChevronDown,
  Lock,
  LockOpen,
  PanelTop,
  Plus,
  Power,
  RotateCw,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react'

import type { ProjectRegistryRecord } from '../workspace/registry'
import { preloadVisualMarkdownEditor } from '../editor/visual-markdown-editor'
import type { TabSaveState } from '../workspace/workspace-session'
import type { PageWidthMode } from '../workspace/profile-store'

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
  documentFontSize?: number
  documentPageWidth?: PageWidthMode
  onDocumentFontSizeChange?: (fontSize: number) => void
  onDocumentPageWidthChange?: (pageWidth: PageWidthMode) => void
}

const MODE_LABELS: Record<WorkspaceMode, string> = {
  regular: '常规',
  split: '分栏',
}

const FONT_SIZE_OPTIONS = [14, 15, 16, 17, 18] as const
const PAGE_WIDTH_OPTIONS: Array<{ value: PageWidthMode; label: string }> = [
  { value: 'narrow', label: '窄版' },
  { value: 'wide', label: '宽版' },
]

function TopBarReadingPreferences({
  fontSize,
  pageWidth,
  onFontSizeChange,
  onPageWidthChange,
}: {
  fontSize: number
  pageWidth: PageWidthMode
  onFontSizeChange?: (fontSize: number) => void
  onPageWidthChange?: (pageWidth: PageWidthMode) => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)

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

  return (
    <div ref={rootRef} className="topbar__reading-preferences" data-open={isOpen ? 'true' : undefined}>
      <button
        type="button"
        className="topbar__service-button"
        aria-label="阅读选项"
        title="阅读选项"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="topbar__icon" aria-hidden="true">
          <SlidersHorizontal />
        </span>
      </button>

      {isOpen ? (
        <div className="topbar__reading-popover" role="group" aria-label="阅读偏好">
          <section className="topbar__reading-section" aria-label="默认字体大小">
            <p className="topbar__reading-label">默认字体大小</p>
            <div className="topbar__reading-options" role="group" aria-label="字体大小选项">
              {FONT_SIZE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="topbar__reading-option"
                  aria-pressed={fontSize === option}
                  onClick={() => onFontSizeChange?.(option)}
                >
                  {option} px
                </button>
              ))}
            </div>
          </section>

          <section className="topbar__reading-section" aria-label="页面宽度">
            <p className="topbar__reading-label">页面宽度</p>
            <div className="topbar__reading-options" role="group" aria-label="页面宽度选项">
              {PAGE_WIDTH_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="topbar__reading-option"
                  aria-pressed={pageWidth === option.value}
                  onClick={() => onPageWidthChange?.(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
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
          <ChevronDown />
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
  documentFontSize = 16,
  documentPageWidth = 'narrow',
  onDocumentFontSizeChange,
  onDocumentPageWidthChange,
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
            <Plus />
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
                  <X />
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
                  {isUnlocked ? <LockOpen /> : <Lock />}
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
                    {nextMode === 'regular' ? <Square /> : <PanelTop />}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {canManageService ? (
          <div className="topbar__service-actions" role="group" aria-label="服务操作">
            <TopBarReadingPreferences
              fontSize={documentFontSize}
              pageWidth={documentPageWidth}
              onFontSizeChange={onDocumentFontSizeChange}
              onPageWidthChange={onDocumentPageWidthChange}
            />
            <button
              type="button"
              className="topbar__service-button"
              aria-label="重启服务"
              title="重启服务"
              disabled={isServiceActionPending}
              onClick={onRestartService}
            >
              <span className="topbar__icon" aria-hidden="true">
                <RotateCw />
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
                <Power />
              </span>
            </button>
          </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
