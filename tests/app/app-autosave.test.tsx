import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createContentHash } from '../../src/shared/content-hash'

const localState = {
  activeDocumentPath: 'docs/guide.md',
  activeMode: 'edit' as const,
  lastKnownScrollTop: 0,
  readingProgressByDocument: {
    'docs/guide.md': 0,
    'docs/next.md': 0,
  },
}

const documents = new Map([
  [
    'docs/guide.md',
    {
      path: 'docs/guide.md',
      content: '# 旧标题\n\n旧内容',
      mtimeMs: 100,
      size: 11,
    },
  ],
  [
    'docs/next.md',
    {
      path: 'docs/next.md',
      content: '# 第二篇\n\n第二篇内容',
      mtimeMs: 200,
      size: 13,
    },
  ],
])

const bridgeMocks = vi.hoisted(() => ({
  saveDocumentContentToBridge: vi.fn(),
  getDocumentContentFromBridge: vi.fn(),
  getProfileFromBridge: vi.fn(),
  listProjectProfilesFromBridge: vi.fn(),
  saveProfileToBridge: vi.fn(),
  saveState: vi.fn(),
  setActiveProjectWithBridge: vi.fn(),
  restartLocalBridgeService: vi.fn(),
  stopLocalBridgeService: vi.fn(),
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
  saveDocumentContentToBridge: bridgeMocks.saveDocumentContentToBridge,
  registerProjectWithBridge: vi.fn(),
  setActiveProjectWithBridge: bridgeMocks.setActiveProjectWithBridge,
  restartLocalBridgeService: bridgeMocks.restartLocalBridgeService,
  stopLocalBridgeService: bridgeMocks.stopLocalBridgeService,
}))

vi.mock('../../src/editor/visual-markdown-editor', () => ({
  preloadVisualMarkdownEditor: vi.fn(),
  VisualMarkdownEditor: ({
    value,
    readonly,
    onChange,
    onCompositionStart,
    onCompositionEnd,
  }: {
    value: string
    readonly?: boolean
    onChange: (nextValue: string) => void
    onCompositionStart?: () => void
    onCompositionEnd?: () => void
  }) => (
    <textarea
      aria-label="可视 Markdown 编辑器"
      readOnly={readonly}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onCompositionStart={onCompositionStart}
      onCompositionEnd={onCompositionEnd}
    />
  ),
}))

import App from '../../src/App'

