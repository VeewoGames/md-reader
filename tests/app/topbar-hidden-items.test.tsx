import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TopBar } from '../../src/app/TopBar'

function renderTopBar({
  mode = 'regular',
  showHiddenItems = false,
  onToggleShowHiddenItems = () => {},
  onRefreshFileTree = () => {},
}: {
  mode?: 'regular' | 'split'
  showHiddenItems?: boolean
  onToggleShowHiddenItems?: () => void
  onRefreshFileTree?: () => void
} = {}) {
  return render(
    <TopBar
      projects={[]}
      activeProjectId="notes"
      profileIds={['default']}
      activeProfileId="default"
      tabs={[]}
      activeTabId={null}
      mode={mode}
      regularViewState="locked"
      statusMessage={null}
      onConnectProject={() => {}}
      onProjectChange={() => {}}
      onProfileChange={() => {}}
      onModeChange={() => {}}
      onToggleRegularLock={() => {}}
      showHiddenItems={showHiddenItems}
      onToggleShowHiddenItems={onToggleShowHiddenItems}
      onTabSelect={() => {}}
      onTabClose={() => {}}
      onRefreshFileTree={onRefreshFileTree}
    />,
  )
}

describe('TopBar hidden items toggle', () => {
  it('places file tree refresh directly before current document refresh', async () => {
    const user = userEvent.setup()
    const onRefreshFileTree = vi.fn()
    renderTopBar({ onRefreshFileTree })

    const treeRefresh = screen.getByRole('button', { name: '刷新文件树' })
    const documentRefresh = screen.getByRole('button', { name: '刷新当前文档' })

    expect(treeRefresh.compareDocumentPosition(documentRefresh) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    await user.click(treeRefresh)
    expect(onRefreshFileTree).toHaveBeenCalledTimes(1)
  })

  it('renders the hidden items toggle next to the regular lock button', () => {
    renderTopBar({ mode: 'regular', showHiddenItems: false })

    expect(screen.getByRole('button', { name: '显示隐藏项' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: '解锁' })).toBeInTheDocument()
  })

  it('keeps the hidden items toggle visible in split mode and forwards clicks', async () => {
    const user = userEvent.setup()
    const onToggleShowHiddenItems = vi.fn()

    renderTopBar({
      mode: 'split',
      showHiddenItems: true,
      onToggleShowHiddenItems,
    })

    const toggle = screen.getByRole('button', { name: '显示隐藏项' })

    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await user.click(toggle)

    expect(onToggleShowHiddenItems).toHaveBeenCalledTimes(1)
  })
})
