import type { KeyValueStore } from '../shared/key-value-store'
import { STORAGE_KEYS } from '../shared/storage-keys'

export type PageWidthMode = 'narrow' | 'wide' | 'full'
export type ThemeMode = 'light' | 'dark' | 'system'
export type DocumentLineHeight = number

export function normalizeMaxUnpinnedTabs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(30, Math.max(1, Math.round(value)))
    : 10
}

export interface WorkspaceProfile {
  id: string
  appearance: {
    theme: ThemeMode
    fontSize: number
    pageWidth: PageWidthMode
    lineHeight?: DocumentLineHeight
    hideFileTitleDate?: boolean
    maxUnpinnedTabs?: number
  }
  layout: {
    sidebarWidth: number
    outlineWidth: number
    sidebarCollapsed: boolean
    outlineCollapsed: boolean
  }
  navigation: {
    expandedFileNodes: string[]
    expandedFileNodesInitialized?: boolean
    expandedHeadingNodes: Record<string, string[]>
    hiddenPaths: string[]
    favoritePaths: string[]
    manualNodeOrderByParent: Record<string, string[]>
  }
}

export function createDefaultProfile(profileId = 'default'): WorkspaceProfile {
  return {
    id: profileId,
    appearance: {
      theme: 'system',
      fontSize: 16,
      pageWidth: 'narrow',
      lineHeight: 1.6,
      hideFileTitleDate: false,
      maxUnpinnedTabs: 10,
    },
    layout: {
      sidebarWidth: 280,
      outlineWidth: 320,
      sidebarCollapsed: false,
      outlineCollapsed: false,
    },
    navigation: {
      expandedFileNodes: [],
      expandedFileNodesInitialized: false,
      expandedHeadingNodes: {},
      hiddenPaths: [],
      favoritePaths: [],
      manualNodeOrderByParent: {},
    },
  }
}

export function createProfileStore(storage: KeyValueStore) {
  return {
    async getProfile(projectId: string, profileId: string): Promise<WorkspaceProfile> {
      const profile = (
        (await storage.getItem<WorkspaceProfile>(STORAGE_KEYS.profile(projectId, profileId))) ??
        createDefaultProfile(profileId)
      )
      return {
        ...profile,
        appearance: {
          ...profile.appearance,
          maxUnpinnedTabs: normalizeMaxUnpinnedTabs(profile.appearance?.maxUnpinnedTabs),
        },
      }
    },
    async saveProfile(projectId: string, profile: WorkspaceProfile): Promise<void> {
      await storage.setItem(STORAGE_KEYS.profile(projectId, profile.id), profile)
    },
  }
}
