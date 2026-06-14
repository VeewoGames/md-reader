import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from '../../src/App'
import { AppShell } from '../../src/app/AppShell'

const defaultTabs = [
  {
    id: 'docs/README.md',
    documentPath: 'docs/README.md',
    title: 'README.md',
    saveState: 'clean' as const,
    saveErrorMessage: null,
  },
]

describe('App', () => {
  it('renders an empty workspace state before any project is connected', () => {
    render(<App />)

    expect(screen.getByRole('combobox', { name: '项目切换' })).toHaveValue('')
    expect(screen.getByRole('button', { name: '接入项目' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '模式切换' })).toBeInTheDocument()
    expect(screen.getAllByText('还没有接入任何 Markdown 项目').length).toBeGreaterThan(0)
  })
})

describe('AppShell', () => {
  it('renders the active project, profile and file tree nodes', async () => {
    render(
      <AppShell
        projects={[
          {
            id: 'notes',
            name: 'Notes',
            rootHandleKey: 'handle:notes',
            contentRoots: ['docs'],
            permissionState: 'granted',
          },
        ]}
        activeProjectId="notes"
        profileIds={['default', 'writer']}
        activeProfileId="writer"
        tabs={defaultTabs}
        activeTabId="docs/README.md"
        mode="regular"
        regularViewState="locked"
        fileTree={[
          {
            id: 'docs',
            kind: 'directory',
            name: 'docs',
            path: 'docs',
            children: [
              {
                id: 'docs/README.md',
                kind: 'file',
                name: 'README.md',
                path: 'docs/README.md',
              },
            ],
          },
        ]}
        currentDocumentPath="docs/README.md"
        currentDocumentContent={'# Readme\n\nHello world'}
        statusMessage="项目已接入"
        sidebarWidth={280}
        outlineWidth={320}
        canManageService
        onConnectProject={() => {}}
        onProjectChange={() => {}}
        onProfileChange={() => {}}
        onModeChange={() => {}}
        onToggleRegularLock={() => {}}
        onTabSelect={() => {}}
        onTabClose={() => {}}
        onRestartService={() => {}}
        onStopService={() => {}}
        onDocumentSelect={() => {}}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    expect(screen.getByRole('combobox', { name: '项目切换' })).toHaveValue('notes')
    expect(screen.getByRole('combobox', { name: 'Profile 切换' })).toHaveValue('writer')
    expect(screen.getByRole('tab', { name: /README\.md/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: '常规' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '解锁' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'docs' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'README.md' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('heading', { name: 'Readme' })).toBeInTheDocument()
    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '文档标题导航' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Readme' })).toHaveAttribute('aria-current', 'location')
    expect(screen.getByRole('button', { name: '重启服务' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭服务' })).toBeInTheDocument()
  })

  it('toggles non-current directories without affecting file selection wiring', async () => {
    const user = userEvent.setup()
    const onDocumentSelect = vi.fn()

    render(
      <AppShell
        projects={[
          {
            id: 'notes',
            name: 'Notes',
            rootHandleKey: 'handle:notes',
            contentRoots: ['docs'],
            permissionState: 'granted',
          },
        ]}
        activeProjectId="notes"
        profileIds={['default']}
        activeProfileId="default"
        tabs={[]}
        activeTabId={null}
        mode="regular"
        regularViewState="locked"
        fileTree={[
          {
            id: 'docs',
            kind: 'directory',
            name: 'docs',
            path: 'docs',
            children: [
              {
                id: 'docs/guides',
                kind: 'directory',
                name: 'guides',
                path: 'docs/guides',
                children: [
                  {
                    id: 'docs/guides/intro.md',
                    kind: 'file',
                    name: 'intro.md',
                    path: 'docs/guides/intro.md',
                  },
                ],
              },
            ],
          },
        ]}
        currentDocumentPath={null}
        currentDocumentContent={null}
        statusMessage="项目已接入"
        sidebarWidth={280}
        outlineWidth={320}
        onConnectProject={() => {}}
        onProjectChange={() => {}}
        onProfileChange={() => {}}
        onModeChange={() => {}}
        onToggleRegularLock={() => {}}
        onTabSelect={() => {}}
        onTabClose={() => {}}
        onRestartService={() => {}}
        onStopService={() => {}}
        onDocumentSelect={onDocumentSelect}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    const guidesDirectory = screen.getByRole('button', { name: 'guides' })

    expect(guidesDirectory).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'intro.md' })).not.toBeInTheDocument()

    await user.click(guidesDirectory)

    expect(guidesDirectory).toHaveAttribute('aria-expanded', 'true')

    const introDocument = screen.getByRole('button', { name: 'intro.md' })

    await user.click(introDocument)

    expect(onDocumentSelect).toHaveBeenCalledWith('docs/guides/intro.md')

    await user.click(guidesDirectory)

    expect(guidesDirectory).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'intro.md' })).not.toBeInTheDocument()
  })

  it('keeps the current document ancestors expanded', () => {
    render(
      <AppShell
        projects={[
          {
            id: 'notes',
            name: 'Notes',
            rootHandleKey: 'handle:notes',
            contentRoots: ['docs'],
            permissionState: 'granted',
          },
        ]}
        activeProjectId="notes"
        profileIds={['default']}
        activeProfileId="default"
        tabs={[
          {
            id: 'docs/guides/intro.md',
            documentPath: 'docs/guides/intro.md',
            title: 'intro.md',
            saveState: 'clean',
            saveErrorMessage: null,
          },
        ]}
        activeTabId="docs/guides/intro.md"
        mode="regular"
        regularViewState="editable"
        fileTree={[
          {
            id: 'docs',
            kind: 'directory',
            name: 'docs',
            path: 'docs',
            children: [
              {
                id: 'docs/guides',
                kind: 'directory',
                name: 'guides',
                path: 'docs/guides',
                children: [
                  {
                    id: 'docs/guides/intro.md',
                    kind: 'file',
                    name: 'intro.md',
                    path: 'docs/guides/intro.md',
                  },
                ],
              },
            ],
          },
        ]}
        currentDocumentPath="docs/guides/intro.md"
        currentDocumentContent={'# Intro'}
        statusMessage="项目已接入"
        sidebarWidth={280}
        outlineWidth={320}
        onConnectProject={() => {}}
        onProjectChange={() => {}}
        onProfileChange={() => {}}
        onModeChange={() => {}}
        onToggleRegularLock={() => {}}
        onTabSelect={() => {}}
        onTabClose={() => {}}
        onRestartService={() => {}}
        onStopService={() => {}}
        onDocumentSelect={() => {}}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'docs' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'guides' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'intro.md' })).toHaveAttribute('aria-current', 'page')
  })

  it('allows collapsing the current document branch manually', async () => {
    const user = userEvent.setup()

    render(
      <AppShell
        projects={[
          {
            id: 'notes',
            name: 'Notes',
            rootHandleKey: 'handle:notes',
            contentRoots: ['docs'],
            permissionState: 'granted',
          },
        ]}
        activeProjectId="notes"
        profileIds={['default']}
        activeProfileId="default"
        tabs={[
          {
            id: 'docs/guides/intro.md',
            documentPath: 'docs/guides/intro.md',
            title: 'intro.md',
            saveState: 'clean',
            saveErrorMessage: null,
          },
        ]}
        activeTabId="docs/guides/intro.md"
        mode="regular"
        regularViewState="editable"
        fileTree={[
          {
            id: 'docs',
            kind: 'directory',
            name: 'docs',
            path: 'docs',
            children: [
              {
                id: 'docs/guides',
                kind: 'directory',
                name: 'guides',
                path: 'docs/guides',
                children: [
                  {
                    id: 'docs/guides/intro.md',
                    kind: 'file',
                    name: 'intro.md',
                    path: 'docs/guides/intro.md',
                  },
                ],
              },
            ],
          },
        ]}
        currentDocumentPath="docs/guides/intro.md"
        currentDocumentContent={'# Intro'}
        statusMessage="项目已接入"
        sidebarWidth={280}
        outlineWidth={320}
        onConnectProject={() => {}}
        onProjectChange={() => {}}
        onProfileChange={() => {}}
        onModeChange={() => {}}
        onToggleRegularLock={() => {}}
        onTabSelect={() => {}}
        onTabClose={() => {}}
        onRestartService={() => {}}
        onStopService={() => {}}
        onDocumentSelect={() => {}}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    const guidesDirectory = screen.getByRole('button', { name: 'guides' })

    expect(guidesDirectory).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'intro.md' })).toBeInTheDocument()

    await user.click(guidesDirectory)

    expect(guidesDirectory).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'intro.md' })).not.toBeInTheDocument()
  })

  it('shows a lock button and forwards unlock actions in regular mode', async () => {
    const user = userEvent.setup()
    const onToggleRegularLock = vi.fn()
    const onTabClose = vi.fn()

    render(
      <AppShell
        projects={[
          {
            id: 'notes',
            name: 'Notes',
            rootHandleKey: 'handle:notes',
            contentRoots: ['docs'],
            permissionState: 'granted',
          },
        ]}
        activeProjectId="notes"
        profileIds={['default']}
        activeProfileId="default"
        tabs={defaultTabs}
        activeTabId="docs/README.md"
        mode="regular"
        regularViewState="locked"
        fileTree={[]}
        currentDocumentPath="docs/README.md"
        currentDocumentContent={'# Readme'}
        statusMessage="项目已接入"
        sidebarWidth={280}
        outlineWidth={320}
        onConnectProject={() => {}}
        onProjectChange={() => {}}
        onProfileChange={() => {}}
        onModeChange={() => {}}
        onToggleRegularLock={onToggleRegularLock}
        onTabSelect={() => {}}
        onTabClose={onTabClose}
        onRestartService={() => {}}
        onStopService={() => {}}
        onDocumentSelect={() => {}}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: '解锁' }))
    await user.click(screen.getByRole('button', { name: '关闭标签：README.md' }))

    expect(onToggleRegularLock).toHaveBeenCalledTimes(1)
    expect(onTabClose).toHaveBeenCalledWith('docs/README.md')
  })
})
