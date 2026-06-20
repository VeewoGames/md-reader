import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TopBar } from '../../src/app/TopBar'

function renderTopBar({
  mode = 'regular',
  showHiddenItems = false,
  onToggleShowHiddenItems = () => {},
}: {
  mode?: 'regular' | 'split'
  showHiddenItems?: boolean
  onToggleShowHiddenItems?: () => void
} = {}) {
  return render(
    <TopBar
      projects={[]}
      activeProjectId={null}
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
    />,
  )
}

describe('TopBar hidden items toggle', () => {
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
