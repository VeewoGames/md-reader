import { useEffect, useMemo, useRef, useState } from 'react'

import { ActionDialog } from './app/ActionDialog'
import { AppShell } from './app/AppShell'
import type { WorkspaceActionToast } from './app/WorkspaceLayout'
import type { RegularViewState, WorkspaceMode } from './app/TopBar'
import { createBrowserKeyValueStore } from './shared/key-value-store'
import { STORAGE_KEYS } from './shared/storage-keys'
import { buildFileTree, createVisibleFileTree, filterFileTreeByFavorites } from './workspace/file-tree'
import {
  appendNodeToManualOrder,
  applyManualTreeOrder,
  type ManualNodeOrderByParent,
  moveNodeToParentTailInManualOrder,
  normalizeManualNodeOrderByParent,
  reorderManualNodeOrder,
  rewriteManualOrderPaths,
  removeNodeFromManualOrder,
} from './workspace/file-tree-order'
import { createContentHash } from './shared/content-hash'
import type { FileTreeNode } from './workspace/file-tree-types'
import {
  getActiveTab,
  type TabSaveState,
  type WorkspaceSession,
  type WorkspaceTab,
} from './workspace/workspace-session'
import {
  createDirectoryNodeInBridge,
  createDocumentNodeInBridge,
  deleteDocumentNodeInBridge,
  duplicateDocumentNodeInBridge,
  BridgeDocumentConflictError,
  moveDocumentNodeInBridge,
  getDocumentContentFromBridge,
  getProfileFromBridge,
  getFileTreePathsFromBridge,
  getLocalBridgeHealth,
  listProjectsFromBridge,
  listProjectProfilesFromBridge,
  renameDocumentNodeInBridge,
  registerProjectWithBridge,
  restartLocalBridgeService,
  saveProfileToBridge,
  saveDocumentContentToBridge,
  setActiveProjectWithBridge,
  stopLocalBridgeService,
} from './workspace/local-bridge-access'
import { createLocalStateStore } from './workspace/local-state'
import type { WorkspaceLocalState } from './workspace/local-state'
import {
  removePathCollections,
  rewritePathCollections,
  rewriteSessionDocumentPath,
} from './workspace/document-path-mutation'
import {
  createProfileStore,
  type DocumentLineHeight,
  type PageWidthMode,
} from './workspace/profile-store'
import type { ProjectRegistryRecord } from './workspace/registry'
import { createWorkspaceProvider, type WorkspaceSource } from './workspace/workspace-provider'

const storage = createBrowserKeyValueStore()
const profileStore = createProfileStore(storage)
const localStateStore = createLocalStateStore(storage)
const workspaceProvider = createWorkspaceProvider({
  bridge: {
    getHealth: getLocalBridgeHealth,
    listProjects: listProjectsFromBridge,
    registerProject: registerProjectWithBridge,
    setActiveProject: setActiveProjectWithBridge,
    getFileTreePaths: getFileTreePathsFromBridge,
  },
})

const AUTOSAVE_DEBOUNCE_MS = 1200
const MARKDOWN_TITLE_EXTENSION_PATTERN = /\.(md|mdx)$/i

function createTabId(documentPath: string): string {
  return documentPath
}

function formatTabTitle(documentPath: string): string {
  const fileName = documentPath.split('/').at(-1) ?? documentPath
  return fileName.replace(MARKDOWN_TITLE_EXTENSION_PATTERN, '')
}

function createEmptySession(): WorkspaceSession {
  return {
    tabs: [],
    activeTabId: null,
    mode: 'regular',
    regularViewState: 'locked',
  }
}

function createWorkspaceTab(documentPath: string, lastKnownScrollTop = 0): WorkspaceTab {
  return {
    id: createTabId(documentPath),
    documentPath,
    persistedContent: null,
    draftContent: null,
    mtimeMs: null,
    saveState: 'clean',
    saveErrorMessage: null,
    lastKnownScrollTop,
  }
}

function getTabByDocumentPath(session: WorkspaceSession, documentPath: string): WorkspaceTab | null {
  return session.tabs.find((tab) => tab.documentPath === documentPath) ?? null
}

function replaceTab(session: WorkspaceSession, nextTab: WorkspaceTab): WorkspaceSession {
  return {
    ...session,
    tabs: session.tabs.map((tab) => (tab.id === nextTab.id ? nextTab : tab)),
  }
}

function normalizeLocalStateSnapshot(state: {
  openDocumentPaths?: string[]
  activeDocumentPath: string | null
  activeMode: 'regular' | 'split' | 'read' | 'edit'
  regularViewState?: RegularViewState
  tabStateByDocument?: Record<string, { lastKnownScrollTop: number }>
  lastKnownScrollTop?: number
  readingProgressByDocument?: Record<string, number>
}) {
  const openDocumentPaths =
    state.openDocumentPaths ??
    (state.activeDocumentPath ? [state.activeDocumentPath] : [])
  const tabStateByDocument =
    state.tabStateByDocument ??
    (state.activeDocumentPath
      ? {
          [state.activeDocumentPath]: {
            lastKnownScrollTop: state.lastKnownScrollTop ?? 0,
          },
        }
      : {})

  return {
    openDocumentPaths,
    activeDocumentPath: state.activeDocumentPath,
    activeMode: state.activeMode,
    regularViewState: state.regularViewState ?? inferRegularViewStateFromMode(state.activeMode),
    tabStateByDocument,
    readingProgressByDocument: state.readingProgressByDocument ?? {},
  }
}

function reconcileLocalStateWithFileTree(
  state: ReturnType<typeof normalizeLocalStateSnapshot>,
  markdownPaths: string[],
) {
  const availableDocumentPaths = new Set(markdownPaths)
  const nextOpenDocumentPaths = state.openDocumentPaths.filter((path) => availableDocumentPaths.has(path))
  const nextActiveDocumentPath =
    state.activeDocumentPath && availableDocumentPaths.has(state.activeDocumentPath)
      ? state.activeDocumentPath
      : nextOpenDocumentPaths[0] ?? null
  const nextTabStateByDocument = Object.fromEntries(
    Object.entries(state.tabStateByDocument).filter(([path]) => availableDocumentPaths.has(path)),
  )
  const nextReadingProgressByDocument = Object.fromEntries(
    Object.entries(state.readingProgressByDocument).filter(([path]) => availableDocumentPaths.has(path)),
  )
  const changed =
    nextActiveDocumentPath !== state.activeDocumentPath ||
    nextOpenDocumentPaths.length !== state.openDocumentPaths.length ||
    Object.keys(nextTabStateByDocument).length !== Object.keys(state.tabStateByDocument).length ||
    Object.keys(nextReadingProgressByDocument).length !==
      Object.keys(state.readingProgressByDocument).length

  return {
    changed,
    state: {
      ...state,
      openDocumentPaths: nextOpenDocumentPaths,
      activeDocumentPath: nextActiveDocumentPath,
      tabStateByDocument: nextTabStateByDocument,
      readingProgressByDocument: nextReadingProgressByDocument,
    },
  }
}

function isMissingDocumentLoadError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  return (
    error.message.includes('Document not found:') ||
    error.message.includes('missing document:') ||
    error.message.includes('ENOENT:')
  )
}

function removeTab(session: WorkspaceSession, tabId: string): WorkspaceSession {
  return {
    ...session,
    tabs: session.tabs.filter((tab) => tab.id !== tabId),
  }
}

function reorderSessionTabs(
  session: WorkspaceSession,
  nextOrderedTabIds: string[],
): WorkspaceSession {
  const tabById = new Map(session.tabs.map((tab) => [tab.id, tab]))
  const reorderedTabs = nextOrderedTabIds
    .map((id) => tabById.get(id))
    .filter((tab): tab is WorkspaceTab => tab != null)

  if (reorderedTabs.length !== session.tabs.length) {
    return session
  }

  const hasSameOrder = reorderedTabs.every((tab, index) => session.tabs[index]?.id === tab.id)
  if (hasSameOrder) {
    return session
  }

  return {
    ...session,
    tabs: reorderedTabs,
  }
}

function normalizeWorkspaceMode(
  activeMode: 'regular' | 'split' | 'read' | 'edit',
): WorkspaceMode {
  if (activeMode === 'split') {
    return 'split'
  }

  return 'regular'
}

function inferRegularViewStateFromMode(
  activeMode: 'regular' | 'split' | 'read' | 'edit',
): RegularViewState {
  if (activeMode === 'edit') {
    return 'editable'
  }

  return 'locked'
}

function formatSaveErrorMessage(message: string): string {
  return message
}

function getDocumentDirectoryPath(documentPath: string | null): string {
  if (!documentPath || !documentPath.includes('/')) {
    return ''
  }

  return documentPath.split('/').slice(0, -1).join('/')
}

function joinNodePath(directoryPath: string, name: string): string {
  const trimmedName = name.trim()
  return directoryPath ? `${directoryPath}/${trimmedName}` : trimmedName
}

function formatReorderFeedbackMessage(payload: {
  sourcePath: string
  targetPath: string | null
  position: 'before' | 'after' | 'tail'
}) {
  if (payload.position === 'tail' || payload.targetPath == null) {
    return `已调整顺序：${payload.sourcePath} 已移到当前分组末尾`
  }

  return `已调整顺序：${payload.sourcePath} 已排到 ${payload.targetPath} ${
    payload.position === 'before' ? '之前' : '之后'
  }`
}

type PendingWorkspaceAction =
  | { kind: 'switch-project'; projectId: string }
  | { kind: 'switch-profile'; profileId: string }
  | { kind: 'restart-service' }
  | { kind: 'stop-service' }

type PendingCloseTabAction = {
  kind: 'close-tab'
  tabId: string
}

type PendingDeleteDocumentAction = {
  kind: 'delete-document'
  documentPath: string
}

type PendingCreateNodeAction = {
  kind: 'document' | 'directory'
  directoryPath: string
  defaultName: string
}

