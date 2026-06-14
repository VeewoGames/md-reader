import { useEffect, useRef, useState } from 'react'

import { AppShell } from './app/AppShell'
import type { RegularViewState, WorkspaceMode } from './app/TopBar'
import { createBrowserKeyValueStore } from './shared/key-value-store'
import { buildFileTree } from './workspace/file-tree'
import { createContentHash } from './shared/content-hash'
import type { FileTreeNode } from './workspace/file-tree-types'
import {
  BridgeDocumentConflictError,
  getDocumentContentFromBridge,
  getFileTreePathsFromBridge,
  getLocalBridgeHealth,
  listProjectsFromBridge,
  registerProjectWithBridge,
  restartLocalBridgeService,
  saveDocumentContentToBridge,
  setActiveProjectWithBridge,
  stopLocalBridgeService,
} from './workspace/local-bridge-access'
import { createLocalStateStore } from './workspace/local-state'
import { createProfileStore } from './workspace/profile-store'
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

type SaveState =
  | 'clean'
  | 'typing'
  | 'save_queued'
  | 'saving_background'
  | 'save_failed_retryable'
  | 'conflict_hard'
  | 'leaving_with_pending_flush'

const AUTOSAVE_DEBOUNCE_MS = 1200

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

function getSaveIndicator(
  currentDocumentPath: string | null,
  saveState: SaveState,
  saveErrorMessage: string | null,
): string | null {
  if (currentDocumentPath == null) {
    return null
  }

  switch (saveState) {
    case 'typing':
      return '输入中…'
    case 'save_queued':
      return '等待保存…'
    case 'saving_background':
      return '正在后台保存…'
    case 'leaving_with_pending_flush':
      return '正在保存后切换…'
    case 'save_failed_retryable':
      return `保存失败${saveErrorMessage ? `：${saveErrorMessage}` : ''}`
    case 'conflict_hard':
      return `正文冲突${saveErrorMessage ? `：${saveErrorMessage}` : ''}`
    case 'clean':
    default:
      return '已保存'
  }
}

