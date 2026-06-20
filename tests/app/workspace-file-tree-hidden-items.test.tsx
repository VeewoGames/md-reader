import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { WorkspaceFileTree } from '../../src/app/WorkspaceLayout'
import { buildFileTree, createVisibleFileTree } from '../../src/workspace/file-tree'

describe('WorkspaceFileTree hidden items actions', () => {
  it('calls onHidePath for a visible document action button', async () => {
    const user = userEvent.setup()
    const onHidePath = vi.fn()

    render(
      <WorkspaceFileTree
        nodes={
          createVisibleFileTree({
            sourceNodes: buildFileTree(['docs/guide.md']),
            hiddenPaths: [],
            showHiddenItems: false,
          }).visibleNodes
        }
        level={0}
        searchActive={false}
        currentDocumentPath="docs/guide.md"
        expandedDirectories={new Set(['docs'])}
        onToggleDirectory={() => {}}
        onDocumentSelect={() => {}}
        showHiddenItems={false}
        onHidePath={onHidePath}
        onUnhidePath={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: '隐藏 guide.md' }))

    expect(onHidePath).toHaveBeenCalledWith('docs/guide.md')
  })

  it('switches explicit hidden directory actions to unhide in showHiddenItems mode', async () => {
    const user = userEvent.setup()
    const onUnhidePath = vi.fn()

    render(
      <WorkspaceFileTree
        nodes={
          createVisibleFileTree({
            sourceNodes: buildFileTree(['docs/private/secret.md']),
            hiddenPaths: ['docs/private'],
            showHiddenItems: true,
          }).visibleNodes
        }
        level={0}
        searchActive={false}
        currentDocumentPath={null}
        expandedDirectories={new Set(['docs'])}
        onToggleDirectory={() => {}}
        onDocumentSelect={() => {}}
        showHiddenItems
        onHidePath={() => {}}
        onUnhidePath={onUnhidePath}
      />,
    )

    await user.click(screen.getByRole('button', { name: '显示 private' }))

    expect(onUnhidePath).toHaveBeenCalledWith('docs/private')
  })

  it('does not offer direct unhide for nodes hidden only by an ancestor', () => {
    render(
      <WorkspaceFileTree
        nodes={
          createVisibleFileTree({
            sourceNodes: buildFileTree(['docs/private/secret.md']),
            hiddenPaths: ['docs/private'],
            showHiddenItems: true,
          }).visibleNodes
        }
        level={0}
        searchActive={false}
        currentDocumentPath={null}
        expandedDirectories={new Set(['docs', 'docs/private'])}
        onToggleDirectory={() => {}}
        onDocumentSelect={() => {}}
        showHiddenItems
        onHidePath={() => {}}
        onUnhidePath={() => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: '显示 secret.md' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '隐藏 secret.md' })).not.toBeInTheDocument()
  })
})
