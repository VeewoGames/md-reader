import type { KeyValueStore } from '../shared/key-value-store'
import { STORAGE_KEYS } from '../shared/storage-keys'

export type PageWidthMode = 'narrow' | 'wide'
export type ThemeMode = 'light' | 'dark' | 'system'

export interface WorkspaceProfile {
  id: string
  appearance: {
    theme: ThemeMode
    fontSize: number
    pageWidth: PageWidthMode
  }
  layout: {
    sidebarWidth: number
    outlineWidth: number
    sidebarCollapsed: boolean
    outlineCollapsed: boolean
  }
  navigation: {
    expandedFileNodes: string[]
    expandedHeadingNodes: Record<string, string[]>
  }
}

export function createDefaultProfile(profileId = 'default'): WorkspaceProfile {
  return {
    id: profileId,
    appearance: {
      theme: 'system',
      fontSize: 16,
      pageWidth: 'narrow',
    },
    layout: {
      sidebarWidth: 280,
      outlineWidth: 320,
      sidebarCollapsed: false,
      outlineCollapsed: false,
    },
    navigation: {
      expandedFileNodes: [],
      expandedHeadingNodes: {},
    },
  }
}

export function createProfileStore(storage: KeyValueStore) {
  return {
    async getProfile(projectId: string, profileId: string): Promise<WorkspaceProfile> {
      return (
        (await storage.getItem<WorkspaceProfile>(STORAGE_KEYS.profile(projectId, profileId))) ??
        createDefaultProfile(profileId)
      )
    },
    async saveProfile(projectId: string, profile: WorkspaceProfile): Promise<void> {
      await storage.setItem(STORAGE_KEYS.profile(projectId, profile.id), profile)
    },
  }
}