function App() {
  const [projects, setProjects] = useState<ProjectRegistryRecord[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [profileIds] = useState(['default'])
  const [activeProfileId, setActiveProfileId] = useState('default')
  const [mode, setMode] = useState<WorkspaceMode>('regular')
  const [regularViewState, setRegularViewState] = useState<RegularViewState>('locked')
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([])
  const [currentDocumentPath, setCurrentDocumentPath] = useState<string | null>(null)
  const [currentDocumentContent, setCurrentDocumentContent] = useState<string | null>(null)
  const [editingDocumentContent, setEditingDocumentContent] = useState<string | null>(null)
  const [currentDocumentMtimeMs, setCurrentDocumentMtimeMs] = useState<number | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('clean')
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null)
  const [isDocumentLoading, setIsDocumentLoading] = useState(false)
  const [workspaceSource, setWorkspaceSource] = useState<WorkspaceSource>('offline')
  const [isServiceActionPending, setIsServiceActionPending] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>('还没有接入任何 Markdown 项目')
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [outlineWidth, setOutlineWidth] = useState(320)
  const autosaveTimerRef = useRef<number | null>(null)
  const flushPromiseRef = useRef<Promise<boolean> | null>(null)
  const activeProjectIdRef = useRef<string | null>(null)
  const activeProfileIdRef = useRef(activeProfileId)
  const currentDocumentPathRef = useRef<string | null>(null)
  const currentDocumentContentRef = useRef<string | null>(null)
  const editingDocumentContentRef = useRef<string | null>(null)
  const currentDocumentMtimeRef = useRef<number | null>(null)
  const saveStateRef = useRef<SaveState>('clean')
  const draftRevisionRef = useRef(0)
  const saveRequestRevisionRef = useRef(0)
  const lastAckedSaveRevisionRef = useRef(0)
  const isComposingRef = useRef(false)

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

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId
  }, [activeProjectId])

  useEffect(() => {
    activeProfileIdRef.current = activeProfileId
  }, [activeProfileId])

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
      const source = await workspaceProvider.getSource()
      setWorkspaceSource(source)

      if (source === 'local-service') {
        const health = await getLocalBridgeHealth()
        const snapshot = await workspaceProvider.listProjects(activeProfileId)
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

        await loadLocalServiceProject(snapshot.activeProjectId, snapshot.projects, activeProfileId)
        return
      }

      setProjects([])
      setActiveProjectId(null)
      setFileTree([])
      resetDocumentState()
      setStatusMessage('本地服务不可用')
    })()
  }, [])

  useEffect(() => {
    if (!activeProjectId) {
      setSidebarWidth(280)
      setOutlineWidth(320)
      return
    }

    let cancelled = false

    void (async () => {
      const profile = await profileStore.getProfile(activeProjectId, activeProfileId)

      if (cancelled) {
        return
      }

      setSidebarWidth(profile.layout.sidebarWidth)
      setOutlineWidth(profile.layout.outlineWidth)
    })()

    return () => {
      cancelled = true
    }
  }, [activeProjectId, activeProfileId])

  useEffect(() => {
    const hasDirtyDraft =
      activeProjectId != null &&
      currentDocumentPath != null &&
      currentDocumentContent != null &&
      editingDocumentContent != null &&
      editingDocumentContent !== currentDocumentContent

    if (!hasDirtyDraft) {
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }

      if (
        saveStateRef.current !== 'saving_background' &&
        saveStateRef.current !== 'save_failed_retryable' &&
        saveStateRef.current !== 'conflict_hard'
      ) {
        setSaveState('clean')
      }

      return
    }

    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current)
    }

    if (isComposingRef.current) {
      setSaveState('save_queued')
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
  }, [activeProjectId, currentDocumentPath, currentDocumentContent, editingDocumentContent])

  function resetDocumentState() {
    setCurrentDocumentPath(null)
    setCurrentDocumentContent(null)
    setEditingDocumentContent(null)
    setCurrentDocumentMtimeMs(null)
    draftRevisionRef.current = 0
    saveRequestRevisionRef.current = 0
    lastAckedSaveRevisionRef.current = 0
    isComposingRef.current = false
    setSaveState('clean')
    setSaveErrorMessage(null)
  }

  function applyLoadedDocument(
    documentPath: string,
    content: string,
    mtimeMs: number,
    nextStatusMessage: string,
  ) {
    setCurrentDocumentPath(documentPath)
    setCurrentDocumentContent(content)
    setEditingDocumentContent(content)
    setCurrentDocumentMtimeMs(mtimeMs)
    draftRevisionRef.current = 0
    saveRequestRevisionRef.current = 0
    lastAckedSaveRevisionRef.current = 0
    isComposingRef.current = false
    setSaveState('clean')
    setSaveErrorMessage(null)
    setStatusMessage(nextStatusMessage)
  }

  function setDraftDocumentContent(nextContent: string) {
    const savedContent = currentDocumentContentRef.current
    const hasDirtyDraft = savedContent != null && nextContent !== savedContent

    if (hasDirtyDraft) {
      draftRevisionRef.current += 1
    }

    setEditingDocumentContent(nextContent)
    setSaveErrorMessage(null)
    setSaveState(hasDirtyDraft ? 'typing' : 'clean')
  }

  function scheduleAutosave() {
    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current)
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      if (isComposingRef.current) {
        setSaveState('save_queued')
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
      setSaveState('typing')
      scheduleAutosave()
    }
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
      setSaveErrorMessage(null)
      setSaveState('clean')
      clearSaveFailureStatus(projectId)
      return true
    }

    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }

    setSaveState(reason === 'leave' ? 'leaving_with_pending_flush' : 'saving_background')
    setSaveErrorMessage(null)

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
          setCurrentDocumentContent(document.content)
          setCurrentDocumentMtimeMs(document.mtimeMs)
          setSaveErrorMessage(null)
          setSaveState(editingDocumentContentRef.current === document.content ? 'clean' : 'typing')
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
        setSaveErrorMessage(message)
        setSaveState(error instanceof BridgeDocumentConflictError ? 'conflict_hard' : 'save_failed_retryable')
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
      resetDocumentState()
      setStatusMessage('当前 profile 还没有接入任何项目')
      return
    }

    const markdownPaths = await workspaceProvider.getFileTreePaths(project.id, nextProfileId)
    const localState = await localStateStore.getState(project.id)

    setActiveProjectId(project.id)
    setMode(normalizeWorkspaceMode(localState.activeMode))
    setRegularViewState(inferRegularViewStateFromMode(localState.activeMode))
    setFileTree(buildFileTree(markdownPaths))
    setStatusMessage(
      markdownPaths.length > 0 ? `当前项目：${project.name}` : `当前项目：${project.name}，但还没有发现 Markdown 文件`,
    )

    if (localState.activeDocumentPath) {
      await loadDocumentContent(project, localState.activeDocumentPath, nextProfileId)
    } else {
      resetDocumentState()
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

  async function handleProjectChange(projectId: string) {
    if (workspaceSource !== 'local-service') {
      setStatusMessage('本地服务不可用')
      return
    }

    if (!(await flushActiveDraft())) {
      return
    }

    await workspaceProvider.setActiveProject(activeProfileId, projectId)
    await loadLocalServiceProject(projectId)
  }

  async function handleProfileChange(profileId: string) {
    if (!(await flushActiveDraft())) {
      return
    }

    setActiveProfileId(profileId)

    if (workspaceSource !== 'local-service') {
      setProjects([])
      setActiveProjectId(null)
      setFileTree([])
      resetDocumentState()
      setStatusMessage('本地服务不可用')
      return
    }

    const snapshot = await workspaceProvider.listProjects(profileId)
    setProjects(snapshot.projects)
    setActiveProjectId(snapshot.activeProjectId)

    if (!snapshot.activeProjectId) {
      setFileTree([])
      resetDocumentState()
      setStatusMessage('当前 profile 还没有接入任何项目')
      return
    }

    await loadLocalServiceProject(snapshot.activeProjectId, snapshot.projects, profileId)
  }

  async function handleModeChange(nextMode: WorkspaceMode) {
    setMode(nextMode)

    if (!activeProjectId) {
      return
    }

    await localStateStore.saveState(activeProjectId, {
      activeDocumentPath: currentDocumentPath,
      activeMode: nextMode,
      lastKnownScrollTop: 0,
      readingProgressByDocument: (await localStateStore.getState(activeProjectId)).readingProgressByDocument,
    })
  }

  async function handleDocumentSelect(path: string) {
    if (!activeProjectId) {
      return
    }

    if (!(await flushActiveDraft())) {
      return
    }

    const project = projects.find((entry) => entry.id === activeProjectId)
    if (project) {
      await loadDocumentContent(project, path, activeProfileId)
    }

    setMode('regular')

    const localState = await localStateStore.getState(activeProjectId)

    await localStateStore.saveState(activeProjectId, {
      ...localState,
      activeMode: 'regular',
      activeDocumentPath: path,
      readingProgressByDocument: {
        ...localState.readingProgressByDocument,
        [path]: localState.readingProgressByDocument[path] ?? 0,
      },
    })
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
      resetDocumentState()
      setSaveState('save_failed_retryable')
      setSaveErrorMessage(error instanceof Error ? error.message : '读取文档失败')
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
      setRegularViewState('unlocking')
      setRegularViewState('editable')
      return
    }

    if (regularViewState !== 'editable') {
      return
    }

    setRegularViewState('locking')

    if (!(await flushActiveDraft())) {
      setRegularViewState('editable')
      return
    }

    setRegularViewState('locked')
  }

  async function saveActiveProfileLayout(nextLayout: { sidebarWidth?: number; outlineWidth?: number }) {
    if (!activeProjectId) {
      return
    }

    const profile = await profileStore.getProfile(activeProjectId, activeProfileId)

    await profileStore.saveProfile(activeProjectId, {
      ...profile,
      layout: {
        ...profile.layout,
        ...nextLayout,
      },
    })
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

    if (!(await flushActiveDraft())) {
      return
    }

    setIsServiceActionPending(true)
    setStatusMessage('正在重启本地服务…')

    try {
      await restartLocalBridgeService()
      await waitForLocalBridgeReady()
      await restoreLocalServiceWorkspace(activeProfileId)
      setStatusMessage('本地服务已重启')
    } catch (error) {
      setWorkspaceSource('offline')
      setStatusMessage(error instanceof Error ? error.message : '本地服务重启失败')
    } finally {
      setIsServiceActionPending(false)
    }
  }

  async function handleStopService() {
    if (workspaceSource !== 'local-service' || isServiceActionPending) {
      return
    }

    if (!(await flushActiveDraft())) {
      return
    }

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

  return (
    <AppShell
      projects={projects}
      activeProjectId={activeProjectId}
      profileIds={profileIds}
      activeProfileId={activeProfileId}
      canManageService={workspaceSource === 'local-service'}
      isServiceActionPending={isServiceActionPending}
      mode={mode}
      regularViewState={regularViewState}
      fileTree={fileTree}
      currentDocumentPath={currentDocumentPath}
      currentDocumentContent={currentDocumentContent}
      editingDocumentContent={editingDocumentContent}
      saveIndicator={getSaveIndicator(currentDocumentPath, saveState, saveErrorMessage)}
      isDocumentLoading={isDocumentLoading}
      statusMessage={statusMessage}
      sidebarWidth={sidebarWidth}
      outlineWidth={outlineWidth}
      onConnectProject={handleConnectProject}
      onProjectChange={handleProjectChange}
      onProfileChange={handleProfileChange}
      onModeChange={handleModeChange}
      onToggleRegularLock={handleToggleRegularLock}
      onRestartService={handleRestartService}
      onStopService={handleStopService}
      onDocumentSelect={handleDocumentSelect}
      onEditingDocumentContentChange={setDraftDocumentContent}
      onEditingCompositionStart={handleEditingCompositionStart}
      onEditingCompositionEnd={handleEditingCompositionEnd}
      onSidebarWidthChange={handleSidebarWidthChange}
      onSidebarWidthCommit={handleSidebarWidthCommit}
      onOutlineWidthChange={handleOutlineWidthChange}
      onOutlineWidthCommit={handleOutlineWidthCommit}
    />
  )
}

export default App
