import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { TopBar } from '../../src/app/TopBar'

const tabs = [
  {
    id: 'a',
    documentPath: 'docs/a.md',
    title: 'a.md',
    saveState: 'clean' as const,
    saveErrorMessage: null,
  },
  {
    id: 'b',
    documentPath: 'docs/b.md',
    title: 'b.md',
    saveState: 'clean' as const,
    saveErrorMessage: null,
  },
  {
    id: 'c',
    documentPath: 'docs/c.md',
    title: 'c.md',
    saveState: 'clean' as const,
    saveErrorMessage: null,
  },
]

function renderTopBar(overrides?: {
  activeTabId?: string | null
  onTabReorder?: (nextOrderedTabIds: string[]) => void
  onTabSelect?: (tabId: string) => void
  onTabClose?: (tabId: string) => void
}) {
  return render(
    <TopBar
      projects={[]}
      activeProjectId={null}
      profileIds={['default']}
      activeProfileId="default"
      tabs={tabs}
      activeTabId={overrides?.activeTabId ?? 'a'}
      mode="regular"
      regularViewState="locked"
      statusMessage="项目已接入"
      onConnectProject={() => {}}
      onProjectChange={() => {}}
      onProfileChange={() => {}}
      onModeChange={() => {}}
      onToggleRegularLock={() => {}}
      onTabSelect={overrides?.onTabSelect ?? vi.fn()}
      onTabClose={overrides?.onTabClose ?? vi.fn()}
      onTabReorder={overrides?.onTabReorder ?? vi.fn()}
    />,
  )
}

function stubRect(element: HTMLElement, rect: { left: number; width: number; height: number }) {
  element.getBoundingClientRect = vi.fn(() => ({
    x: rect.left,
    y: 0,
    top: 0,
    right: rect.left + rect.width,
    bottom: rect.height,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    toJSON: () => '',
  }))
}

function stubOverflow(
  element: HTMLElement,
  dimensions: {
    clientWidth: number
    scrollWidth: number
  },
) {
  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    get: () => dimensions.clientWidth,
  })
  Object.defineProperty(element, 'scrollWidth', {
    configurable: true,
    get: () => dimensions.scrollWidth,
  })
}

