import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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

describe('TopBar reading preferences', () => {
  it('opens the reading preferences popover and forwards font size and page width changes', async () => {
    const user = userEvent.setup()
    const onFontSizeChange = vi.fn()
    const onPageWidthChange = vi.fn()
    const onLineHeightChange = vi.fn()

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
        documentFontSize={16}
        documentPageWidth="narrow"
        documentLineHeight={1.6}
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
        onDocumentFontSizeChange={onFontSizeChange}
        onDocumentPageWidthChange={onPageWidthChange}
        onDocumentLineHeightChange={onLineHeightChange}
        onSidebarWidthChange={() => {}}
        onSidebarWidthCommit={() => {}}
        onOutlineWidthChange={() => {}}
        onOutlineWidthCommit={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: '阅读选项' }))

    expect(screen.getByRole('group', { name: '阅读偏好' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重启服务' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '15 px' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '17 px' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1.5' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2.0' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '17 px' }))
    await user.click(screen.getByRole('button', { name: '宽版' }))
    await user.click(screen.getByRole('button', { name: '1.8' }))

    expect(onFontSizeChange).toHaveBeenCalledWith(17)
    expect(onPageWidthChange).toHaveBeenCalledWith('wide')
    expect(onLineHeightChange).toHaveBeenCalledWith(1.8)
  })
})
