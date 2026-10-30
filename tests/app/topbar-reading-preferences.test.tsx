vi.mock('../../src/editor/visual-markdown-editor-loader', () => ({ preloadVisualMarkdownEditor: vi.fn() }))
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/editor/visual-markdown-editor', () => ({
  preloadVisualMarkdownEditor: vi.fn(),
  VisualMarkdownEditor: ({ value }: { value: string }) => (
    <div aria-label="可视 Markdown 编辑器">{value}</div>
  ),
}))

vi.mock('../../src/document-renderer/readonly-markdown-renderer', () => ({
  ReadonlyMarkdownRenderer: ({ value }: { value: string }) => (
    <article aria-label="只读 Markdown 渲染器">{value}</article>
  ),
}))

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
    const onHideFileTitleDateChange = vi.fn()
    const onMaxUnpinnedTabsChange = vi.fn()
    const onTabPin = vi.fn()

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
        availableDirectoryPaths={[]}
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
        onTabPin={onTabPin}
        onRestartService={() => {}}
        onStopService={() => {}}
        onDocumentSelect={() => {}}
        onDocumentFontSizeChange={onFontSizeChange}
        onMaxUnpinnedTabsChange={onMaxUnpinnedTabsChange}
        onDocumentPageWidthChange={onPageWidthChange}
        onDocumentLineHeightChange={onLineHeightChange}
        onHideFileTitleDateChange={onHideFileTitleDateChange}
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
    expect(screen.getByRole('button', { name: '全屏' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '隐藏标题日期' })).not.toBeChecked()
    const slider = screen.getByRole('slider', { name: /未固定标签上限/ })
    expect(slider).toHaveAttribute('min', '1')
    expect(slider).toHaveAttribute('max', '30')
    fireEvent.change(slider, { target: { value: '12' } })
    expect(onMaxUnpinnedTabsChange).toHaveBeenCalledWith(12)

    await user.click(screen.getByRole('button', { name: '17 px' }))
    await user.click(screen.getByRole('button', { name: '全屏' }))
    await user.click(screen.getByRole('button', { name: '1.8' }))
    await user.click(screen.getByRole('checkbox', { name: '隐藏标题日期' }))

    expect(onFontSizeChange).toHaveBeenCalledWith(17)
    expect(onPageWidthChange).toHaveBeenCalledWith('full')
    expect(onLineHeightChange).toHaveBeenCalledWith(1.8)
    expect(onHideFileTitleDateChange).toHaveBeenCalledWith(true)

    const pin = screen.getByRole('button', { name: '固定标签：README.md' })
    const wrapper = pin.parentElement!
    fireEvent.mouseEnter(wrapper)
    expect(wrapper).toHaveAttribute('data-pin-visible', 'true')
    fireEvent.click(pin)
    expect(onTabPin).toHaveBeenCalledWith('docs/README.md')
    fireEvent.mouseLeave(wrapper)
    expect(wrapper).not.toHaveAttribute('data-pin-visible')
  })
})
