import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const localState = {
  openDocumentPaths: ['docs/guide.md', 'docs/next.md'],
  activeDocumentPath: 'docs/next.md',
  activeMode: 'split' as const,
  regularViewState: 'editable' as const,
  tabStateByDocument: {
    'docs/guide.md': { lastKnownScrollTop: 128 },
    'docs/next.md': { lastKnownScrollTop: 512 },
  },
  readingProgressByDocument: {
    'docs/guide.md': 128,
    'docs/next.md': 512,
  },
}

const documents = new Map([
  [
    'docs/guide.md',
    {
      path: 'docs/guide.md',
      content: '# Guide\n\nGuide body',
      mtimeMs: 100,
      size: 18,
    },
  ],
  [
    'docs/next.md',
    {
      path: 'docs/next.md',
      content: '# Next\n\nNext body',
      mtimeMs: 200,
      size: 16,
    },
  ],
])

const bridgeMocks = vi.hoisted(() => ({
  getDocumentContentFromBridge: vi.fn(),
  getProfileFromBridge: vi.fn(),
  listProjectProfilesFromBridge: vi.fn(),
  saveProfileToBridge: vi.fn(),
  saveState: vi.fn(),
}))

vi.mock('../../src/shared/key-value-store', () => ({
  createBrowserKeyValueStore: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
  }),
}))

vi.mock('../../src/workspace/profile-store', () => ({
  createProfileStore: () => ({
    getProfile: vi.fn(async () => ({
      layout: {
        sidebarWidth: 280,
        outlineWidth: 320,
      },
    })),
    saveProfile: vi.fn(async () => undefined),
  }),
}))

vi.mock('../../src/workspace/local-state', () => ({
  createLocalStateStore: () => ({
    getState: vi.fn(async () => localState),
    saveState: bridgeMocks.saveState,
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
  getFileTreePathsFromBridge: vi.fn(async () => ['docs/guide.md', 'docs/next.md']),
  getDocumentContentFromBridge: bridgeMocks.getDocumentContentFromBridge,
  saveDocumentContentToBridge: vi.fn(),
  registerProjectWithBridge: vi.fn(),
  setActiveProjectWithBridge: vi.fn(),
  restartLocalBridgeService: vi.fn(),
  stopLocalBridgeService: vi.fn(),
}))

vi.mock('../../src/editor/visual-markdown-editor', () => ({
  preloadVisualMarkdownEditor: vi.fn(),
  VisualMarkdownEditor: ({
    value,
    readonly,
    onChange,
  }: {
    value: string
    readonly?: boolean
    onChange: (nextValue: string) => void
  }) => (
    <textarea
      aria-label="可视 Markdown 编辑器"
      readOnly={readonly}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

vi.mock('../../src/app/AppShell', () => ({
  AppShell: (props: {
    tabs: Array<{ title: string }>
    onTabReorder?: (nextOrderedTabIds: string[]) => void
  }) => (
    <div>
      <button
        type="button"
        onClick={() => props.onTabReorder?.(['docs/next.md', 'docs/guide.md'])}
      >
        reorder-tabs
      </button>
      <div data-testid="tab-order">{props.tabs.map((tab) => tab.title).join(',')}</div>
    </div>
  ),
}))

import App from '../../src/App'

describe('App tab reorder persistence', () => {
  beforeEach(() => {
    bridgeMocks.getDocumentContentFromBridge.mockReset()
    bridgeMocks.getProfileFromBridge.mockReset()
    bridgeMocks.listProjectProfilesFromBridge.mockReset()
    bridgeMocks.saveProfileToBridge.mockReset()
    bridgeMocks.saveState.mockReset()

    localState.openDocumentPaths = ['docs/guide.md', 'docs/next.md']
    localState.activeDocumentPath = 'docs/next.md'

    bridgeMocks.listProjectProfilesFromBridge.mockResolvedValue({
      profileIds: ['default', 'Lans'],
    })
    bridgeMocks.getProfileFromBridge.mockResolvedValue({
      id: 'default',
      appearance: {
        theme: 'system',
        fontSize: 16,
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
    })
    bridgeMocks.saveProfileToBridge.mockImplementation(async (_projectId, profile) => profile)

    bridgeMocks.getDocumentContentFromBridge.mockImplementation(
      async (_projectId: string, _profileId: string, documentPath: string) => {
        const document = documents.get(documentPath)

        if (!document) {
          throw new Error(`missing document: ${documentPath}`)
        }

        return document
      },
    )
  })

  it('persists reordered openDocumentPaths after a tab drag reorder', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('tab-order')).toHaveTextContent('guide,next')
    })

    await user.click(screen.getByRole('button', { name: 'reorder-tabs' }))

    await waitFor(() => {
      expect(bridgeMocks.saveState).toHaveBeenCalledWith(
        'notes',
        expect.objectContaining({
          openDocumentPaths: ['docs/next.md', 'docs/guide.md'],
          activeDocumentPath: 'docs/next.md',
        }),
      )
    })
  })

  it('restores reordered tabs on the next mount', async () => {
    localState.openDocumentPaths = ['docs/next.md', 'docs/guide.md']
    localState.activeDocumentPath = 'docs/next.md'

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('tab-order')).toHaveTextContent('next,guide')
    })
  })
})
