export const STORAGE_KEYS = {
  projectRegistry: 'workspace:project-registry',
  profile(projectId: string, profileId: string) {
    return `workspace:profile:${projectId}:${profileId}`
  },
  localState(projectId: string) {
    return `workspace:local-state:${projectId}`
  },
} as const
