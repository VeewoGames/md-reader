export const STORAGE_KEYS = {
  projectRegistry(profileId: string) {
    return `workspace:project-registry:${profileId}`
  },
  profile(projectId: string, profileId: string) {
    return `workspace:profile:${projectId}:${profileId}`
  },
  localState(projectId: string) {
    return `workspace:local-state:${projectId}`
  },
  directoryHandle(rootHandleKey: string) {
    return `workspace:directory-handle:${rootHandleKey}`
  },
} as const
