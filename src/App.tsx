import { useEffect, useState } from 'react'

import { AppShell } from './app/AppShell'
import type { WorkspaceMode } from './app/TopBar'
import { buildFileTree } from './workspace/file-tree'
import { createLocalStateStore } from './workspace/local-state'
import { createProfileStore } from './workspace/profile-store'
import { createProjectRegistryStore, type ProjectRegistryRecord } from './workspace/registry'
import { createBrowserKeyValueStore } from './shared/key-value-store'
import {
  canUseDirectoryPicker,
  readProjectMarkdownPaths,
  registerProjectFromDirectory,
} from './workspace/browser-project-access'
import type { FileTreeNode } from './workspace/file-tree-types'

const storage = createBrowserKeyValueStore()
const registryStore = createProjectRegistryStore(storage)
const profileStore = createProfileStore(storage)
const localStateStore = createLocalStateStore(storage)

function App() {
  const [projects, setProjects] = useState<ProjectRegistryRecord[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [profileIds] = useState(['default'])
  const [activeProfileId, setActiveProfileId] = useState('default')
  const [mode, setMode] = useState<WorkspaceMode>('read')
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([])
  const [currentDocumentPath, setCurrentDocumentPath] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>('还没有接入任何 Markdown 项目')

  useEffect(() => {
    void (async () => {
      const snapshot = await registryStore.getSnapshot()

      setProjects(snapshot.projects)
      setActiveProjectId(snapshot.activeProjectId)

      if (!snapshot.activeProjectId) {
        return
      }

      const project = snapshot.projects.find((entry) => entry.id === snapshot.activeProjectId)

      if (!project) {
        return
      }

      const localState = await localStateStore.getState(project.id)
      const profile = await profileStore.getProfile(project.id, 'default')
      const markdownPaths = await readProjectMarkdownPaths(project)

      setMode(localState.activeMode)
      setCurrentDocumentPath(localState.activeDocumentPath ?? profile.navigation.lastOpenedDocument)
      setFileTree(buildFileTree(markdownPaths))
      setStatusMessage(
        markdownPaths.length > 0
          ? `当前项目：${project.name}`
          : '项目元数据已恢复，但当前会话还没有可用目录授权，已进入受限模式',
      )
    })()
  }, [])

  async function loadProject(projectId: string, nextProjects = projects) {
    const project = nextProjects.find((entry) => entry.id === projectId)

    if (!project) {
      setFileTree([])
      setStatusMessage('当前项目不存在，已进入受限模式')
      return
    }

    const localState = await localStateStore.getState(project.id)
    const profile = await profileStore.getProfile(project.id, activeProfileId)
    const markdownPaths = await readProjectMarkdownPaths(project)

    setActiveProjectId(project.id)
    setMode(localState.activeMode)
    setCurrentDocumentPath(localState.activeDocumentPath ?? profile.navigation.lastOpenedDocument)
    setFileTree(buildFileTree(markdownPaths))
    setStatusMessage(
      markdownPaths.length > 0
        ? `当前项目：${project.name}`
        : '项目元数据已恢复，但当前会话还没有可用目录授权，已进入受限模式',
    )
  }

  async function handleConnectProject() {
    if (!canUseDirectoryPicker()) {
      setStatusMessage('当前浏览器不支持目录授权，已进入受限模式')
      return
    }

    const picker = window as unknown as Window & {
      showDirectoryPicker: () => Promise<Parameters<typeof registerProjectFromDirectory>[0]>
    }
    const handle = await picker.showDirectoryPicker()
    const project = await registerProjectFromDirectory(handle)

    await registryStore.upsertProject(project)
    await registryStore.setActiveProjectId(project.id)
    await profileStore.saveProfile(project.id, await profileStore.getProfile(project.id, 'default'))

    const snapshot = await registryStore.getSnapshot()
    setProjects(snapshot.projects)
    await loadProject(project.id, snapshot.projects)
  }

  async function handleProjectChange(projectId: string) {
    await registryStore.setActiveProjectId(projectId)
    await loadProject(projectId)
  }

  async function handleProfileChange(profileId: string) {
    setActiveProfileId(profileId)

    if (!activeProjectId) {
      return
    }

    const profile = await profileStore.getProfile(activeProjectId, profileId)
    setCurrentDocumentPath(profile.navigation.lastOpenedDocument)
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
    })
  }

  async function handleDocumentSelect(path: string) {
    setCurrentDocumentPath(path)

    if (!activeProjectId) {
      return
    }

    const profile = await profileStore.getProfile(activeProjectId, activeProfileId)

    await profileStore.saveProfile(activeProjectId, {
      ...profile,
      navigation: {
        ...profile.navigation,
        lastOpenedDocument: path,
      },
    })
  }

  return (
    <AppShell
      projects={projects}
      activeProjectId={activeProjectId}
      profileIds={profileIds}
      activeProfileId={activeProfileId}
      mode={mode}
      fileTree={fileTree}
      currentDocumentPath={currentDocumentPath}
      statusMessage={statusMessage}
      onConnectProject={handleConnectProject}
      onProjectChange={handleProjectChange}
      onProfileChange={handleProfileChange}
      onModeChange={handleModeChange}
      onDocumentSelect={handleDocumentSelect}
    />
  )
}

export default App
