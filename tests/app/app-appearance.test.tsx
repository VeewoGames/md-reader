import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridgeMocks = vi.hoisted(() => ({
  getProfileFromBridge: vi.fn(),
  saveProfileToBridge: vi.fn(),
  listProjectProfilesFromBridge: vi.fn(),
}))

vi.mock('../../src/shared/key-value-store', () => ({
  createBrowserKeyValueStore: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
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
  listProjectsFromBridge: vi.fn(async () => ({
    activeProjectId: 'notes',
    projects: [
      {
        id: 'notes',
        name: 'Notes',
        rootHandleKey: 'handle:notes',
        contentRoots: ['docs'],
        permissionState: 'granted',
      },
    ],
  })),
  listProjectProfilesFromBridge: bridgeMocks.listProjectProfilesFromBridge,
  getProfileFromBridge: bridgeMocks.getProfileFromBridge,
  saveProfileToBridge: bridgeMocks.saveProfileToBridge,
  getFileTreePathsFromBridge: vi.fn(async () => ['docs/guide.md']),
  getDocumentContentFromBridge: vi.fn(async () => ({
    path: 'docs/guide.md',
    content: '# Guide\n\nBody',
    mtimeMs: 100,
    size: 10,
  })),
  saveDocumentContentToBridge: vi.fn(),
  registerProjectWithBridge: vi.fn(),
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

describe('App appearance preferences', () => {
  beforeEach(() => {
    bridgeMocks.getProfileFromBridge.mockReset()
    bridgeMocks.saveProfileToBridge.mockReset()
    bridgeMocks.listProjectProfilesFromBridge.mockReset()

    bridgeMocks.getProfileFromBridge.mockResolvedValue({
      id: 'default',
      appearance: {
        theme: 'system',
        fontSize: 18,
        pageWidth: 'wide',
        lineHeight: 1.6,
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
    })
    bridgeMocks.saveProfileToBridge.mockImplementation(async (_projectId, profile) => profile)
    bridgeMocks.listProjectProfilesFromBridge.mockResolvedValue({
      profileIds: ['default', 'Lans'],
    })
  })

  it('hydrates document appearance from profile and persists changes from the topbar', async () => {
    const user = userEvent.setup()

    const { container } = render(<App />)

    await screen.findByRole('tab', { name: 'guide' })

    await waitFor(() => {
      const shell = container.querySelector('.app-shell') as HTMLElement | null
      expect(shell).not.toBeNull()
      expect(shell?.style.getPropertyValue('--doc-body-font-size')).toBe('18px')
      expect(shell?.style.getPropertyValue('--doc-max-width')).toBe('960px')
      expect(shell?.style.getPropertyValue('--doc-body-line-height')).toBe('1.6')
    })

    await user.click(screen.getByRole('button', { name: '阅读选项' }))
    await user.click(screen.getByRole('button', { name: '17 px' }))
    await user.click(screen.getByRole('button', { name: '窄版' }))
    await user.click(screen.getByRole('button', { name: '1.8' }))

    await waitFor(() => {
      expect(bridgeMocks.saveProfileToBridge).toHaveBeenCalledTimes(3)
    })

    expect(bridgeMocks.saveProfileToBridge).toHaveBeenNthCalledWith(
      1,
      'notes',
      expect.objectContaining({
        appearance: expect.objectContaining({
          fontSize: 17,
          pageWidth: 'wide',
          lineHeight: 1.6,
        }),
      }),
      'default',
    )
    expect(bridgeMocks.saveProfileToBridge).toHaveBeenNthCalledWith(
      2,
      'notes',
      expect.objectContaining({
        appearance: expect.objectContaining({
          fontSize: 18,
          pageWidth: 'narrow',
          lineHeight: 1.6,
        }),
      }),
      'default',
    )
    expect(bridgeMocks.saveProfileToBridge).toHaveBeenNthCalledWith(
      3,
      'notes',
      expect.objectContaining({
        appearance: expect.objectContaining({
          fontSize: 18,
          pageWidth: 'wide',
          lineHeight: 1.8,
        }),
      }),
      'default',
    )

    await waitFor(() => {
      const shell = container.querySelector('.app-shell') as HTMLElement | null
      expect(shell?.style.getPropertyValue('--doc-body-font-size')).toBe('17px')
      expect(shell?.style.getPropertyValue('--doc-max-width')).toBe('720px')
      expect(shell?.style.getPropertyValue('--doc-body-line-height')).toBe('1.8')
    })
  })
})
