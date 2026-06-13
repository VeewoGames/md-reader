import { describe, expect, it } from 'vitest'

import { buildFileTree } from '../../src/workspace/file-tree'

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