describe('App autosave transitions', () => {
  beforeEach(() => {
    bridgeMocks.saveDocumentContentToBridge.mockReset()
    bridgeMocks.getDocumentContentFromBridge.mockReset()
    bridgeMocks.getProfileFromBridge.mockReset()
    bridgeMocks.listProjectProfilesFromBridge.mockReset()
    bridgeMocks.saveProfileToBridge.mockReset()
    bridgeMocks.saveState.mockReset()
    bridgeMocks.setActiveProjectWithBridge.mockReset()
    bridgeMocks.restartLocalBridgeService.mockReset()
    bridgeMocks.stopLocalBridgeService.mockReset()

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

    documents.set('docs/guide.md', {
      path: 'docs/guide.md',
      content: '# 旧标题\n\n旧内容',
      mtimeMs: 100,
      size: 11,
    })
    documents.set('docs/next.md', {
      path: 'docs/next.md',
      content: '# 第二篇\n\n第二篇内容',
      mtimeMs: 200,
      size: 13,
    })

    bridgeMocks.getDocumentContentFromBridge.mockImplementation(
      async (_projectId: string, _profileId: string, documentPath: string) => {
        const document = documents.get(documentPath)
        if (!document) {
          throw new Error(`missing document: ${documentPath}`)
        }

        return document
      },
    )

    bridgeMocks.saveDocumentContentToBridge.mockImplementation(
      async (
        _projectId: string,
        _profileId: string,
        documentPath: string,
        content: string,
        expectedMtimeMs: number | null,
        expectedContentHash: string | null,
      ) => {
        const currentDocument = documents.get(documentPath)
        if (!currentDocument) {
          throw new Error(`missing document: ${documentPath}`)
        }

        if (
          expectedMtimeMs !== currentDocument.mtimeMs &&
          expectedContentHash !== createContentHash(currentDocument.content)
        ) {
          throw new Error(`Document has changed on disk: ${documentPath}`)
        }

        const nextDocument = {
          ...currentDocument,
          content,
          mtimeMs: currentDocument.mtimeMs + 1,
          size: content.length,
        }

        documents.set(documentPath, nextDocument)
        return nextDocument
      },
    )
    bridgeMocks.setActiveProjectWithBridge.mockResolvedValue(undefined)
    bridgeMocks.restartLocalBridgeService.mockResolvedValue(undefined)
    bridgeMocks.stopLocalBridgeService.mockResolvedValue(undefined)
  })

  it('flushes the dirty draft before locking regular mode', async () => {
    const user = userEvent.setup()

    render(<App />)

    const editor = await screen.findByRole('textbox', { name: '可视 Markdown 编辑器' })

    await user.clear(editor)
    await user.type(editor, '# 新标题{enter}{enter}新内容')
    await user.click(screen.getByRole('button', { name: '锁定' }))

    await waitFor(() => {
      expect(bridgeMocks.saveDocumentContentToBridge).toHaveBeenCalledWith(
        'notes',
        'default',
        'docs/guide.md',
        '# 新标题\n\n新内容',
        100,
        'fe1b7d93',
      )
    })

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '可视 Markdown 编辑器' })).toHaveAttribute(
        'readonly',
      )
      expect(screen.getByRole('button', { name: '解锁' })).toBeInTheDocument()
    })
  })

  it('switches documents without flushing the current dirty tab and restores the draft when切回', async () => {
    const user = userEvent.setup()

    render(<App />)

    const editor = await screen.findByRole('textbox', { name: '可视 Markdown 编辑器' })

    await user.clear(editor)
    await user.type(editor, '# 当前文档已改动')
    await user.click(screen.getByRole('button', { name: 'next.md' }))

    expect(bridgeMocks.saveDocumentContentToBridge).not.toHaveBeenCalled()

    expect(screen.getByRole('textbox', { name: '可视 Markdown 编辑器' })).toHaveValue(
      '# 第二篇\n\n第二篇内容',
    )

    await user.click(screen.getByRole('tab', { name: 'guide' }))

    expect(screen.getByRole('textbox', { name: '可视 Markdown 编辑器' })).toHaveValue(
      '# 当前文档已改动',
    )
  })

  it('blocks locking regular mode when saving fails', async () => {
    const user = userEvent.setup()

    bridgeMocks.saveDocumentContentToBridge.mockRejectedValue(new Error('disk full'))

    render(<App />)

    const editor = await screen.findByRole('textbox', { name: '可视 Markdown 编辑器' })

    await user.clear(editor)
    await user.type(editor, '# 保存失败内容')
    await user.click(screen.getByRole('button', { name: '锁定' }))

    await waitFor(() => {
      expect(screen.getAllByText(/保存失败：disk full/).length).toBeGreaterThan(0)
    })

    expect(screen.getByRole('textbox', { name: '可视 Markdown 编辑器' })).toHaveValue('# 保存失败内容')
    expect(screen.getByRole('button', { name: '常规' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '锁定' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('recovers from an mtime-only conflict before locking regular mode', async () => {
    const user = userEvent.setup()

    render(<App />)

    const editor = await screen.findByRole('textbox', { name: '可视 Markdown 编辑器' })

    await user.clear(editor)
    await user.type(editor, '# 新标题{enter}{enter}新内容')

    documents.set('docs/guide.md', {
      path: 'docs/guide.md',
      content: '# 旧标题\n\n旧内容',
      mtimeMs: 101,
      size: 11,
    })

    await user.click(screen.getByRole('button', { name: '锁定' }))

    await waitFor(() => {
      expect(bridgeMocks.saveDocumentContentToBridge).toHaveBeenCalledWith(
        'notes',
        'default',
        'docs/guide.md',
        '# 新标题\n\n新内容',
        100,
        'fe1b7d93',
      )
    })

    expect(screen.getByRole('textbox', { name: '可视 Markdown 编辑器' })).toHaveValue(
      '# 新标题\n\n新内容',
    )
    expect(screen.getByRole('textbox', { name: '可视 Markdown 编辑器' })).toHaveAttribute(
      'readonly',
    )
    expect(screen.queryByText(/保存失败：/)).not.toBeInTheDocument()
  })

  it('switches documents even when the dirty tab would fail to save later', async () => {
    const user = userEvent.setup()

    bridgeMocks.saveDocumentContentToBridge.mockRejectedValue(new Error('write denied'))

    render(<App />)

    const editor = await screen.findByRole('textbox', { name: '可视 Markdown 编辑器' })

    await user.clear(editor)
    await user.type(editor, '# 当前内容不能切走')
    await user.click(screen.getByRole('button', { name: 'next.md' }))

    expect(bridgeMocks.saveDocumentContentToBridge).not.toHaveBeenCalled()
    expect(screen.queryByText(/保存失败：write denied/)).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '可视 Markdown 编辑器' })).toHaveValue(
      '# 第二篇\n\n第二篇内容',
    )
    expect(screen.getByRole('tab', { name: 'next' })).toHaveAttribute('aria-selected', 'true')
  })

  it('requires a session-level save gate before restarting service when any tab is dirty', async () => {
    const user = userEvent.setup()

    render(<App />)

    const editor = await screen.findByRole('textbox', { name: '可视 Markdown 编辑器' })

    await user.clear(editor)
    await user.type(editor, '# 当前文档留脏')
    await user.click(screen.getByRole('button', { name: 'next.md' }))
    await user.click(screen.getByRole('button', { name: '重启服务' }))

    expect(screen.getByRole('dialog', { name: '会话级保存闸门' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存全部' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '放弃全部' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
    expect(bridgeMocks.restartLocalBridgeService).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '保存全部' }))

    await waitFor(() => {
      expect(bridgeMocks.saveDocumentContentToBridge).toHaveBeenCalledWith(
        'notes',
        'default',
        'docs/guide.md',
        '# 当前文档留脏',
        100,
        'fe1b7d93',
      )
    })

    await waitFor(() => {
      expect(bridgeMocks.restartLocalBridgeService).toHaveBeenCalledTimes(1)
    })
  })

  it('blocks service restart when saving fails', async () => {
    const user = userEvent.setup()

    bridgeMocks.saveDocumentContentToBridge.mockRejectedValue(new Error('bridge busy'))

    render(<App />)

    const editor = await screen.findByRole('textbox', { name: '可视 Markdown 编辑器' })

    await user.clear(editor)
    await user.type(editor, '# 先不要重启')
    await user.click(screen.getByRole('button', { name: '重启服务' }))
    await user.click(screen.getByRole('button', { name: '保存全部' }))

    await waitFor(() => {
      expect(screen.getAllByText(/保存失败：bridge busy/).length).toBeGreaterThan(0)
    })

    expect(bridgeMocks.restartLocalBridgeService).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: '可视 Markdown 编辑器' })).toHaveValue('# 先不要重启')
  })

  it('flushes all dirty tabs before locking regular mode', async () => {
    const user = userEvent.setup()

    render(<App />)

    const editor = await screen.findByRole('textbox', { name: '可视 Markdown 编辑器' })

    await user.clear(editor)
    await user.type(editor, '# 第一篇已改')
    await user.click(screen.getByRole('button', { name: 'next.md' }))
    await user.clear(screen.getByRole('textbox', { name: '可视 Markdown 编辑器' }))
    await user.type(screen.getByRole('textbox', { name: '可视 Markdown 编辑器' }), '# 第二篇也改了')
    await user.click(screen.getByRole('button', { name: '锁定' }))

    await waitFor(() => {
      expect(bridgeMocks.saveDocumentContentToBridge).toHaveBeenCalledWith(
        'notes',
        'default',
        'docs/guide.md',
        '# 第一篇已改',
        100,
        'fe1b7d93',
      )
      expect(bridgeMocks.saveDocumentContentToBridge).toHaveBeenCalledWith(
        'notes',
        'default',
        'docs/next.md',
        '# 第二篇也改了',
        200,
        '200880b6',
      )
    })

    expect(screen.getByRole('textbox', { name: '可视 Markdown 编辑器' })).toHaveAttribute('readonly')
  })

  it('prompts before closing a dirty tab and can save it before closing', async () => {
    const user = userEvent.setup()

    render(<App />)

    const editor = await screen.findByRole('textbox', { name: '可视 Markdown 编辑器' })

    await user.clear(editor)
    await user.type(editor, '# 第一篇待保存')
    await user.click(screen.getByRole('button', { name: 'next.md' }))
    await user.click(screen.getByRole('button', { name: '关闭标签：guide' }))

    expect(screen.getByRole('dialog', { name: '关闭未保存标签' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '放弃' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(bridgeMocks.saveDocumentContentToBridge).toHaveBeenCalledWith(
        'notes',
        'default',
        'docs/guide.md',
        '# 第一篇待保存',
        100,
        'fe1b7d93',
      )
    })

    expect(screen.queryByRole('tab', { name: 'guide' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'next' })).toHaveAttribute('aria-selected', 'true')
  })

  it('does not autosave during composition until composition ends', async () => {
    render(<App />)

    const editor = await screen.findByRole('textbox', { name: '可视 Markdown 编辑器' })

    vi.useFakeTimers()

    try {
      fireEvent.change(editor, { target: { value: '# 拼音输入前缀' } })
      fireEvent.compositionStart(editor)
      fireEvent.change(editor, { target: { value: '# 拼音输入前缀zhong' } })
      vi.advanceTimersByTime(2000)

      expect(bridgeMocks.saveDocumentContentToBridge).not.toHaveBeenCalled()
      expect(screen.getAllByText(/等待保存…/).length).toBeGreaterThan(0)

      fireEvent.compositionEnd(editor)
      await vi.advanceTimersByTimeAsync(1300)
      expect(bridgeMocks.saveDocumentContentToBridge).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears stale save failure status once the draft returns to a clean state', async () => {
    const user = userEvent.setup()

    bridgeMocks.saveDocumentContentToBridge.mockRejectedValueOnce(
      new Error('Document has changed on disk: .instructions.md'),
    )

    render(<App />)

    const editor = await screen.findByRole('textbox', { name: '可视 Markdown 编辑器' })

    await user.clear(editor)
    await user.type(editor, '# 会先失败的内容')
    await user.click(screen.getByRole('button', { name: '锁定' }))

    await waitFor(() => {
      expect(screen.getAllByText(/保存失败：Document has changed on disk: \.instructions\.md/).length).toBeGreaterThan(0)
    })

    await user.clear(screen.getByRole('textbox', { name: '可视 Markdown 编辑器' }))
    await user.type(screen.getByRole('textbox', { name: '可视 Markdown 编辑器' }), '# 旧标题{enter}{enter}旧内容')
    await user.click(screen.getByRole('button', { name: '锁定' }))

    await waitFor(() => {
      expect(screen.queryByText(/状态：保存失败：Document has changed on disk: \.instructions\.md/)).not.toBeInTheDocument()
    })

    expect(screen.getByText('保存：已保存')).toBeInTheDocument()
    expect(screen.getByText('状态：当前项目：Notes')).toBeInTheDocument()
  })
})
