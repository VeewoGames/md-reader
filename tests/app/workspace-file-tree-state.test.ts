import { describe, expect, it } from 'vitest'

import { createInitialExpandedDirectories } from '../../src/app/WorkspaceLayout'

describe('Workspace file tree expansion state', () => {
  it('keeps persisted hidden directory expansions when availableDirectoryPaths still contains the hidden branch', () => {
    const expandedDirectories = createInitialExpandedDirectories(
      ['docs', 'docs/private'],
      'docs/guide.md',
      ['docs', 'docs/private'],
      true,
    )

    expect([...expandedDirectories]).toEqual(['docs', 'docs/private'])
  })

  it('filters out stale persisted directories that no longer exist in the source tree', () => {
    const expandedDirectories = createInitialExpandedDirectories(
      ['docs'],
      'docs/guide.md',
      ['docs', 'docs/private'],
      true,
    )

    expect([...expandedDirectories]).toEqual(['docs'])
  })
})
