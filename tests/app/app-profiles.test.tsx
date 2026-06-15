import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const storageMocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}))

const bridgeMocks = vi.hoisted(() => ({
  listProjectsFromBridge: vi.fn(),
  listProjectProfilesFromBridge: vi.fn(),
  getProfileFromBridge: vi.fn(),
  registerProjectWithBridge: vi.fn(),
  getDocumentContentFromBridge: vi.fn(),
}))

vi.mock('../../src/shared/key-value-store', () => ({
  createBrowserKeyValueStore: () => ({
    getItem: storageMocks.getItem,
    setItem: storageMocks.setItem,
  }),
}))

vi.mock('../../src/workspace/profile-store', () => ({
  createProfileStore: () => ({
    getProfile: vi.fn(async () => null),
    saveProfile: vi.fn(async () => undefined),
  }),
}))

vi.mock('../../src/workspace/local-state', () => ({
  createLocalStateStore: () => ({
    getState: vi.fn(async () => ({
      activeDocumentPath: 'docs/guide.md',
      activeMode: 'read',
      lastKnownScrollTop: 0,
      readingProgressByDocument: {
        'docs/guide.md': 0,
      },
    })),
    saveState: vi.fn(async () => undefined),
  }),
}))

vi.mock('../../src/workspace/local-bridge-access', () => ({
  BridgeDocumentConflictError: class BridgeDocumentConflictError extends Error {},
  getLocalBridgeHealth: vi.fn(async () => ({
    ok: true,
    mode: 'local-service',
    projectsLoaded: 1,
    port: 8797,
  })),
  listProjectsFromBridge: bridgeMocks.listProjectsFromBridge,
  listProjectProfilesFromBridge: bridgeMocks.listProjectProfilesFromBridge,
  getProfileFromBridge: bridgeMocks.getProfileFromBridge,
  saveProfileToBridge: vi.fn(async (_projectId, profile) => profile),
  getFileTreePathsFromBridge: vi.fn(async () => ['docs/guide.md']),
  getDocumentContentFromBridge: bridgeMocks.getDocumentContentFromBridge,
  saveDocumentContentToBridge: vi.fn(),
  registerProjectWithBridge: bridgeMocks.registerProjectWithBridge,
  setActiveProjectWithBridge: vi.fn(),
  restartLocalBridgeService: vi.fn(),
  stopLocalBridgeService: vi.fn(),
}))

vi.mock('../../src/editor/visual-markdown-editor', () => ({
  preloadVisualMarkdownEditor: vi.fn(),
  VisualMarkdownEditor: ({ value }: { value: string }) => (
    <textarea aria-label="可视 Markdown 编辑器" value={value} readOnly />
  ),
}))

import App from '../../src/App'

describe('App repo-tracked profiles', () => {
  beforeEach(() => {
    storageMocks.getItem.mockReset()
    storageMocks.setItem.mockReset()
    bridgeMocks.listProjectsFromBridge.mockReset()
    bridgeMocks.listProjectProfilesFromBridge.mockReset()
    bridgeMocks.getProfileFromBridge.mockReset()
    bridgeMocks.registerProjectWithBridge.mockReset()
    bridgeMocks.getDocumentContentFromBridge.mockReset()
    storageMocks.getItem.mockResolvedValue(null)
    storageMocks.setItem.mockResolvedValue(undefined)

    let lansHasProject = false

    bridgeMocks.listProjectsFromBridge.mockImplementation(async (profileId: string) => {
      if (profileId === 'Lans' && !lansHasProject) {
        return {
          activeProjectId: null,
          projects: [],
        }
      }

      return {
        activeProjectId: 'notes',
        projects: [
          {
            id: 'notes',
            name: 'Notes',
            rootPath: 'C:\\Code\\Notes',
            contentRoots: ['docs'],
            permissionState: 'granted',
          },
        ],
      }
    })
    bridgeMocks.listProjectProfilesFromBridge.mockResolvedValue({
      profileIds: ['default', 'Lans'],
    })
    bridgeMocks.getProfileFromBridge.mockImplementation(async (_projectId: string, profileId: string) => ({
      id: profileId,
      appearance: {
        theme: 'system',
        fontSize: profileId === 'Lans' ? 17 : 16,
        pageWidth: 'narrow',
      },
      layout: {
        sidebarWidth: 280,
        outlineWidth: 320,
        sidebarCollapsed: false,
        outlineCollapsed: false,
      },
      navigation: {
        expandedFileNodes: [],
        expandedHeadingNodes: {},
      },
    }))
    bridgeMocks.registerProjectWithBridge.mockImplementation(async () => {
      lansHasProject = true
      return {
        id: 'notes',
        name: 'Notes',
        rootPath: 'C:\\Code\\Notes',
        contentRoots: ['docs'],
        permissionState: 'granted',
      }
    })
    bridgeMocks.getDocumentContentFromBridge.mockResolvedValue({
      path: 'docs/guide.md',
      content: '# Guide\n\nBody',
      mtimeMs: 100,
      size: 10,
    })
  })

  it('shows Lans in the profile dropdown and carries the current project into that profile', async () => {
    const user = userEvent.setup()

    render(<App />)

    await screen.findByRole('tab', { name: 'guide.md' })

    await user.click(screen.getByRole('combobox', { name: 'Profile 切换' }))
    expect(screen.getByRole('option', { name: 'Lans' })).toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: 'Lans' }))

    await waitFor(() => {
      expect(bridgeMocks.registerProjectWithBridge).toHaveBeenCalledWith('Lans', 'C:\\Code\\Notes')
    })
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Profile 切换' })).toHaveTextContent('Lans')
    })
    await waitFor(() => {
      expect(storageMocks.setItem).toHaveBeenCalledWith('workspace:active-profile', 'Lans')
    })
  })

  it('restores the previously selected profile after refresh and keeps it visible without an active project', async () => {
    storageMocks.getItem.mockResolvedValue('Lans')

    render(<App />)

    await waitFor(() => {
      expect(bridgeMocks.listProjectsFromBridge).toHaveBeenCalledWith('Lans')
    })
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Profile 切换' })).toHaveTextContent('Lans')
    })

    await userEvent.setup().click(screen.getByRole('combobox', { name: 'Profile 切换' }))
    expect(screen.getByRole('option', { name: 'default' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Lans' })).toBeInTheDocument()
  })
})
