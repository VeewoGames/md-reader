import path from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import {
  getProjectProfile,
  listProjectProfiles,
  saveProjectProfile,
} from '../../server/project-profiles.mjs'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('project profiles', () => {
  it('creates a repo-tracked profiles.json with default and Lans entries', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-project-profiles-'))
    tempDirs.push(projectRoot)

    const profileIds = await listProjectProfiles(projectRoot)
    const raw = await readFile(path.join(projectRoot, '.md-reader', 'profiles.json'), 'utf8')
    const payload = JSON.parse(raw) as {
      profiles: Record<string, { id: string }>
    }

    expect(profileIds).toEqual(['default', 'Lans'])
    expect(payload.profiles.default.id).toBe('default')
    expect(payload.profiles.Lans.id).toBe('Lans')
  })

  it('saves and reloads a named repo profile', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-project-profiles-'))
    tempDirs.push(projectRoot)

    await saveProjectProfile(projectRoot, {
      id: 'Lans',
      appearance: {
        theme: 'system',
        fontSize: 17,
        pageWidth: 'wide',
      },
      layout: {
        sidebarWidth: 300,
        outlineWidth: 360,
        sidebarCollapsed: false,
        outlineCollapsed: false,
      },
      navigation: {
        expandedFileNodes: ['docs'],
        expandedHeadingNodes: {},
      },
    })

    const profile = await getProjectProfile(projectRoot, 'Lans')

    expect(profile.appearance.fontSize).toBe(17)
    expect(profile.appearance.pageWidth).toBe('wide')
    expect(profile.layout.sidebarWidth).toBe(300)
    expect(profile.navigation.expandedFileNodes).toEqual(['docs'])
  })
})
