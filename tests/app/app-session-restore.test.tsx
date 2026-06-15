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

import App from '../../src/App'

describe('App session restore', () => {
  beforeEach(() => {
    bridgeMocks.getDocumentContentFromBridge.mockReset()
    bridgeMocks.saveState.mockReset()

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

  it('restores the previous tab set and returns to the last active tab', async () => {
    const user = userEvent.setup()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'guide.md' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'next.md' })).toBeInTheDocument()
    })

    expect(screen.getByRole('tab', { name: 'next.md' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: '分栏' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: 'Markdown 编辑器' })).toHaveValue(
      '# Next\n\nNext body',
    )

    await user.click(screen.getByRole('tab', { name: 'guide.md' }))

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'guide.md' })).toHaveAttribute('aria-selected', 'true')
    })

    expect(bridgeMocks.saveState).toHaveBeenCalledWith(
      'notes',
      expect.objectContaining({
        openDocumentPaths: ['docs/guide.md', 'docs/next.md'],
        activeDocumentPath: 'docs/guide.md',
        activeMode: 'split',
        regularViewState: 'editable',
      }),
    )
  })
})
