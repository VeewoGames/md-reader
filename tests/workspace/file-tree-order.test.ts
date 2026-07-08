import { describe, expect, it } from 'vitest'

import { buildFileTree } from '../../src/workspace/file-tree'
import {
  appendNodeToManualOrder,
  applyManualTreeOrder,
  moveNodeToParentTailInManualOrder,
  normalizeManualNodeOrderByParent,
  removeNodeFromManualOrder,
  reorderManualNodeOrder,
  rewriteManualOrderPaths,
  ROOT_ORDER_KEY,
} from '../../src/workspace/file-tree-order'

describe('file tree manual order', () => {
  it('applies root and nested order while appending unknown nodes at the end', () => {
    const tree = buildFileTree([
      'docs/guide.md',
      'docs/reference.md',
      'docs/api/index.md',
      'notes/todo.md',
    ])

    const orderedTree = applyManualTreeOrder(tree, {
      [ROOT_ORDER_KEY]: ['notes', 'docs'],
      docs: ['docs/api', 'docs/reference.md'],
    })

    expect(orderedTree.map((node) => node.path)).toEqual(['notes', 'docs'])
    expect(orderedTree[1]?.kind).toBe('directory')
    expect(orderedTree[1]?.kind === 'directory' ? orderedTree[1].children.map((node) => node.path) : []).toEqual([
      'docs/api',
      'docs/reference.md',
      'docs/guide.md',
    ])
  })

  it('normalizes invalid paths and preserves scanned order for unknown entries', () => {
    const tree = buildFileTree([
      'docs/guide.md',
      'docs/reference.md',
      'notes/todo.md',
    ])

    expect(
      normalizeManualNodeOrderByParent(
        {
          [ROOT_ORDER_KEY]: ['ghost', 'notes'],
          docs: ['docs/missing.md', 'docs/reference.md'],
        },
        tree,
      ),
    ).toEqual({
      [ROOT_ORDER_KEY]: ['notes', 'docs'],
      docs: ['docs/reference.md', 'docs/guide.md'],
      notes: ['notes/todo.md'],
    })
  })

  it('reorders siblings within the same parent', () => {
    const orderMap = {
      [ROOT_ORDER_KEY]: ['docs', 'notes', 'temp'],
    }

    expect(
      reorderManualNodeOrder(orderMap, {
        sourcePath: 'temp',
        sourceParentPath: null,
        targetPath: 'docs',
        targetParentPath: null,
        position: 'before',
      }),
    ).toEqual({
      [ROOT_ORDER_KEY]: ['temp', 'docs', 'notes'],
    })

    expect(
      reorderManualNodeOrder(orderMap, {
        sourcePath: 'docs',
        sourceParentPath: null,
        targetPath: null,
        targetParentPath: null,
        position: 'tail',
      }),
    ).toEqual({
      [ROOT_ORDER_KEY]: ['notes', 'temp', 'docs'],
    })
  })

  it('supports the first reorder after normalizing an empty order map', () => {
    const tree = buildFileTree([
      'docs/guide.md',
      'notes/todo.md',
      'temp/scratch.md',
    ])

    const normalized = normalizeManualNodeOrderByParent({}, tree)

    expect(
      reorderManualNodeOrder(normalized, {
        sourcePath: 'temp',
        sourceParentPath: null,
        targetPath: 'docs',
        targetParentPath: null,
        position: 'before',
      }),
    ).toEqual({
      [ROOT_ORDER_KEY]: ['temp', 'docs', 'notes'],
      docs: ['docs/guide.md'],
      notes: ['notes/todo.md'],
      temp: ['temp/scratch.md'],
    })
  })

  it('ignores cross-parent reorder requests in the first version', () => {
    const orderMap = {
      [ROOT_ORDER_KEY]: ['docs', 'notes'],
      docs: ['docs/guide.md'],
      notes: ['notes/todo.md'],
    }

    expect(
      reorderManualNodeOrder(orderMap, {
        sourcePath: 'docs/guide.md',
        sourceParentPath: 'docs',
        targetPath: 'notes/todo.md',
        targetParentPath: 'notes',
        position: 'before',
      }),
    ).toEqual(orderMap)
  })

  it('adds a new child to the parent tail', () => {
    expect(
      appendNodeToManualOrder(
        {
          docs: ['docs/reference.md', 'docs/guide.md'],
        },
        'docs/new.md',
      ),
    ).toEqual({
      docs: ['docs/reference.md', 'docs/guide.md', 'docs/new.md'],
    })
  })

  it('rewrites descendant paths after a directory rename', () => {
    expect(
      rewriteManualOrderPaths(
        {
          [ROOT_ORDER_KEY]: ['docs', 'notes'],
          docs: ['docs/guide.md', 'docs/api'],
          'docs/api': ['docs/api/reference.md'],
        },
        'docs',
        'knowledge',
      ),
    ).toEqual({
      [ROOT_ORDER_KEY]: ['knowledge', 'notes'],
      knowledge: ['knowledge/guide.md', 'knowledge/api'],
      'knowledge/api': ['knowledge/api/reference.md'],
    })
  })

  it('moves a node into the new parent tail for real path moves', () => {
    expect(
      moveNodeToParentTailInManualOrder(
        {
          [ROOT_ORDER_KEY]: ['docs', 'archive'],
          docs: ['docs/guide.md', 'docs/reference.md'],
          archive: ['archive/legacy.md'],
        },
        'docs/guide.md',
        'archive/guide.md',
      ),
    ).toEqual({
      [ROOT_ORDER_KEY]: ['docs', 'archive'],
      docs: ['docs/reference.md'],
      archive: ['archive/legacy.md', 'archive/guide.md'],
    })
  })

  it('removes deleted nodes and orphaned parent keys', () => {
    expect(
      removeNodeFromManualOrder(
        {
          [ROOT_ORDER_KEY]: ['docs', 'notes'],
          docs: ['docs/guide.md', 'docs/api'],
          'docs/api': ['docs/api/reference.md'],
          notes: ['notes/todo.md'],
        },
        'docs',
      ),
    ).toEqual({
      [ROOT_ORDER_KEY]: ['notes'],
      notes: ['notes/todo.md'],
    })
  })
})
