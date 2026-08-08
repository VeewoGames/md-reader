import { describe, expect, it } from 'vitest'

import { resolveDocumentLink } from '../../src/markdown/document-link'

const documentPaths = ['docs/current.md', 'docs/guide.md', 'docs/nested/target.mdx', 'notes/guide.md']
const contentRoots = ['docs', 'notes']

function resolve(href: string, currentDocumentPath = 'docs/current.md') {
  return resolveDocumentLink({ currentDocumentPath, href, documentPaths, contentRoots })
}

describe('resolveDocumentLink', () => {
  it('keeps approved external and non-Markdown links in the browser', () => {
    expect(resolve('https://example.com/guide')).toEqual({ kind: 'external', href: 'https://example.com/guide' })
    expect(resolve('mailto:writer@example.com')).toEqual({ kind: 'external', href: 'mailto:writer@example.com' })
    expect(resolve('//example.com/guide')).toEqual({ kind: 'external', href: '//example.com/guide' })
    expect(resolve('./asset.pdf')).toEqual({ kind: 'external', href: './asset.pdf' })
  })

  it('resolves current-document anchors with the shared heading slug rule', () => {
    expect(resolve('#Design%20Goal')).toEqual({ kind: 'anchor', headingId: 'design-goal' })
    expect(resolve('#Design%23Goal')).toEqual({ kind: 'anchor', headingId: 'design-goal' })
    expect(resolve('#Design-Goal-2')).toEqual({ kind: 'anchor', headingId: 'design-goal-2' })
    expect(resolve('#')).toEqual({ kind: 'invalid', href: '#', reason: 'empty-fragment' })
  })

  it('resolves sibling, parent, root and mdx document paths by exact file-tree match', () => {
    expect(resolve('./guide.md')).toEqual({ kind: 'internal', documentPath: 'docs/guide.md', headingId: null })
    expect(resolve('nested/target.mdx')).toEqual({
      kind: 'internal',
      documentPath: 'docs/nested/target.mdx',
      headingId: null,
    })
    expect(resolve('../guide.md', 'docs/nested/current.md')).toEqual({
      kind: 'internal',
      documentPath: 'docs/guide.md',
      headingId: null,
    })
    expect(resolve('/notes/guide.md')).toEqual({
      kind: 'internal',
      documentPath: 'notes/guide.md',
      headingId: null,
    })
  })

  it('normalizes encoded paths and cross-document heading fragments', () => {
    expect(
      resolveDocumentLink({
        currentDocumentPath: 'docs/当前.md',
        href: './%E6%8C%87%E5%8D%97.md#%E8%AE%BE%E8%AE%A1%20%E7%9B%AE%E6%A0%87',
        documentPaths: ['docs/当前.md', 'docs/指南.md'],
        contentRoots: ['docs'],
      }),
    ).toEqual({ kind: 'internal', documentPath: 'docs/指南.md', headingId: '设计-目标' })
  })

  it('returns controlled failures for unsafe, malformed and missing document candidates', () => {
    expect(resolve('%E0%A4%A.md')).toEqual({ kind: 'invalid', href: '%E0%A4%A.md', reason: 'invalid-percent-encoding' })
    expect(resolve('../outside.md')).toEqual({ kind: 'invalid', href: '../outside.md', reason: 'path-outside-content-roots' })
    expect(resolve('%2e%2e/outside.md')).toEqual({
      kind: 'invalid',
      href: '%2e%2e/outside.md',
      reason: 'path-outside-content-roots',
    })
    expect(resolve('./missing.md')).toEqual({ kind: 'invalid', href: './missing.md', reason: 'target-not-in-file-tree' })
    expect(resolve('./guide.md?revision=1')).toEqual({
      kind: 'invalid',
      href: './guide.md?revision=1',
      reason: 'query-not-supported',
    })
    expect(resolve('.\\guide.md')).toEqual({ kind: 'invalid', href: '.\\guide.md', reason: 'backslash-path' })
    expect(resolve('javascript:alert(1)')).toEqual({ kind: 'invalid', href: 'javascript:alert(1)', reason: 'unsupported-scheme' })
  })

  it('does not resolve an ambiguous root path by file name', () => {
    expect(resolve('/guide.md')).toEqual({ kind: 'invalid', href: '/guide.md', reason: 'path-outside-content-roots' })
  })

  it('reuses a precomputed document-path index without iterating the full path collection', () => {
    const unusedDocumentPaths = {
      *[Symbol.iterator](): Iterator<string> {
        throw new Error('document paths should not be rebuilt per link')
      },
    }

    expect(resolveDocumentLink({
      currentDocumentPath: 'docs/current.md',
      href: './guide.md',
      documentPaths: unusedDocumentPaths,
      knownDocumentPaths: new Set(['docs/current.md', 'docs/guide.md']),
      contentRoots: ['docs'],
    })).toEqual({ kind: 'internal', documentPath: 'docs/guide.md', headingId: null })
  })
})