function getSaveIndicator(
  activeTab: WorkspaceTab | null,
): string | null {
  if (activeTab == null) {
    return null
  }

  switch (activeTab.saveState) {
    case 'typing':
      return '输入中…'
    case 'save_queued':
      return '等待保存…'
    case 'saving_background':
      return '正在后台保存…'
    case 'leaving_with_pending_flush':
      return '正在保存后切换…'
    case 'save_failed_retryable':
      return `保存失败${activeTab.saveErrorMessage ? `：${activeTab.saveErrorMessage}` : ''}`
    case 'conflict_hard':
      return `正文冲突${activeTab.saveErrorMessage ? `：${activeTab.saveErrorMessage}` : ''}`
    case 'clean':
    default:
      return '已保存'
  }
}

function App() {
  const [projects, setProjects] = useState<ProjectRegistryRecord[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [profileIds, setProfileIds] = useState(['default'])
  const [activeProfileId, setActiveProfileId] = useState('default')
  const [session, setSession] = useState<WorkspaceSession>(createEmptySession)
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([])
  const [hiddenPaths, setHiddenPaths] = useState<string[]>([])
  const [favoritePaths, setFavoritePaths] = useState<string[]>([])
  const [manualNodeOrderByParent, setManualNodeOrderByParent] = useState<ManualNodeOrderByParent>({})
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [showHiddenItems, setShowHiddenItems] = useState(false)
  const [isDocumentLoading, setIsDocumentLoading] = useState(false)
  const [workspaceSource, setWorkspaceSource] = useState<WorkspaceSource>('offline')
  const [isServiceActionPending, setIsServiceActionPending] = useState(false)
  const [pendingWorkspaceAction, setPendingWorkspaceAction] = useState<PendingWorkspaceAction | null>(null)
  const [pendingCloseTabAction, setPendingCloseTabAction] = useState<PendingCloseTabAction | null>(null)
  const [pendingDeleteDocumentAction, setPendingDeleteDocumentAction] =
    useState<PendingDeleteDocumentAction | null>(null)
  const [pendingCreateNodeAction, setPendingCreateNodeAction] = useState<PendingCreateNodeAction | null>(null)
  const [pendingCreateNodeName, setPendingCreateNodeName] = useState('')
  const [statusMessage, setStatusMessage] = useState<string | null>('正在恢复工作区…')
  const [actionToast, setActionToast] = useState<WorkspaceActionToast | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [outlineWidth, setOutlineWidth] = useState(320)
  const [expandedFileNodes, setExpandedFileNodes] = useState<string[]>([])
  const [hasPersistedExpandedFileNodes, setHasPersistedExpandedFileNodes] = useState(false)
  const [documentFontSize, setDocumentFontSize] = useState(16)
  const [documentPageWidth, setDocumentPageWidth] = useState<PageWidthMode>('narrow')
  const [documentLineHeight, setDocumentLineHeight] = useState<DocumentLineHeight>(1.6)
  const [isWorkspaceBootstrapping, setIsWorkspaceBootstrapping] = useState(true)
  const activeTab = getActiveTab(session)
  const mode = session.mode
  const regularViewState = session.regularViewState
  const currentDocumentPath = activeTab?.documentPath ?? null
  const currentDocumentContent = activeTab?.persistedContent ?? null
  const editingDocumentContent = activeTab?.draftContent ?? null
  const currentDocumentMtimeMs = activeTab?.mtimeMs ?? null
  const saveState = activeTab?.saveState ?? 'clean'
  const { visibleNodes: visibleAfterHidden, availableDirectoryPaths } = useMemo(
    () =>
      createVisibleFileTree({
        sourceNodes: fileTree,
        hiddenPaths,
        showHiddenItems,
      }),
    [fileTree, hiddenPaths, showHiddenItems],
  )
  const visibleFileTree = useMemo(
    () =>
      showFavoritesOnly
        ? filterFileTreeByFavorites(visibleAfterHidden, favoritePaths)
        : visibleAfterHidden,
    [favoritePaths, showFavoritesOnly, visibleAfterHidden],
  )
  const autosaveTimerRef = useRef<number | null>(null)
  const actionToastTimerRef = useRef<number | null>(null)
  const flushPromiseRef = useRef<Promise<boolean> | null>(null)
  const activeProjectIdRef = useRef<string | null>(null)
  const activeProfileIdRef = useRef(activeProfileId)
  const sessionRef = useRef(session)
  const currentDocumentPathRef = useRef<string | null>(null)
  const currentDocumentContentRef = useRef<string | null>(null)
  const editingDocumentContentRef = useRef<string | null>(null)
  const currentDocumentMtimeRef = useRef<number | null>(null)
  const saveStateRef = useRef<TabSaveState>('clean')
  const draftRevisionRef = useRef(0)
  const saveRequestRevisionRef = useRef(0)
  const lastAckedSaveRevisionRef = useRef(0)
  const isComposingRef = useRef(false)
  const hasHydratedActiveProfileRef = useRef(false)
  const actionToastIdRef = useRef(0)

  function clearSaveFailureStatus(projectId: string | null) {
    setStatusMessage((current) => {
      if (!current?.startsWith('保存失败：')) {
        return current
      }

      const projectName =
        projectId == null ? null : projects.find((entry) => entry.id === projectId)?.name ?? '当前项目'

      return projectName ? `当前项目：${projectName}` : current
    })
  }

  function buildOrderedFileTree(markdownPaths: string[], orderMap: ManualNodeOrderByParent) {
    return applyManualTreeOrder(buildFileTree(markdownPaths), orderMap)
  }

  async function persistManualNodeOrder(
    nextManualNodeOrderByParent: ManualNodeOrderByParent,
    options?: {
      refreshPaths?: string[]
    },
  ) {
    setManualNodeOrderByParent(nextManualNodeOrderByParent)

    const nextPaths = options?.refreshPaths
    if (nextPaths) {
      setFileTree(buildOrderedFileTree(nextPaths, nextManualNodeOrderByParent))
    }

    await saveActiveProfileNavigation({
      manualNodeOrderByParent: nextManualNodeOrderByParent,
    })
  }

  function clearActionToastTimer() {
    if (actionToastTimerRef.current != null) {
      window.clearTimeout(actionToastTimerRef.current)
      actionToastTimerRef.current = null
    }
  }

  function showActionToast(message: string, tone: WorkspaceActionToast['tone'] = 'success') {
    actionToastIdRef.current += 1
    setActionToast({
      id: actionToastIdRef.current,
      message,
      tone,
    })
  }

  function publishActionFeedback(
    message: string,
    tone: WorkspaceActionToast['tone'] = 'success',
    statusOverride?: string,
  ) {
    setStatusMessage(statusOverride ?? message)
    showActionToast(message, tone)
  }

  function getDirtyTabs(nextSession = sessionRef.current): WorkspaceTab[] {
    return nextSession.tabs.filter(
      (tab) => tab.persistedContent != null && tab.draftContent != null && tab.draftContent !== tab.persistedContent,
    )
  }

  function clearAutosaveTimer() {
    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
  }

  function discardTabDraft(tabId: string) {
    setSession((current) => {
      const tab = current.tabs.find((entry) => entry.id === tabId)

      if (tab == null || tab.persistedContent == null) {
        return current
      }

      return replaceTab(current, {
        ...tab,
        draftContent: tab.persistedContent,
        saveState: 'clean',
        saveErrorMessage: null,
      })
    })
  }

  function discardDirtyTabs(tabIds: string[]) {
    setSession((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tabIds.includes(tab.id) && tab.persistedContent != null
          ? {
              ...tab,
              draftContent: tab.persistedContent,
              saveState: 'clean',
              saveErrorMessage: null,
            }
          : tab,
      ),
    }))
  }

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId
  }, [activeProjectId])

  useEffect(() => {
    activeProfileIdRef.current = activeProfileId
  }, [activeProfileId])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    currentDocumentPathRef.current = currentDocumentPath
  }, [currentDocumentPath])

  useEffect(() => {
    currentDocumentContentRef.current = currentDocumentContent
  }, [currentDocumentContent])

  useEffect(() => {
    editingDocumentContentRef.current = editingDocumentContent
  }, [editingDocumentContent])

  useEffect(() => {
    currentDocumentMtimeRef.current = currentDocumentMtimeMs
  }, [currentDocumentMtimeMs])

  useEffect(() => {
    saveStateRef.current = saveState
  }, [saveState])

  useEffect(() => {
    void (async () => {
      const restoredActiveProfileId =
        (await storage.getItem<string>(STORAGE_KEYS.activeProfile())) ?? 'default'
      hasHydratedActiveProfileRef.current = true
      setActiveProfileId(restoredActiveProfileId)

      const source = await workspaceProvider.getSource()
      setWorkspaceSource(source)

      if (source === 'local-service') {
        const health = await getLocalBridgeHealth()
        const snapshot = await workspaceProvider.listProjects(restoredActiveProfileId)
        setProjects(snapshot.projects)
        setActiveProjectId(snapshot.activeProjectId)
        setProfileIds(
          restoredActiveProfileId === 'default'
            ? ['default']
            : Array.from(new Set(['default', restoredActiveProfileId])),
        )

        if (!snapshot.activeProjectId) {
          setStatusMessage(
            health.projectsLoaded > 0
              ? '本地服务已连接，但当前 profile 还没有激活项目'
              : '本地服务已连接，等待接入 Markdown 项目',
          )
          return
        }

        await loadLocalServiceProject(
          snapshot.activeProjectId,
          snapshot.projects,
          restoredActiveProfileId,
        )
        setIsWorkspaceBootstrapping(false)
        return
      }

      setProjects([])
      setActiveProjectId(null)
      setFileTree([])
      resetSessionState()
      setStatusMessage('本地服务不可用')
      setIsWorkspaceBootstrapping(false)
    })()
  }, [])

  useEffect(() => {
    if (actionToast == null) {
      clearActionToastTimer()
      return
    }

    clearActionToastTimer()
    actionToastTimerRef.current = window.setTimeout(() => {
      setActionToast((current) => (current?.id === actionToast.id ? null : current))
      actionToastTimerRef.current = null
    }, 2600)

    return () => {
      clearActionToastTimer()
    }
  }, [actionToast])

  useEffect(() => {
    if (!hasHydratedActiveProfileRef.current) {
      return
    }

    void storage.setItem(STORAGE_KEYS.activeProfile(), activeProfileId)
  }, [activeProfileId])

  useEffect(() => {
    if (!activeProjectId) {
      setProfileIds(
        activeProfileId === 'default'
          ? ['default']
          : Array.from(new Set(['default', activeProfileId])),
      )
      setSidebarWidth(280)
      setOutlineWidth(320)
      setExpandedFileNodes([])
      setHasPersistedExpandedFileNodes(false)
      setHiddenPaths([])
      setFavoritePaths([])
      setManualNodeOrderByParent({})
      setShowFavoritesOnly(false)
      setShowHiddenItems(false)
      setDocumentFontSize(16)
      setDocumentPageWidth('narrow')
      setDocumentLineHeight(1.6)
      return
    }

    let cancelled = false

    void (async () => {
      const profile =
        workspaceSource === 'local-service'
          ? await getProfileFromBridge(activeProjectId, activeProfileId, activeProfileId)
          : await profileStore.getProfile(activeProjectId, activeProfileId)
      const nextProfileIds =
        workspaceSource === 'local-service'
          ? (await listProjectProfilesFromBridge(activeProjectId, activeProfileId)).profileIds
          : ['default']

      if (cancelled) {
        return
      }

      setProfileIds(nextProfileIds)
      setSidebarWidth(profile.layout.sidebarWidth)
      setOutlineWidth(profile.layout.outlineWidth)
      setExpandedFileNodes(profile.navigation?.expandedFileNodes ?? [])
      setHasPersistedExpandedFileNodes(
        profile.navigation?.expandedFileNodesInitialized ?? false,
      )
      setHiddenPaths(profile.navigation?.hiddenPaths ?? [])
      setFavoritePaths(profile.navigation?.favoritePaths ?? [])
      setManualNodeOrderByParent(profile.navigation?.manualNodeOrderByParent ?? {})
      setShowFavoritesOnly(false)
      setShowHiddenItems(false)
      setDocumentFontSize(profile.appearance?.fontSize ?? 16)
      setDocumentPageWidth(profile.appearance?.pageWidth ?? 'narrow')
      setDocumentLineHeight(profile.appearance?.lineHeight ?? 1.6)
    })()

    return () => {
      cancelled = true
    }
  }, [activeProjectId, activeProfileId, workspaceSource])

  useEffect(() => {
    const hasDirtyDraft =
      activeProjectId != null &&
      activeTab != null &&
      activeTab.persistedContent != null &&
      activeTab.draftContent != null &&
      activeTab.draftContent !== activeTab.persistedContent

    if (!hasDirtyDraft) {
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }

      if (
        saveStateRef.current !== 'saving_background' &&
        saveStateRef.current !== 'leaving_with_pending_flush'
      ) {
        setActiveTabState({
          saveErrorMessage: null,
          saveState: 'clean',
        })
      }

      clearSaveFailureStatus(activeProjectId)

      return
    }

    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current)
    }

    if (isComposingRef.current) {
      setActiveTabState({ saveState: 'save_queued' })
      autosaveTimerRef.current = null
      return
    }

    scheduleAutosave()

    return () => {
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [activeProjectId, activeTab])

  useEffect(() => {
    return () => {
      clearActionToastTimer()
    }
  }, [])

  function resetSessionState() {
    draftRevisionRef.current = 0
    saveRequestRevisionRef.current = 0
    lastAckedSaveRevisionRef.current = 0
    isComposingRef.current = false
    setSession((current) => ({
      ...current,
      tabs: [],
      activeTabId: null,
    }))
  }

  function setActiveTabState(nextState: Partial<WorkspaceTab>) {
    setSession((current) => {
      const tab = getActiveTab(current)

      if (tab == null) {
        return current
      }

      const hasActualChange = Object.entries(nextState).some(
        ([key, value]) => tab[key as keyof WorkspaceTab] !== value,
      )

      if (!hasActualChange) {
        return current
      }

      return replaceTab(current, { ...tab, ...nextState })
    })
  }

  function ensureTabExists(documentPath: string, lastKnownScrollTop = 0) {
    setSession((current) => {
      if (getTabByDocumentPath(current, documentPath) != null) {
        return current
      }

      return {
        ...current,
        tabs: [...current.tabs, createWorkspaceTab(documentPath, lastKnownScrollTop)],
      }
    })
  }

  function applyLoadedDocument(
    documentPath: string,
    content: string,
    mtimeMs: number,
    nextStatusMessage: string,
  ) {
    draftRevisionRef.current = 0
    saveRequestRevisionRef.current = 0
    lastAckedSaveRevisionRef.current = 0
    isComposingRef.current = false
    setSession((current) => {
      const existingTab = getTabByDocumentPath(current, documentPath)
      const nextTab: WorkspaceTab = {
        ...(existingTab ?? createWorkspaceTab(documentPath)),
        documentPath,
        persistedContent: content,
        draftContent: content,
        mtimeMs,
        saveState: 'clean',
        saveErrorMessage: null,
      }

      if (existingTab == null) {
        return {
          ...current,
          tabs: [...current.tabs, nextTab],
          activeTabId: nextTab.id,
        }
      }

      return {
        ...replaceTab(current, nextTab),
        activeTabId: nextTab.id,
      }
    })
    setStatusMessage(nextStatusMessage)
  }

  function setDraftDocumentContent(nextContent: string) {
    const savedContent = currentDocumentContentRef.current
    const hasDirtyDraft = savedContent != null && nextContent !== savedContent

    if (hasDirtyDraft) {
      draftRevisionRef.current += 1
    }

    setActiveTabState({
      draftContent: nextContent,
      saveErrorMessage: null,
      saveState: hasDirtyDraft ? 'typing' : 'clean',
    })
  }

  function scheduleAutosave() {
    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current)
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      if (isComposingRef.current) {
        setActiveTabState({ saveState: 'save_queued' })
        autosaveTimerRef.current = null
        return
      }

      void flushActiveDraft('background')
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  function handleEditingCompositionStart() {
    isComposingRef.current = true
  }

  function handleEditingCompositionEnd() {
    isComposingRef.current = false

    const savedContent = currentDocumentContentRef.current
    const draftContent = editingDocumentContentRef.current
    const hasDirtyDraft = savedContent != null && draftContent != null && draftContent !== savedContent

    if (hasDirtyDraft) {
      setActiveTabState({ saveState: 'typing' })
      scheduleAutosave()
    }
  }

  async function saveTabById(
    tabId: string,
    reason: 'background' | 'leave' = 'leave',
  ): Promise<boolean> {
    const projectId = activeProjectIdRef.current
    const profileId = activeProfileIdRef.current
    const tab = sessionRef.current.tabs.find((entry) => entry.id === tabId)

    if (
      !projectId ||
      !profileId ||
      tab == null ||
      tab.draftContent == null ||
      tab.persistedContent == null ||
      tab.draftContent === tab.persistedContent
    ) {
      setSession((current) => {
        const currentTab = current.tabs.find((entry) => entry.id === tabId)
        return currentTab == null
          ? current
          : replaceTab(current, {
              ...currentTab,
              saveState: 'clean',
              saveErrorMessage: null,
            })
      })
      clearSaveFailureStatus(projectId)
      return true
    }

    if (sessionRef.current.activeTabId === tabId) {
      clearAutosaveTimer()
    }

    setSession((current) => {
      const currentTab = current.tabs.find((entry) => entry.id === tabId)
      return currentTab == null
        ? current
        : replaceTab(current, {
            ...currentTab,
            saveState: reason === 'leave' ? 'leaving_with_pending_flush' : 'saving_background',
            saveErrorMessage: null,
          })
    })

    try {
      const document = await saveDocumentContentToBridge(
        projectId,
        profileId,
        tab.documentPath,
        tab.draftContent,
        tab.mtimeMs,
        tab.persistedContent ? createContentHash(tab.persistedContent) : null,
      )

      setSession((current) => {
        const currentTab = current.tabs.find((entry) => entry.id === tabId)

        if (currentTab == null) {
          return current
        }

        const nextDraftContent =
          currentTab.draftContent === tab.draftContent ? document.content : currentTab.draftContent

        return replaceTab(current, {
          ...currentTab,
          persistedContent: document.content,
          draftContent: nextDraftContent,
          mtimeMs: document.mtimeMs,
          saveState: nextDraftContent === document.content ? 'clean' : 'typing',
          saveErrorMessage: null,
        })
      })
      clearSaveFailureStatus(projectId)
      return true
    } catch (error) {
      const message = formatSaveErrorMessage(error instanceof Error ? error.message : '保存失败')

      setSession((current) => {
        const currentTab = current.tabs.find((entry) => entry.id === tabId)
        return currentTab == null
          ? current
          : replaceTab(current, {
              ...currentTab,
              saveState:
                error instanceof BridgeDocumentConflictError
                  ? 'conflict_hard'
                  : 'save_failed_retryable',
              saveErrorMessage: message,
            })
      })
      setStatusMessage(`保存失败：${message}`)
      return false
    }
  }

  async function flushDirtyTabs(tabIds: string[]): Promise<boolean> {
    for (const tabId of tabIds) {
      const isSaved = await saveTabById(tabId, 'leave')
      if (!isSaved) {
        return false
      }
    }

    return true
  }

  async function flushAllDirtyTabs(): Promise<boolean> {
    return flushDirtyTabs(getDirtyTabs().map((tab) => tab.id))
  }

  async function flushActiveDraft(reason: 'background' | 'leave' = 'leave'): Promise<boolean> {
    if (flushPromiseRef.current) {
      return flushPromiseRef.current
    }

    const projectId = activeProjectIdRef.current
    const profileId = activeProfileIdRef.current
    const documentPath = currentDocumentPathRef.current
    const savedContent = currentDocumentContentRef.current
    const draftContent = editingDocumentContentRef.current
    const expectedMtimeMs = currentDocumentMtimeRef.current

    if (!projectId || !documentPath || draftContent == null || draftContent === savedContent) {
      setActiveTabState({
        saveErrorMessage: null,
        saveState: 'clean',
      })
      clearSaveFailureStatus(projectId)
      return true
    }

    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }

    setActiveTabState({
      saveState: reason === 'leave' ? 'leaving_with_pending_flush' : 'saving_background',
      saveErrorMessage: null,
    })

    const flushPromise = (async () => {
      const requestRevision = saveRequestRevisionRef.current + 1
      saveRequestRevisionRef.current = requestRevision
      const expectedContentHash = savedContent == null ? null : createContentHash(savedContent)

      const applySavedDocument = (document: {
        content: string
        mtimeMs: number
      }) => {
        if (requestRevision <= lastAckedSaveRevisionRef.current) {
          return
        }

        lastAckedSaveRevisionRef.current = requestRevision
        const isSameDocument =
          activeProjectIdRef.current === projectId && currentDocumentPathRef.current === documentPath

        if (isSameDocument) {
          setActiveTabState({
            persistedContent: document.content,
            mtimeMs: document.mtimeMs,
            saveErrorMessage: null,
            saveState: editingDocumentContentRef.current === document.content ? 'clean' : 'typing',
          })
          clearSaveFailureStatus(projectId)
        }
      }

      try {
        let document

        try {
          document = await saveDocumentContentToBridge(
            projectId,
            profileId,
            documentPath,
            draftContent,
            expectedMtimeMs,
            expectedContentHash,
          )
        } catch (error) {
          if (!(error instanceof BridgeDocumentConflictError)) {
            throw error
          }
          throw error
        }

        applySavedDocument(document)
        return true
      } catch (error) {
        if (
          requestRevision < saveRequestRevisionRef.current ||
          requestRevision <= lastAckedSaveRevisionRef.current
        ) {
          return false
        }

        const message = formatSaveErrorMessage(error instanceof Error ? error.message : '保存失败')
        setActiveTabState({
          saveErrorMessage: message,
          saveState:
            error instanceof BridgeDocumentConflictError ? 'conflict_hard' : 'save_failed_retryable',
        })
        setStatusMessage(`保存失败：${message}`)
        return false
      } finally {
        flushPromiseRef.current = null
      }
    })()

    flushPromiseRef.current = flushPromise
    return flushPromise
  }

  async function loadLocalServiceProject(
    projectId: string,
    nextProjects = projects,
    nextProfileId = activeProfileId,
  ) {
    const project = nextProjects.find((entry) => entry.id === projectId)

    if (!project) {
      setActiveProjectId(null)
      setFileTree([])
      resetSessionState()
      setStatusMessage('当前 profile 还没有接入任何项目')
      return
    }

    const markdownPaths = await workspaceProvider.getFileTreePaths(project.id, nextProfileId)
    const profile = await getProfileFromBridge(project.id, nextProfileId, nextProfileId)
    const restoredLocalState = normalizeLocalStateSnapshot(
      (await localStateStore.getState(project.id)) as Awaited<
        ReturnType<typeof localStateStore.getState>
      > & { activeMode: 'regular' | 'split' | 'read' | 'edit'; lastKnownScrollTop?: number },
    )
    const { state: localState, changed: localStateChanged } = reconcileLocalStateWithFileTree(
      restoredLocalState,
      markdownPaths,
    )
    const openDocumentPaths = localState.openDocumentPaths
    const tabStateByDocument = localState.tabStateByDocument
    const tabs = openDocumentPaths.map(
      (documentPath) =>
        createWorkspaceTab(
          documentPath,
          tabStateByDocument[documentPath]?.lastKnownScrollTop ?? 0,
        ),
    )
    const nextActiveDocumentPath =
      localState.activeDocumentPath &&
      openDocumentPaths.includes(localState.activeDocumentPath)
        ? localState.activeDocumentPath
        : openDocumentPaths[0] ?? null
    const restoredSession: WorkspaceSession = {
      tabs,
      activeTabId: nextActiveDocumentPath ? createTabId(nextActiveDocumentPath) : null,
      mode: normalizeWorkspaceMode(localState.activeMode),
      regularViewState:
        localState.regularViewState ?? inferRegularViewStateFromMode(localState.activeMode),
    }

    setActiveProjectId(project.id)
    setManualNodeOrderByParent(profile.navigation?.manualNodeOrderByParent ?? {})
    setFileTree(buildOrderedFileTree(markdownPaths, profile.navigation?.manualNodeOrderByParent ?? {}))
    sessionRef.current = restoredSession
    setSession(restoredSession)
    setStatusMessage(
      markdownPaths.length > 0 ? `当前项目：${project.name}` : `当前项目：${project.name}，但还没有发现 Markdown 文件`,
    )

    if (localStateChanged) {
      await localStateStore.saveState(project.id, {
        ...localState,
        activeMode: normalizeWorkspaceMode(localState.activeMode),
        regularViewState:
          localState.regularViewState ?? inferRegularViewStateFromMode(localState.activeMode),
      })
    }

    if (nextActiveDocumentPath) {
      await loadDocumentContent(project, nextActiveDocumentPath, nextProfileId)
    } else {
      resetSessionState()
    }
  }

  async function restoreLocalServiceWorkspace(profileId: string) {
    const health = await getLocalBridgeHealth()
    const snapshot = await workspaceProvider.listProjects(profileId)

    setWorkspaceSource('local-service')
    setProjects(snapshot.projects)
    setActiveProjectId(snapshot.activeProjectId)

    if (!snapshot.activeProjectId) {
      setStatusMessage(
        health.projectsLoaded > 0
          ? '本地服务已连接，但当前 profile 还没有激活项目'
          : '本地服务已连接，等待接入 Markdown 项目',
      )
      return
    }

    await loadLocalServiceProject(snapshot.activeProjectId, snapshot.projects, profileId)
  }

  async function handleConnectProject() {
    if (workspaceSource !== 'local-service') {
      setStatusMessage('本地服务不可用')
      return
    }

    const rootPath = window.prompt('输入要接入的项目根目录', 'C:\\Code\\Nocturnel')?.trim()

    if (!rootPath) {
      return
    }

    const project = await workspaceProvider.registerProject(activeProfileId, rootPath)
    await workspaceProvider.setActiveProject(activeProfileId, project.id)

    const snapshot = await workspaceProvider.listProjects(activeProfileId)
    setProjects(snapshot.projects)
    await loadLocalServiceProject(project.id, snapshot.projects, activeProfileId)
  }

  async function closeTabInternal(tabId: string) {
    if (!activeProjectIdRef.current) {
      return
    }

    const currentSession = sessionRef.current
    const closingIndex = currentSession.tabs.findIndex((tab) => tab.id === tabId)
    const closingTab = closingIndex >= 0 ? currentSession.tabs[closingIndex] : null

    if (closingTab == null) {
      return
    }

    const remainingTabs = currentSession.tabs.filter((tab) => tab.id !== tabId)
    const fallbackTab =
      closingTab.id !== currentSession.activeTabId
        ? getActiveTab(currentSession)
        : remainingTabs[Math.max(0, closingIndex - 1)] ?? remainingTabs[0] ?? null

    setSession((current) => {
      const nextSession = removeTab(current, tabId)

      return {
        ...nextSession,
        activeTabId:
          current.activeTabId === tabId ? (fallbackTab?.id ?? null) : current.activeTabId,
      }
    })

    if (fallbackTab && fallbackTab.persistedContent == null) {
      const project = projects.find((entry) => entry.id === activeProjectIdRef.current)
      if (project) {
        await loadDocumentContent(project, fallbackTab.documentPath, activeProfileIdRef.current)
      }
    }

    const localState = normalizeLocalStateSnapshot(
      (await localStateStore.getState(activeProjectIdRef.current)) as Awaited<
        ReturnType<typeof localStateStore.getState>
      > & { activeMode: 'regular' | 'split' | 'read' | 'edit'; lastKnownScrollTop?: number },
    )
    await localStateStore.saveState(activeProjectIdRef.current, {
      ...localState,
      openDocumentPaths: remainingTabs.map((tab) => tab.documentPath),
      activeDocumentPath: fallbackTab?.documentPath ?? null,
      activeMode: sessionRef.current.mode,
      regularViewState: sessionRef.current.regularViewState,
    })
  }

  async function continueWorkspaceAction(action: PendingWorkspaceAction) {
    if (action.kind === 'switch-project') {
      await workspaceProvider.setActiveProject(activeProfileIdRef.current, action.projectId)
      await loadLocalServiceProject(action.projectId)
      return
    }

    if (action.kind === 'switch-profile') {
      setActiveProfileId(action.profileId)

      if (workspaceSource !== 'local-service') {
        setProjects([])
        setActiveProjectId(null)
        setFileTree([])
        resetSessionState()
        setStatusMessage('本地服务不可用')
        return
      }

      const snapshot = await workspaceProvider.listProjects(action.profileId)
      let nextSnapshot = snapshot

      if (!nextSnapshot.activeProjectId) {
        const currentProject =
          activeProjectIdRef.current == null
            ? null
            : projects.find((entry) => entry.id === activeProjectIdRef.current) ?? null

        if (currentProject?.rootPath) {
          const registeredProject = await workspaceProvider.registerProject(
            action.profileId,
            currentProject.rootPath,
          )
          await workspaceProvider.setActiveProject(action.profileId, registeredProject.id)
          nextSnapshot = await workspaceProvider.listProjects(action.profileId)
        }
      }

      setProjects(nextSnapshot.projects)
      setActiveProjectId(nextSnapshot.activeProjectId)

      if (!nextSnapshot.activeProjectId) {
        setFileTree([])
        resetSessionState()
        setStatusMessage('当前 profile 还没有接入任何项目')
        return
      }

      await loadLocalServiceProject(
        nextSnapshot.activeProjectId,
        nextSnapshot.projects,
        action.profileId,
      )
      return
    }

    if (action.kind === 'restart-service') {
      setIsServiceActionPending(true)
      setStatusMessage('正在重启本地服务…')

      try {
        await restartLocalBridgeService()
        await waitForLocalBridgeReady()
        await restoreLocalServiceWorkspace(activeProfileIdRef.current)
        setStatusMessage('本地服务已重启')
      } catch (error) {
        setWorkspaceSource('offline')
        setStatusMessage(error instanceof Error ? error.message : '本地服务重启失败')
      } finally {
        setIsServiceActionPending(false)
      }
      return
    }

    if (action.kind === 'stop-service') {
      setIsServiceActionPending(true)
      setStatusMessage('正在关闭本地服务…')

      try {
        await stopLocalBridgeService()
        setWorkspaceSource('offline')
        setStatusMessage('本地服务已关闭')
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : '本地服务关闭失败')
      } finally {
        setIsServiceActionPending(false)
      }
    }
  }

  async function handleProjectChange(projectId: string) {
    if (workspaceSource !== 'local-service') {
      setStatusMessage('本地服务不可用')
      return
    }

    if (getDirtyTabs().length > 0) {
      setPendingWorkspaceAction({ kind: 'switch-project', projectId })
      return
    }

    await continueWorkspaceAction({ kind: 'switch-project', projectId })
  }

  async function handleProfileChange(profileId: string) {
    if (getDirtyTabs().length > 0) {
      setPendingWorkspaceAction({ kind: 'switch-profile', profileId })
      return
    }

    await continueWorkspaceAction({ kind: 'switch-profile', profileId })
  }

  async function readNormalizedLocalState(projectId: string): Promise<WorkspaceLocalState> {
    return normalizeLocalStateSnapshot(
      (await localStateStore.getState(projectId)) as Awaited<
        ReturnType<typeof localStateStore.getState>
      > & { activeMode: 'regular' | 'split' | 'read' | 'edit'; lastKnownScrollTop?: number },
    ) as WorkspaceLocalState
  }

  async function readActiveProfile(projectId: string) {
    return workspaceSource === 'local-service'
      ? getProfileFromBridge(projectId, activeProfileIdRef.current, activeProfileIdRef.current)
      : profileStore.getProfile(projectId, activeProfileIdRef.current)
  }

  async function persistActiveProfile(projectId: string, profile: Awaited<ReturnType<typeof readActiveProfile>>) {
    if (workspaceSource === 'local-service') {
      await saveProfileToBridge(projectId, profile, activeProfileIdRef.current)
      return
    }

    await profileStore.saveProfile(projectId, profile)
  }

  async function refreshProjectTree(projectId: string, profileId: string) {
    const markdownPaths = await workspaceProvider.getFileTreePaths(projectId, profileId)
    setFileTree(buildOrderedFileTree(markdownPaths, manualNodeOrderByParent))
    return markdownPaths
  }

  async function purgeMissingDocumentPath(
    project: ProjectRegistryRecord,
    profileId: string,
    documentPath: string,
  ) {
    const currentSession = sessionRef.current
    const closingIndex = currentSession.tabs.findIndex((tab) => tab.documentPath === documentPath)
    const closingTab = closingIndex >= 0 ? currentSession.tabs[closingIndex] : null
    const remainingTabs =
      closingTab == null
        ? currentSession.tabs
        : currentSession.tabs.filter((tab) => tab.documentPath !== documentPath)
    const fallbackTab =
      closingTab == null || closingTab.id !== currentSession.activeTabId
        ? getActiveTab({
            ...currentSession,
            tabs: remainingTabs,
          })
        : remainingTabs[Math.max(0, closingIndex - 1)] ?? remainingTabs[0] ?? null
    const nextSession =
      closingTab == null
        ? currentSession
        : {
            ...removeTab(currentSession, closingTab.id),
            activeTabId:
              currentSession.activeTabId === closingTab.id
                ? (fallbackTab?.id ?? null)
                : currentSession.activeTabId,
          }

    if (closingTab != null) {
      sessionRef.current = nextSession
      setSession(nextSession)
    }

    const localState = normalizeLocalStateSnapshot(
      (await localStateStore.getState(project.id)) as Awaited<
        ReturnType<typeof localStateStore.getState>
      > & { activeMode: 'regular' | 'split' | 'read' | 'edit'; lastKnownScrollTop?: number },
    )
    await localStateStore.saveState(project.id, {
      ...localState,
      openDocumentPaths: remainingTabs.map((tab) => tab.documentPath).filter((path) => path !== documentPath),
      activeDocumentPath:
        fallbackTab?.documentPath ??
        (localState.activeDocumentPath === documentPath ? null : localState.activeDocumentPath),
      activeMode: nextSession.mode,
      regularViewState: nextSession.regularViewState,
      tabStateByDocument: Object.fromEntries(
        Object.entries(localState.tabStateByDocument).filter(([path]) => path !== documentPath),
      ),
      readingProgressByDocument: Object.fromEntries(
        Object.entries(localState.readingProgressByDocument).filter(([path]) => path !== documentPath),
      ),
    })

    if (fallbackTab && fallbackTab.persistedContent == null) {
      await loadDocumentContent(project, fallbackTab.documentPath, profileId)
    }

    await refreshProjectTree(project.id, profileId)
    setStatusMessage(`已移除失效文档：${documentPath}`)
  }

  function resolveDefaultDirectoryPath(preferredDirectoryPath?: string) {
    if (preferredDirectoryPath != null) {
      return preferredDirectoryPath
    }

    return getDocumentDirectoryPath(currentDocumentPathRef.current)
  }

  async function flushDocumentDraftIfNeeded(documentPath: string): Promise<boolean> {
    const tab = sessionRef.current.tabs.find((entry) => entry.documentPath === documentPath)
    if (!tab) {
      return true
    }

    const isDirty =
      tab.persistedContent != null &&
      tab.draftContent != null &&
      tab.draftContent !== tab.persistedContent

    if (!isDirty) {
      return true
    }

    return saveTabById(tab.id, 'leave')
  }

  async function rewriteDocumentPathState(
    sourcePath: string,
    targetPath: string,
    nextManualNodeOrderByParentOverride?: ManualNodeOrderByParent,
  ) {
    const projectId = activeProjectIdRef.current
    if (!projectId) {
      return
    }

    const [localState, profile] = await Promise.all([
      readNormalizedLocalState(projectId),
      readActiveProfile(projectId),
    ])
    const nextCollections = rewritePathCollections({
      localState,
      profile,
      sourcePath,
      targetPath,
    })
    const nextProfile = nextManualNodeOrderByParentOverride
      ? {
          ...nextCollections.profile,
          navigation: {
            ...nextCollections.profile.navigation,
            manualNodeOrderByParent: nextManualNodeOrderByParentOverride,
          },
        }
      : nextCollections.profile

    setSession((current) => rewriteSessionDocumentPath(current, sourcePath, targetPath))
    setHiddenPaths(nextProfile.navigation.hiddenPaths)
    setFavoritePaths(nextProfile.navigation.favoritePaths)
    setManualNodeOrderByParent(nextProfile.navigation.manualNodeOrderByParent)

    await Promise.all([
      localStateStore.saveState(projectId, {
        ...nextCollections.localState,
        activeMode: sessionRef.current.mode,
        regularViewState: sessionRef.current.regularViewState,
      }),
      persistActiveProfile(projectId, nextProfile),
    ])
  }

  async function removeDocumentPathState(documentPath: string) {
    const projectId = activeProjectIdRef.current
    if (!projectId) {
      return
    }

    const [localState, profile] = await Promise.all([
      readNormalizedLocalState(projectId),
      readActiveProfile(projectId),
    ])
    const nextCollections = removePathCollections({
      localState,
      profile,
      targetPath: documentPath,
    })

    setHiddenPaths(nextCollections.profile.navigation.hiddenPaths)
    setFavoritePaths(nextCollections.profile.navigation.favoritePaths)
    setManualNodeOrderByParent(nextCollections.profile.navigation.manualNodeOrderByParent)

    await Promise.all([
      localStateStore.saveState(projectId, {
        ...nextCollections.localState,
        activeMode: sessionRef.current.mode,
        regularViewState: sessionRef.current.regularViewState,
      }),
      persistActiveProfile(projectId, nextCollections.profile),
    ])
  }

  async function handleModeChange(nextMode: WorkspaceMode) {
    setSession((current) => ({ ...current, mode: nextMode }))

    if (!activeProjectId) {
      return
    }

    await localStateStore.saveState(activeProjectId, {
      ...normalizeLocalStateSnapshot(
        (await localStateStore.getState(activeProjectId)) as Awaited<
          ReturnType<typeof localStateStore.getState>
        > & { activeMode: 'regular' | 'split' | 'read' | 'edit'; lastKnownScrollTop?: number },
      ),
      openDocumentPaths: session.tabs.map((tab) => tab.documentPath),
      activeDocumentPath: currentDocumentPath,
      activeMode: nextMode,
      regularViewState: session.regularViewState,
    })
  }

  async function handleCreateDocument(preferredDirectoryPath?: string) {
    const projectId = activeProjectIdRef.current
    if (!projectId) {
      return
    }

    const directoryPath = resolveDefaultDirectoryPath(preferredDirectoryPath)
    setPendingCreateNodeAction({
      kind: 'document',
      directoryPath,
      defaultName: '未命名文档.md',
    })
    setPendingCreateNodeName('未命名文档.md')
  }

  async function handleCreateDirectory(preferredDirectoryPath?: string) {
    const projectId = activeProjectIdRef.current
    if (!projectId) {
      return
    }

    const directoryPath = resolveDefaultDirectoryPath(preferredDirectoryPath)
    setPendingCreateNodeAction({
      kind: 'directory',
      directoryPath,
      defaultName: '未命名文件夹',
    })
    setPendingCreateNodeName('未命名文件夹')
  }

  function handleCancelCreateNode() {
    setPendingCreateNodeAction(null)
    setPendingCreateNodeName('')
  }

  async function handleConfirmCreateNode() {
    const action = pendingCreateNodeAction
    const projectId = activeProjectIdRef.current
    const profileId = activeProfileIdRef.current
    if (!action || !projectId) {
      handleCancelCreateNode()
      return
    }

    try {
      const nextName = pendingCreateNodeName.trim()
      if (!nextName) {
        return
      }

      const targetPath = joinNodePath(action.directoryPath, nextName)
      if (action.kind === 'document') {
        await createDocumentNodeInBridge(projectId, profileId, targetPath, '')
      } else {
        await createDirectoryNodeInBridge(projectId, profileId, targetPath)
      }

      const nextMarkdownPaths = await workspaceProvider.getFileTreePaths(projectId, profileId)
      const nextManualNodeOrderByParent = appendNodeToManualOrder(manualNodeOrderByParent, targetPath)
      await persistManualNodeOrder(nextManualNodeOrderByParent, {
        refreshPaths: nextMarkdownPaths,
      })
      await handleExpandedFileNodesChange(
        action.kind === 'document'
          ? action.directoryPath && !expandedFileNodes.includes(action.directoryPath)
            ? [...expandedFileNodes, action.directoryPath].sort()
            : expandedFileNodes
          : Array.from(new Set([...expandedFileNodes, action.directoryPath, targetPath].filter(Boolean))).sort(),
      )

      if (action.kind === 'document') {
        await handleDocumentSelect(targetPath)
        publishActionFeedback(`已新建文档：${targetPath}`)
      } else {
        publishActionFeedback(`已新建文件夹：${targetPath}`)
      }

      handleCancelCreateNode()
    } catch (error) {
      publishActionFeedback(
        error instanceof Error
          ? `${action.kind === 'document' ? '新建文档' : '新建文件夹'}失败：${error.message}`
          : `${action.kind === 'document' ? '新建文档' : '新建文件夹'}失败`,
        'error',
      )
    }
  }

  async function handleCopyDocumentLink(documentPath: string) {
    try {
      await navigator.clipboard.writeText(documentPath)
      publishActionFeedback(`已拷贝链接：${documentPath}`)
    } catch (error) {
      publishActionFeedback(
        error instanceof Error ? `拷贝链接失败：${error.message}` : '拷贝链接失败',
        'error',
      )
    }
  }

  async function handleCopyDirectoryPath(directoryPath: string) {
    try {
      await navigator.clipboard.writeText(directoryPath)
      publishActionFeedback(`已拷贝路径：${directoryPath}`)
    } catch (error) {
      publishActionFeedback(
        error instanceof Error ? `拷贝路径失败：${error.message}` : '拷贝路径失败',
        'error',
      )
    }
  }

  async function handleDuplicateDocument(documentPath: string, duplicateName: string) {
    const projectId = activeProjectIdRef.current
    const profileId = activeProfileIdRef.current
    if (!projectId) {
      return false
    }

    try {
      const baseName = documentPath.split('/').at(-1) ?? documentPath
      const trimmedDuplicateName = duplicateName.trim()
      if (!trimmedDuplicateName || trimmedDuplicateName === baseName) {
        return false
      }

      const targetPath = joinNodePath(getDocumentDirectoryPath(documentPath), trimmedDuplicateName)
      await duplicateDocumentNodeInBridge(projectId, profileId, documentPath, targetPath)
      const nextMarkdownPaths = await workspaceProvider.getFileTreePaths(projectId, profileId)
      const nextManualNodeOrderByParent = appendNodeToManualOrder(manualNodeOrderByParent, targetPath)
      await persistManualNodeOrder(nextManualNodeOrderByParent, {
        refreshPaths: nextMarkdownPaths,
      })
      await handleDocumentSelect(targetPath)
      publishActionFeedback(`已创建副本：${targetPath}`)
      return true
    } catch (error) {
      publishActionFeedback(
        error instanceof Error ? `创建副本失败：${error.message}` : '创建副本失败',
        'error',
      )
      return false
    }
  }

  async function handleRenameDocument(documentPath: string, nextName: string) {
    const projectId = activeProjectIdRef.current
    const profileId = activeProfileIdRef.current
    if (!projectId) {
      return false
    }

    try {
      if (!(await flushDocumentDraftIfNeeded(documentPath))) {
        return false
      }

      const currentName = documentPath.split('/').at(-1) ?? documentPath
      const trimmedNextName = nextName.trim()
      if (!trimmedNextName || trimmedNextName === currentName) {
        return false
      }

      const result = await renameDocumentNodeInBridge(projectId, profileId, documentPath, trimmedNextName)
      await rewriteDocumentPathState(documentPath, result.path)
      const nextMarkdownPaths = await workspaceProvider.getFileTreePaths(projectId, profileId)
      setFileTree(
        buildOrderedFileTree(
          nextMarkdownPaths,
          rewriteManualOrderPaths(manualNodeOrderByParent, documentPath, result.path),
        ),
      )
      publishActionFeedback(`已重命名：${currentName} -> ${trimmedNextName}`)
      return true
    } catch (error) {
      publishActionFeedback(
        error instanceof Error ? `重命名失败：${error.message}` : '重命名失败',
        'error',
      )
      return false
    }
  }

  async function handleDeleteDocument(documentPath: string) {
    const projectId = activeProjectIdRef.current
    if (!projectId) {
      return
    }

    setPendingDeleteDocumentAction({
      kind: 'delete-document',
      documentPath,
    })
  }

  function handleCancelDeleteDocument() {
    setPendingDeleteDocumentAction(null)
  }

  async function handleConfirmDeleteDocument() {
    const action = pendingDeleteDocumentAction
    const projectId = activeProjectIdRef.current
    const profileId = activeProfileIdRef.current
    if (!action || !projectId) {
      setPendingDeleteDocumentAction(null)
      return
    }

    try {
      if (!(await flushDocumentDraftIfNeeded(action.documentPath))) {
        return
      }

      const tab = sessionRef.current.tabs.find((entry) => entry.documentPath === action.documentPath) ?? null
      await deleteDocumentNodeInBridge(projectId, profileId, action.documentPath)

      if (tab) {
        await closeTabInternal(tab.id)
      }

      await removeDocumentPathState(action.documentPath)
      const nextMarkdownPaths = await workspaceProvider.getFileTreePaths(projectId, profileId)
      setFileTree(
        buildOrderedFileTree(
          nextMarkdownPaths,
          removeNodeFromManualOrder(manualNodeOrderByParent, action.documentPath),
        ),
      )
      publishActionFeedback(`已删除：${action.documentPath}`)
      setPendingDeleteDocumentAction(null)
    } catch (error) {
      publishActionFeedback(
        error instanceof Error ? `删除失败：${error.message}` : '删除失败',
        'error',
      )
    }
  }

  async function handleMoveDocumentToDirectory(sourcePath: string, targetDirectoryPath: string) {
    const projectId = activeProjectIdRef.current
    const profileId = activeProfileIdRef.current
    if (!projectId) {
      return
    }

    try {
      const fileName = sourcePath.split('/').at(-1) ?? sourcePath
      const targetPath = joinNodePath(targetDirectoryPath, fileName)

      if (targetPath === sourcePath) {
        return
      }

      if (!(await flushDocumentDraftIfNeeded(sourcePath))) {
        return
      }

      const result = await moveDocumentNodeInBridge(projectId, profileId, sourcePath, targetPath)
      const nextManualNodeOrderByParent = moveNodeToParentTailInManualOrder(
        manualNodeOrderByParent,
        sourcePath,
        result.path,
      )
      await rewriteDocumentPathState(sourcePath, result.path, nextManualNodeOrderByParent)
      const nextMarkdownPaths = await workspaceProvider.getFileTreePaths(projectId, profileId)
      setFileTree(
        buildOrderedFileTree(
          nextMarkdownPaths,
          nextManualNodeOrderByParent,
        ),
      )
      await handleExpandedFileNodesChange(
        Array.from(new Set([...expandedFileNodes, targetDirectoryPath].filter(Boolean))).sort(),
      )
      publishActionFeedback(`已移动：${sourcePath} -> ${result.path}`)
    } catch (error) {
      publishActionFeedback(
        error instanceof Error ? `移动失败：${error.message}` : '移动失败',
        'error',
      )
    }
  }

  async function handleReorderFileTreeNode(payload: {
    sourcePath: string
    sourceParentPath: string | null
    targetPath: string | null
    targetParentPath: string | null
    position: 'before' | 'after' | 'tail'
  }) {
    const projectId = activeProjectIdRef.current
    const profileId = activeProfileIdRef.current
    if (!projectId) {
      return
    }

    try {
      const normalizedManualNodeOrder = normalizeManualNodeOrderByParent(
        manualNodeOrderByParent,
        fileTree,
      )
      const nextManualNodeOrderByParent = reorderManualNodeOrder(normalizedManualNodeOrder, payload)
      const nextMarkdownPaths = await workspaceProvider.getFileTreePaths(projectId, profileId)
      await persistManualNodeOrder(nextManualNodeOrderByParent, {
        refreshPaths: nextMarkdownPaths,
      })
      publishActionFeedback(formatReorderFeedbackMessage(payload), 'info')
    } catch (error) {
      publishActionFeedback(
        error instanceof Error ? `调整顺序失败：${error.message}` : '调整顺序失败',
        'error',
      )
    }
  }

  async function handleDocumentSelect(path: string) {
    if (!activeProjectId) {
      return
    }

    const project = projects.find((entry) => entry.id === activeProjectId)
    if (project) {
      ensureTabExists(path)
      await loadDocumentContent(project, path, activeProfileId)
    }

    setSession((current) => ({
      ...current,
      mode: 'regular',
      activeTabId: createTabId(path),
      tabs:
        getTabByDocumentPath(current, path) == null
          ? [...current.tabs, createWorkspaceTab(path)]
          : current.tabs,
    }))

    const localState = normalizeLocalStateSnapshot(
      (await localStateStore.getState(activeProjectId)) as Awaited<
        ReturnType<typeof localStateStore.getState>
      > & { activeMode: 'regular' | 'split' | 'read' | 'edit'; lastKnownScrollTop?: number },
    )

    await localStateStore.saveState(activeProjectId, {
      ...localState,
      openDocumentPaths: Array.from(new Set([...localState.openDocumentPaths, path])),
      activeMode: 'regular',
      regularViewState: session.regularViewState,
      activeDocumentPath: path,
      readingProgressByDocument: {
        ...localState.readingProgressByDocument,
        [path]: localState.readingProgressByDocument[path] ?? 0,
      },
    })
  }

  async function handleTabSelect(tabId: string) {
    if (!activeProjectId) {
      return
    }

    const nextTab = session.tabs.find((tab) => tab.id === tabId)

    if (!nextTab || nextTab.id === session.activeTabId) {
      return
    }

    setSession((current) => ({
      ...current,
      activeTabId: tabId,
    }))

    const project = projects.find((entry) => entry.id === activeProjectId)
    if (project && nextTab.persistedContent == null) {
      await loadDocumentContent(project, nextTab.documentPath, activeProfileId)
    }

    const localState = normalizeLocalStateSnapshot(
      (await localStateStore.getState(activeProjectId)) as Awaited<
        ReturnType<typeof localStateStore.getState>
      > & { activeMode: 'regular' | 'split' | 'read' | 'edit'; lastKnownScrollTop?: number },
    )
    await localStateStore.saveState(activeProjectId, {
      ...localState,
      openDocumentPaths: session.tabs.map((tab) => tab.documentPath),
      activeDocumentPath: nextTab.documentPath,
      activeMode: session.mode,
      regularViewState: session.regularViewState,
    })
  }

  async function handleTabReorder(nextOrderedTabIds: string[]) {
    const projectId = activeProjectIdRef.current
    if (!projectId) {
      return
    }

    const nextSession = reorderSessionTabs(sessionRef.current, nextOrderedTabIds)
    if (nextSession === sessionRef.current) {
      return
    }

    setSession(nextSession)

    const localState = normalizeLocalStateSnapshot(
      (await localStateStore.getState(projectId)) as Awaited<
        ReturnType<typeof localStateStore.getState>
      > & { activeMode: 'regular' | 'split' | 'read' | 'edit'; lastKnownScrollTop?: number },
    )

    await localStateStore.saveState(projectId, {
      ...localState,
      openDocumentPaths: nextSession.tabs.map((tab) => tab.documentPath),
      activeDocumentPath: getActiveTab(nextSession)?.documentPath ?? null,
      activeMode: nextSession.mode,
      regularViewState: nextSession.regularViewState,
    })
  }

  async function handleTabClose(tabId: string) {
    if (!activeProjectId) {
      return
    }

    const closingTab = session.tabs.find((tab) => tab.id === tabId) ?? null

    if (closingTab == null) {
      return
    }

    const isDirty =
      closingTab.persistedContent != null &&
      closingTab.draftContent != null &&
      closingTab.draftContent !== closingTab.persistedContent

    if (isDirty) {
      setPendingCloseTabAction({ kind: 'close-tab', tabId })
      return
    }

    await closeTabInternal(tabId)
  }

  async function loadDocumentContent(
    project: ProjectRegistryRecord,
    documentPath: string,
    profileId: string,
  ) {
    setIsDocumentLoading(true)

    try {
      const document = await getDocumentContentFromBridge(project.id, profileId, documentPath)
      applyLoadedDocument(document.path, document.content, document.mtimeMs, `当前项目：${project.name}`)
    } catch (error) {
      if (isMissingDocumentLoadError(error)) {
        await purgeMissingDocumentPath(project, profileId, documentPath)
        return
      }

      setSession((current) => {
        const existingTab = getTabByDocumentPath(current, documentPath) ?? createWorkspaceTab(documentPath)
        const nextTab: WorkspaceTab = {
          ...existingTab,
          saveState: 'save_failed_retryable',
          saveErrorMessage: error instanceof Error ? error.message : '读取文档失败',
        }

        return getTabByDocumentPath(current, documentPath) == null
          ? {
              ...current,
              tabs: [...current.tabs, nextTab],
              activeTabId: nextTab.id,
            }
          : {
              ...replaceTab(current, nextTab),
              activeTabId: nextTab.id,
            }
      })
      setStatusMessage(error instanceof Error ? `读取文档失败：${error.message}` : '读取文档失败')
    } finally {
      setIsDocumentLoading(false)
    }
  }

  async function handleToggleRegularLock() {
    if (mode !== 'regular') {
      return
    }

    if (regularViewState === 'locked') {
      setSession((current) => ({ ...current, regularViewState: 'unlocking' }))
      setSession((current) => ({ ...current, regularViewState: 'editable' }))
      return
    }

    if (regularViewState !== 'editable') {
      return
    }

    setSession((current) => ({ ...current, regularViewState: 'locking' }))

    if (!(await flushAllDirtyTabs())) {
      setSession((current) => ({ ...current, regularViewState: 'editable' }))
      return
    }

    setSession((current) => ({ ...current, regularViewState: 'locked' }))
  }

  async function saveActiveProfileLayout(nextLayout: { sidebarWidth?: number; outlineWidth?: number }) {
    if (!activeProjectId) {
      return
    }

    const profile =
      workspaceSource === 'local-service'
        ? await getProfileFromBridge(activeProjectId, activeProfileId, activeProfileIdRef.current)
        : await profileStore.getProfile(activeProjectId, activeProfileId)

    const nextProfile = {
      ...profile,
      layout: {
        ...profile.layout,
        ...nextLayout,
      },
    }

    if (workspaceSource === 'local-service') {
      await saveProfileToBridge(activeProjectId, nextProfile, activeProfileIdRef.current)
      return
    }

    await profileStore.saveProfile(activeProjectId, nextProfile)
  }

  async function saveActiveProfileNavigation(nextNavigation: {
    expandedFileNodes?: string[]
    expandedFileNodesInitialized?: boolean
    hiddenPaths?: string[]
    favoritePaths?: string[]
    manualNodeOrderByParent?: ManualNodeOrderByParent
  }) {
    if (!activeProjectId) {
      return
    }

    const profile =
      workspaceSource === 'local-service'
        ? await getProfileFromBridge(activeProjectId, activeProfileId, activeProfileIdRef.current)
        : await profileStore.getProfile(activeProjectId, activeProfileId)

    const nextProfile = {
      ...profile,
      navigation: {
        ...profile.navigation,
        ...nextNavigation,
      },
    }

    if (workspaceSource === 'local-service') {
      await saveProfileToBridge(activeProjectId, nextProfile, activeProfileIdRef.current)
      return
    }

    await profileStore.saveProfile(activeProjectId, nextProfile)
  }

  async function saveActiveProfileAppearance(nextAppearance: {
    fontSize?: number
    pageWidth?: PageWidthMode
    lineHeight?: DocumentLineHeight
  }) {
    if (!activeProjectId) {
      return
    }

    const profile =
      workspaceSource === 'local-service'
        ? await getProfileFromBridge(activeProjectId, activeProfileId, activeProfileIdRef.current)
        : await profileStore.getProfile(activeProjectId, activeProfileId)
    const currentAppearance = profile.appearance ?? {
      theme: 'system',
      fontSize: 16,
      pageWidth: 'narrow' as PageWidthMode,
      lineHeight: 1.6 as DocumentLineHeight,
    }

    const nextProfile = {
      ...profile,
      appearance: {
        ...currentAppearance,
        ...nextAppearance,
      },
    }

    if (workspaceSource === 'local-service') {
      await saveProfileToBridge(activeProjectId, nextProfile, activeProfileIdRef.current)
      return
    }

    await profileStore.saveProfile(activeProjectId, nextProfile)
  }

  function handleSidebarWidthChange(nextWidth: number) {
    setSidebarWidth(nextWidth)
  }

  async function handleSidebarWidthCommit(nextWidth: number) {
    setSidebarWidth(nextWidth)
    await saveActiveProfileLayout({ sidebarWidth: nextWidth })
  }

  function handleOutlineWidthChange(nextWidth: number) {
    setOutlineWidth(nextWidth)
  }

  async function handleOutlineWidthCommit(nextWidth: number) {
    setOutlineWidth(nextWidth)
    await saveActiveProfileLayout({ outlineWidth: nextWidth })
  }

  async function handleDocumentFontSizeChange(nextFontSize: number) {
    setDocumentFontSize(nextFontSize)
    await saveActiveProfileAppearance({ fontSize: nextFontSize })
  }

  async function handleDocumentPageWidthChange(nextPageWidth: PageWidthMode) {
    setDocumentPageWidth(nextPageWidth)
    await saveActiveProfileAppearance({ pageWidth: nextPageWidth })
  }

  async function handleDocumentLineHeightChange(nextLineHeight: DocumentLineHeight) {
    setDocumentLineHeight(nextLineHeight)
    await saveActiveProfileAppearance({ lineHeight: nextLineHeight })
  }

  async function handleExpandedFileNodesChange(nextExpandedFileNodes: string[]) {
    setExpandedFileNodes(nextExpandedFileNodes)
    setHasPersistedExpandedFileNodes(true)
    await saveActiveProfileNavigation({
      expandedFileNodes: nextExpandedFileNodes,
      expandedFileNodesInitialized: true,
    })
  }

  async function handleHidePath(path: string) {
    const nextHiddenPaths = Array.from(new Set([...hiddenPaths, path]))
    setHiddenPaths(nextHiddenPaths)
    await saveActiveProfileNavigation({ hiddenPaths: nextHiddenPaths })
  }

  async function handleUnhidePath(path: string) {
    const nextHiddenPaths = hiddenPaths.filter((item) => item !== path)
    setHiddenPaths(nextHiddenPaths)
    await saveActiveProfileNavigation({ hiddenPaths: nextHiddenPaths })
  }

  async function handleToggleFavoriteDocument(path: string) {
    const nextFavoritePaths = favoritePaths.includes(path)
      ? favoritePaths.filter((item) => item !== path)
      : [...favoritePaths, path]
    setFavoritePaths(nextFavoritePaths)
    await saveActiveProfileNavigation({ favoritePaths: nextFavoritePaths })
  }

  function handleToggleShowFavoritesOnly() {
    setShowFavoritesOnly((current) => !current)
  }

  function handleToggleShowHiddenItems() {
    setShowHiddenItems((current) => !current)
  }

  async function waitForLocalBridgeReady(timeoutMs = 6000) {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const health = await getLocalBridgeHealth()

      if (health.ok) {
        return
      }

      await new Promise((resolve) => window.setTimeout(resolve, 200))
    }

    throw new Error('本地服务重启超时')
  }

  async function handleRestartService() {
    if (workspaceSource !== 'local-service' || isServiceActionPending) {
      return
    }

    if (getDirtyTabs().length > 0) {
      setPendingWorkspaceAction({ kind: 'restart-service' })
      return
    }

    await continueWorkspaceAction({ kind: 'restart-service' })
  }

  async function handleStopService() {
    if (workspaceSource !== 'local-service' || isServiceActionPending) {
      return
    }

    if (getDirtyTabs().length > 0) {
      setPendingWorkspaceAction({ kind: 'stop-service' })
      return
    }

    await continueWorkspaceAction({ kind: 'stop-service' })
  }

  async function handleSaveAllAndContinue() {
    const action = pendingWorkspaceAction

    if (action == null) {
      return
    }

    const isSaved = await flushAllDirtyTabs()
    setPendingWorkspaceAction(null)

    if (!isSaved) {
      return
    }

    await continueWorkspaceAction(action)
  }

  async function handleDiscardAllAndContinue() {
    const action = pendingWorkspaceAction

    if (action == null) {
      return
    }

    discardDirtyTabs(getDirtyTabs().map((tab) => tab.id))
    setPendingWorkspaceAction(null)
    await continueWorkspaceAction(action)
  }

  function handleCancelWorkspaceAction() {
    setPendingWorkspaceAction(null)
  }

  async function handleSaveTabAndClose() {
    const action = pendingCloseTabAction

    if (action == null) {
      return
    }

    const isSaved = await saveTabById(action.tabId, 'leave')
    setPendingCloseTabAction(null)

    if (!isSaved) {
      return
    }

    await closeTabInternal(action.tabId)
  }

  async function handleDiscardTabAndClose() {
    const action = pendingCloseTabAction

    if (action == null) {
      return
    }

    discardTabDraft(action.tabId)
    setPendingCloseTabAction(null)
    await closeTabInternal(action.tabId)
  }

  function handleCancelTabClose() {
    setPendingCloseTabAction(null)
  }

  return (
    <>
      <AppShell
        projects={projects}
        activeProjectId={activeProjectId}
        profileIds={profileIds}
        activeProfileId={activeProfileId}
        tabs={session.tabs.map((tab) => ({
          id: tab.id,
          documentPath: tab.documentPath,
          title: formatTabTitle(tab.documentPath),
          saveState: tab.saveState,
          saveErrorMessage: tab.saveErrorMessage,
        }))}
        activeTabId={session.activeTabId}
        canManageService={workspaceSource === 'local-service'}
        isServiceActionPending={isServiceActionPending}
        mode={mode}
        regularViewState={regularViewState}
        fileTree={visibleFileTree}
        availableDirectoryPaths={availableDirectoryPaths}
        favoritePaths={favoritePaths}
        showFavoritesOnly={showFavoritesOnly}
        showHiddenItems={showHiddenItems}
        currentDocumentPath={currentDocumentPath}
        currentDocumentContent={currentDocumentContent}
        editingDocumentContent={editingDocumentContent}
        saveIndicator={getSaveIndicator(activeTab)}
        isDocumentLoading={isDocumentLoading}
        statusMessage={statusMessage}
        actionToast={actionToast}
        sidebarWidth={sidebarWidth}
        outlineWidth={outlineWidth}
        expandedFileNodes={expandedFileNodes}
        hasPersistedExpandedFileNodes={hasPersistedExpandedFileNodes}
        documentFontSize={documentFontSize}
        documentPageWidth={documentPageWidth}
        documentLineHeight={documentLineHeight}
        isWorkspaceBootstrapping={isWorkspaceBootstrapping}
        onConnectProject={handleConnectProject}
        onProjectChange={handleProjectChange}
        onProfileChange={handleProfileChange}
        onModeChange={handleModeChange}
        onToggleRegularLock={handleToggleRegularLock}
        onToggleFavoriteDocument={handleToggleFavoriteDocument}
        onToggleShowFavoritesOnly={handleToggleShowFavoritesOnly}
        onToggleShowHiddenItems={handleToggleShowHiddenItems}
        onHidePath={handleHidePath}
        onUnhidePath={handleUnhidePath}
        onTabSelect={handleTabSelect}
        onTabClose={handleTabClose}
        onTabReorder={handleTabReorder}
        onRestartService={handleRestartService}
        onStopService={handleStopService}
        onDocumentSelect={handleDocumentSelect}
        onCreateDocument={handleCreateDocument}
        onCreateDirectory={handleCreateDirectory}
        onCopyDocumentLink={handleCopyDocumentLink}
        onCopyDirectoryPath={handleCopyDirectoryPath}
        onDuplicateDocument={handleDuplicateDocument}
        onRenameDocument={handleRenameDocument}
        onDeleteDocument={handleDeleteDocument}
        onMoveDocument={handleMoveDocumentToDirectory}
        onReorderFileTreeNode={handleReorderFileTreeNode}
        onExpandedFileNodesChange={handleExpandedFileNodesChange}
        onDocumentFontSizeChange={handleDocumentFontSizeChange}
        onDocumentPageWidthChange={handleDocumentPageWidthChange}
        onDocumentLineHeightChange={handleDocumentLineHeightChange}
        onEditingDocumentContentChange={setDraftDocumentContent}
        onEditingCompositionStart={handleEditingCompositionStart}
        onEditingCompositionEnd={handleEditingCompositionEnd}
        onSidebarWidthChange={handleSidebarWidthChange}
        onSidebarWidthCommit={handleSidebarWidthCommit}
        onOutlineWidthChange={handleOutlineWidthChange}
        onOutlineWidthCommit={handleOutlineWidthCommit}
      />
      {pendingWorkspaceAction ? (
        <ActionDialog
          ariaLabel="会话级保存闸门"
          title="当前会话存在未保存标签"
          description="继续执行前，需要先决定这些文档的保存方式。"
          tone="warning"
          actions={[
            { label: '取消', onClick: handleCancelWorkspaceAction },
            { label: '放弃全部', onClick: handleDiscardAllAndContinue },
            { label: '保存全部', onClick: handleSaveAllAndContinue, tone: 'primary' },
          ]}
        >
          <ul className="app-dialog__list">
            {getDirtyTabs().map((tab) => (
              <li key={tab.id}>{tab.documentPath.split('/').at(-1) ?? tab.documentPath}</li>
            ))}
          </ul>
        </ActionDialog>
      ) : null}
      {pendingCloseTabAction ? (
        <ActionDialog
          ariaLabel="关闭未保存标签"
          title="当前标签存在未保存内容"
          description="关闭前请选择是否保留这次编辑。"
          tone="warning"
          actions={[
            { label: '取消', onClick: handleCancelTabClose },
            { label: '放弃', onClick: handleDiscardTabAndClose },
            { label: '保存', onClick: handleSaveTabAndClose, tone: 'primary' },
          ]}
        />
      ) : null}
      {pendingDeleteDocumentAction ? (
        <ActionDialog
          ariaLabel="删除文档"
          title="删除文档"
          description={`确认删除「${pendingDeleteDocumentAction.documentPath.split('/').at(-1) ?? pendingDeleteDocumentAction.documentPath}」？删除后无法恢复。`}
          tone="danger"
          actions={[
            { label: '取消', onClick: handleCancelDeleteDocument },
            { label: '删除', onClick: handleConfirmDeleteDocument, tone: 'danger' },
          ]}
        >
          <p className="app-dialog__path">{pendingDeleteDocumentAction.documentPath}</p>
        </ActionDialog>
      ) : null}
      {pendingCreateNodeAction ? (
        <ActionDialog
          ariaLabel={pendingCreateNodeAction.kind === 'document' ? '新建文档' : '新建文件夹'}
          title={pendingCreateNodeAction.kind === 'document' ? '新建文档' : '新建文件夹'}
          description={
            pendingCreateNodeAction.kind === 'document'
              ? '输入新文档名称，创建后会自动打开。'
              : '输入新文件夹名称，创建后会保留在当前目录树中。'
          }
          actions={[
            { label: '取消', onClick: handleCancelCreateNode },
            {
              label: pendingCreateNodeAction.kind === 'document' ? '创建文档' : '创建文件夹',
              onClick: handleConfirmCreateNode,
              tone: 'primary',
            },
          ]}
        >
          <div className="app-dialog__field">
            <label className="app-dialog__label" htmlFor="create-node-name">
              名称
            </label>
            <input
              id="create-node-name"
              className="app-dialog__input"
              value={pendingCreateNodeName}
              autoFocus
              onChange={(event) => setPendingCreateNodeName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleConfirmCreateNode()
                }
              }}
            />
            <p className="app-dialog__hint">
              {pendingCreateNodeAction.directoryPath
                ? `当前位置：${pendingCreateNodeAction.directoryPath}`
                : '当前位置：项目根目录'}
            </p>
          </div>
        </ActionDialog>
      ) : null}
    </>
  )
}

export default App