describe('TopBar tab drag', () => {
  it('does not reorder on click-sized movement', () => {
    const onTabReorder = vi.fn()
    const onTabSelect = vi.fn()

    renderTopBar({ onTabReorder, onTabSelect })

    const tab = screen.getByRole('tab', { name: 'a.md' })
    fireEvent.pointerDown(tab, { pointerId: 1, clientX: 40, button: 0 })
    fireEvent.pointerMove(tab, { pointerId: 1, clientX: 44 })
    fireEvent.pointerUp(tab, { pointerId: 1, clientX: 44 })

    expect(onTabReorder).not.toHaveBeenCalled()
    expect(onTabSelect).toHaveBeenCalledWith('a')
  })

  it('reorders after crossing the neighbor midpoint', () => {
    const onTabReorder = vi.fn()

    renderTopBar({ onTabReorder })
    const [a, b] = [
      screen.getByRole('tab', { name: 'a.md' }),
      screen.getByRole('tab', { name: 'b.md' }),
    ]

    stubRect(a, { left: 0, width: 100, height: 34 })
    stubRect(b, { left: 110, width: 100, height: 34 })

    fireEvent.pointerDown(a, { pointerId: 1, clientX: 40, button: 0 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 170 })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 170 })

    expect(onTabReorder).toHaveBeenCalledWith(['b', 'a', 'c'])
  })

  it('keeps the dragged tab on its pointer-aligned track while siblings shift', () => {
    renderTopBar()
    const [a, b] = [
      screen.getByRole('tab', { name: 'a.md' }),
      screen.getByRole('tab', { name: 'b.md' }),
    ]

    stubRect(a, { left: 0, width: 100, height: 34 })
    stubRect(b, { left: 110, width: 100, height: 34 })

    fireEvent.pointerDown(a, { pointerId: 1, clientX: 40, button: 0 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 170 })

    const wrappers = screen.getAllByRole('tab').map((tab) => tab.closest('.topbar__tab'))

    expect(wrappers[0]).toContainElement(a)
    expect(wrappers[1]).toContainElement(b)
    expect(a.closest('.topbar__tab')).toHaveStyle({ transform: 'translateX(130px)' })
    expect(b.closest('.topbar__tab')).toHaveStyle({ transform: 'translateX(-110px)' })
  })

  it('moves each yielded sibling into the next slot instead of stacking when dragging the last tab leftward', () => {
    renderTopBar()
    const [a, b, c] = [
      screen.getByRole('tab', { name: 'a.md' }),
      screen.getByRole('tab', { name: 'b.md' }),
      screen.getByRole('tab', { name: 'c.md' }),
    ]

    stubRect(a, { left: 0, width: 100, height: 34 })
    stubRect(b, { left: 110, width: 100, height: 34 })
    stubRect(c, { left: 220, width: 100, height: 34 })

    fireEvent.pointerDown(c, { pointerId: 1, clientX: 260, button: 0 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 10 })

    expect(c.closest('.topbar__tab')).toHaveStyle({ transform: 'translateX(-250px)' })
    expect(a.closest('.topbar__tab')).toHaveStyle({ transform: 'translateX(110px)' })
    expect(b.closest('.topbar__tab')).toHaveStyle({ transform: 'translateX(110px)' })
  })

  it('never starts drag from the close button', () => {
    const onTabReorder = vi.fn()

    renderTopBar({ onTabReorder })
    const closeButton = screen.getByRole('button', { name: '关闭标签：a.md' })

    fireEvent.pointerDown(closeButton, { pointerId: 1, clientX: 96, button: 0 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 180 })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 180 })

    expect(onTabReorder).not.toHaveBeenCalled()
  })

  it('returns focus to the dragged tab and keeps aria-selected after drop', () => {
    const onTabReorder = vi.fn()

    renderTopBar({ onTabReorder, activeTabId: 'a' })
    const [a, b] = [
      screen.getByRole('tab', { name: 'a.md' }),
      screen.getByRole('tab', { name: 'b.md' }),
    ]

    stubRect(a, { left: 0, width: 100, height: 34 })
    stubRect(b, { left: 110, width: 100, height: 34 })

    a.focus()
    fireEvent.pointerDown(a, { pointerId: 1, clientX: 40, button: 0 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 170 })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 170 })

    expect(a).toHaveFocus()
    expect(a).toHaveAttribute('aria-selected', 'true')
  })

  it('clears drag transform before a parent-controlled reorder render lands', () => {
    function Harness() {
      const [orderedTabs, setOrderedTabs] = useState(tabs)

      return (
        <TopBar
          projects={[]}
          activeProjectId={null}
          profileIds={['default']}
          activeProfileId="default"
          tabs={orderedTabs}
          activeTabId="a"
          mode="regular"
          regularViewState="locked"
          statusMessage="项目已接入"
          onConnectProject={() => {}}
          onProjectChange={() => {}}
          onProfileChange={() => {}}
          onModeChange={() => {}}
          onToggleRegularLock={() => {}}
          onTabSelect={() => {}}
          onTabClose={() => {}}
          onTabReorder={(nextOrderedTabIds) => {
            setOrderedTabs(nextOrderedTabIds.map((id) => orderedTabs.find((tab) => tab.id === id)!))
          }}
        />
      )
    }

    render(<Harness />)
    const [a, b] = [
      screen.getByRole('tab', { name: 'a.md' }),
      screen.getByRole('tab', { name: 'b.md' }),
    ]

    stubRect(a, { left: 0, width: 100, height: 34 })
    stubRect(b, { left: 110, width: 100, height: 34 })

    fireEvent.pointerDown(a, { pointerId: 1, clientX: 40, button: 0 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 170 })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 170 })

    const renderedTabs = screen.getAllByRole('tab')
    expect(renderedTabs.map((tab) => tab.textContent)).toEqual(['b.md', 'a.md', 'c.md'])
    expect(renderedTabs[1]?.closest('.topbar__tab')).not.toHaveStyle({ transform: 'translateX(130px)' })
    expect(renderedTabs[1]?.closest('.topbar__tab')).toHaveAttribute('data-settling-dragged', 'true')
    expect(renderedTabs[1]?.closest('.topbar__tab')).not.toHaveAttribute('data-settling', 'true')
  })

  it('shows a custom tooltip with the full title only when the label is actually truncated', () => {
    const longTitle = '项目文档/标准&指南/规则特质设计指南（AI专用）.md'

    render(
      <TopBar
        projects={[]}
        activeProjectId={null}
        profileIds={['default']}
        activeProfileId="default"
        tabs={[
          {
            id: 'long',
            documentPath: 'docs/long.md',
            title: longTitle,
            saveState: 'clean',
            saveErrorMessage: null,
          },
        ]}
        activeTabId="long"
        mode="regular"
        regularViewState="locked"
        statusMessage="项目已接入"
        onConnectProject={() => {}}
        onProjectChange={() => {}}
        onProfileChange={() => {}}
        onModeChange={() => {}}
        onToggleRegularLock={() => {}}
        onTabSelect={() => {}}
        onTabClose={() => {}}
        onTabReorder={() => {}}
      />,
    )

    const tab = screen.getByRole('tab', { name: longTitle })
    const tabWrapper = tab.closest('.topbar__tab')
    const label = tab.querySelector('.topbar__tab-label') as HTMLElement

    expect(tabWrapper).not.toHaveAttribute('title')

    stubRect(tab, { left: 120, width: 160, height: 34 })
    stubOverflow(label, { clientWidth: 96, scrollWidth: 280 })
    fireEvent.mouseEnter(tab)

    expect(screen.getByRole('tooltip')).toHaveTextContent(longTitle)

    fireEvent.mouseLeave(tab)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('does not show the custom tooltip when the label fits in the tab', () => {
    renderTopBar()
    const tab = screen.getByRole('tab', { name: 'a.md' })
    const tabWrapper = tab.closest('.topbar__tab')
    const label = tab.querySelector('.topbar__tab-label') as HTMLElement

    expect(tabWrapper).not.toHaveAttribute('title')

    stubRect(tab, { left: 120, width: 160, height: 34 })
    stubOverflow(label, { clientWidth: 120, scrollWidth: 120 })
    fireEvent.mouseEnter(tab)

    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
