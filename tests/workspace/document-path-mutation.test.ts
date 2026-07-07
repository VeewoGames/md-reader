import { describe, expect, it } from 'vitest'

import type { WorkspaceLocalState } from '../../src/workspace/local-state'
import type { WorkspaceProfile } from '../../src/workspace/profile-store'
import type { WorkspaceSession } from '../../src/workspace/workspace-session'
import {
  removePathCollections,
  rewritePathCollections,
  rewriteSessionDocumentPath,
} from '../../src/workspace/document-path-mutation'

describe('document path mutation', () => {
  it('rewrites tab ids, document paths, and active tab selection after a path move', () => {
    const session: WorkspaceSession = {
      tabs: [
        {
          id: 'docs/guide.md',
          documentPath: 'docs/guide.md',
          persistedContent: '# Guide',
          draftContent: '# Guide',
          mtimeMs: 1,
          saveState: 'clean',
          saveErrorMessage: null,
          lastKnownScrollTop: 12,
        },
      ],
      activeTabId: 'docs/guide.md',
      mode: 'regular',
      regularViewState: 'locked',
    }

    const nextSession = rewriteSessionDocumentPath(session, 'docs/guide.md', 'docs/archive/guide.md')

    expect(nextSession.tabs[0]?.id).toBe('docs/archive/guide.md')
    expect(nextSession.tabs[0]?.documentPath).toBe('docs/archive/guide.md')
    expect(nextSession.activeTabId).toBe('docs/archive/guide.md')
  })

  it('rewrites local and profile path collections without touching unrelated entries', () => {
    const localState: WorkspaceLocalState = {
      openDocumentPaths: ['docs/guide.md', 'docs/other.md'],
      activeDocumentPath: 'docs/guide.md',
      activeMode: 'regular',
      regularViewState: 'locked',
      tabStateByDocument: {
        'docs/guide.md': { lastKnownScrollTop: 128 },
        'docs/other.md': { lastKnownScrollTop: 64 },
      },
      readingProgressByDocument: {
        'docs/guide.md': 0.5,
        'docs/other.md': 0.25,
      },
    }
    const profile: WorkspaceProfile = {
      id: 'default',
      appearance: {
        theme: 'system',
        fontSize: 16,
        pageWidth: 'wide',
      },
      layout: {
        sidebarWidth: 280,
        outlineWidth: 320,
        sidebarCollapsed: false,
        outlineCollapsed: false,
      },
      navigation: {
        expandedFileNodes: ['docs'],
        expandedHeadingNodes: {},
        hiddenPaths: ['docs/guide.md'],
        favoritePaths: ['docs/guide.md', 'docs/other.md'],
      },
    }

    const next = rewritePathCollections({
      localState,
      profile,
      sourcePath: 'docs/guide.md',
      targetPath: 'docs/archive/guide.md',
    })

    expect(next.localState.openDocumentPaths).toEqual(['docs/archive/guide.md', 'docs/other.md'])
    expect(next.localState.activeDocumentPath).toBe('docs/archive/guide.md')
    expect(next.localState.tabStateByDocument).toEqual({
      'docs/archive/guide.md': { lastKnownScrollTop: 128 },
      'docs/other.md': { lastKnownScrollTop: 64 },
    })
    expect(next.localState.readingProgressByDocument).toEqual({
      'docs/archive/guide.md': 0.5,
      'docs/other.md': 0.25,
    })
    expect(next.profile.navigation.hiddenPaths).toEqual(['docs/archive/guide.md'])
    expect(next.profile.navigation.favoritePaths).toEqual(['docs/archive/guide.md', 'docs/other.md'])
  })

  it('removes deleted document paths from local and profile collections', () => {
    const localState: WorkspaceLocalState = {
      openDocumentPaths: ['docs/guide.md', 'docs/other.md'],
      activeDocumentPath: 'docs/guide.md',
      activeMode: 'regular',
      regularViewState: 'locked',
      tabStateByDocument: {
        'docs/guide.md': { lastKnownScrollTop: 128 },
        'docs/other.md': { lastKnownScrollTop: 64 },
      },
      readingProgressByDocument: {
        'docs/guide.md': 0.5,
        'docs/other.md': 0.25,
      },
    }
    const profile: WorkspaceProfile = {
      id: 'default',
      appearance: {
        theme: 'system',
        fontSize: 16,
        pageWidth: 'wide',
      },
      layout: {
        sidebarWidth: 280,
        outlineWidth: 320,
        sidebarCollapsed: false,
        outlineCollapsed: false,
      },
      navigation: {
        expandedFileNodes: ['docs'],
        expandedHeadingNodes: {},
        hiddenPaths: ['docs/guide.md'],
        favoritePaths: ['docs/guide.md', 'docs/other.md'],
      },
    }

    const next = removePathCollections({
      localState,
      profile,
      targetPath: 'docs/guide.md',
    })

    expect(next.localState.openDocumentPaths).toEqual(['docs/other.md'])
    expect(next.localState.activeDocumentPath).toBeNull()
    expect(next.localState.tabStateByDocument).toEqual({
      'docs/other.md': { lastKnownScrollTop: 64 },
    })
    expect(next.localState.readingProgressByDocument).toEqual({
      'docs/other.md': 0.25,
    })
    expect(next.profile.navigation.hiddenPaths).toEqual([])
    expect(next.profile.navigation.favoritePaths).toEqual(['docs/other.md'])
  })

  it('falls back to empty collections when profile navigation arrays are missing', () => {
    const localState: WorkspaceLocalState = {
      openDocumentPaths: ['docs/guide.md'],
      activeDocumentPath: 'docs/guide.md',
      activeMode: 'regular',
      regularViewState: 'locked',
      tabStateByDocument: {
        'docs/guide.md': { lastKnownScrollTop: 128 },
      },
      readingProgressByDocument: {
        'docs/guide.md': 0.5,
      },
    }
    const profile = {
      id: 'default',
      appearance: {
        theme: 'system',
        fontSize: 16,
        pageWidth: 'wide',
      },
      layout: {
        sidebarWidth: 280,
        outlineWidth: 320,
        sidebarCollapsed: false,
        outlineCollapsed: false,
      },
      navigation: {
        expandedFileNodes: ['docs'],
        expandedHeadingNodes: {},
      },
    } as WorkspaceProfile

    const next = rewritePathCollections({
      localState,
      profile,
      sourcePath: 'docs/guide.md',
      targetPath: 'docs/archive/guide.md',
    })

    expect(next.profile.navigation.hiddenPaths).toEqual([])
    expect(next.profile.navigation.favoritePaths).toEqual([])
    expect(next.localState.openDocumentPaths).toEqual(['docs/archive/guide.md'])
  })
})
