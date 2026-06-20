import { describe, expect, it } from 'vitest'

import { buildFileTree, createVisibleFileTree, filterFileTree } from '../../src/workspace/file-tree'

describe('buildFileTree', () => {
  it('builds nested directory nodes from markdown-relative paths', () => {
    const tree = buildFileTree([
      'docs/README.md',
      'docs/guides/getting-started.md',
      'notes/daily/2026-06-13.md',
    ])

    expect(tree).toEqual([
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
          {
            id: 'docs/guides',
            kind: 'directory',
            name: 'guides',
            path: 'docs/guides',
            children: [
              {
                id: 'docs/guides/getting-started.md',
                kind: 'file',
                name: 'getting-started.md',
                path: 'docs/guides/getting-started.md',
              },
            ],
          },
        ],
      },
      {
        id: 'notes',
        kind: 'directory',
        name: 'notes',
        path: 'notes',
        children: [
          {
            id: 'notes/daily',
            kind: 'directory',
            name: 'daily',
            path: 'notes/daily',
            children: [
              {
                id: 'notes/daily/2026-06-13.md',
                kind: 'file',
                name: '2026-06-13.md',
                path: 'notes/daily/2026-06-13.md',
              },
            ],
          },
        ],
      },
    ])
  })
})

describe('filterFileTree', () => {
  it('keeps matching files with their directory context when filtering by file name or path segment', () => {
    const tree = buildFileTree([
      'docs/guide.md',
      'docs/api/reference.md',
      'notes/meeting.md',
    ])

    expect(filterFileTree(tree, 'ref')).toEqual([
      {
        id: 'docs',
        kind: 'directory',
        name: 'docs',
        path: 'docs',
        children: [
          {
            id: 'docs/api',
            kind: 'directory',
            name: 'api',
            path: 'docs/api',
            children: [
              {
                id: 'docs/api/reference.md',
                kind: 'file',
                name: 'reference.md',
                path: 'docs/api/reference.md',
              },
            ],
          },
        ],
      },
    ])

    expect(filterFileTree(tree, 'notes/meet')).toEqual([
      {
        id: 'notes',
        kind: 'directory',
        name: 'notes',
        path: 'notes',
        children: [
          {
            id: 'notes/meeting.md',
            kind: 'file',
            name: 'meeting.md',
            path: 'notes/meeting.md',
          },
        ],
      },
    ])
  })

  it('returns the original tree when the query is empty', () => {
    const tree = buildFileTree(['docs/guide.md'])

    expect(filterFileTree(tree, '')).toEqual(tree)
    expect(filterFileTree(tree, '   ')).toEqual(tree)
  })
})

describe('createVisibleFileTree', () => {
  it('hides descendants when an ancestor path is explicitly hidden', () => {
    const tree = buildFileTree(['docs/guide.md', 'docs/private/secret.md'])
    const visibleTree = createVisibleFileTree({
      sourceNodes: tree,
      hiddenPaths: ['docs/private'],
      showHiddenItems: false,
    })

    expect(visibleTree.visibleNodes).toEqual([
      expect.objectContaining({
        path: 'docs',
        children: [expect.objectContaining({ path: 'docs/guide.md' })],
      }),
    ])
  })

  it('keeps hidden descendants in the rendered tree when showHiddenItems is true', () => {
    const tree = buildFileTree(['docs/guide.md', 'docs/private/secret.md'])
    const visibleTree = createVisibleFileTree({
      sourceNodes: tree,
      hiddenPaths: ['docs/private'],
      showHiddenItems: true,
    })

    expect(visibleTree.visibleNodes).toEqual([
      expect.objectContaining({
        path: 'docs',
        children: [
          expect.objectContaining({ path: 'docs/guide.md' }),
          expect.objectContaining({
            path: 'docs/private',
            meta: expect.objectContaining({ isExplicitlyHidden: true }),
            children: [
              expect.objectContaining({
                path: 'docs/private/secret.md',
                meta: expect.objectContaining({ isHiddenByAncestor: true }),
              }),
            ],
          }),
        ],
      }),
    ])
  })

  it('does not mutate or prune the source tree when deriving a visible tree', () => {
    const tree = buildFileTree(['docs/private/secret.md'])

    createVisibleFileTree({
      sourceNodes: tree,
      hiddenPaths: ['docs/private'],
      showHiddenItems: false,
    })

    expect(tree).toEqual([
      expect.objectContaining({
        path: 'docs',
        children: [
          expect.objectContaining({
            path: 'docs/private',
            children: [expect.objectContaining({ path: 'docs/private/secret.md' })],
          }),
        ],
      }),
    ])
  })
})
