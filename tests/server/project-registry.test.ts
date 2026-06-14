import path from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createProjectId,
  loadProjectRegistry,
  registerProject,
  setActiveProjectId,
} from '../../server/project-registry.mjs'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('project registry', () => {
  it('creates a stable project id from the normalized root path', () => {
    const first = createProjectId('Nocturnel', 'C:\\Code\\Nocturnel\\')
    const second = createProjectId('Nocturnel', 'c:/code/nocturnel')

    expect(first).toBe(second)
    expect(first.startsWith('nocturnel-')).toBe(true)
  })

  it('registers a project under the selected profile and restores it from disk', async () => {
    const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'md-reader-registry-'))
    tempDirs.push(runtimeHome)

    const project = await registerProject({
      runtimeHome,
      profileId: 'default',
      rootPath: 'C:\\Code\\Nocturnel',
    })

    const registry = await loadProjectRegistry(runtimeHome)

    expect(project.name).toBe('Nocturnel')
    expect(registry.profiles.default.projects).toEqual([project])
  })

  it('updates active project id for the selected profile', async () => {
    const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'md-reader-registry-'))
    tempDirs.push(runtimeHome)

    const project = await registerProject({
      runtimeHome,
      profileId: 'default',
      rootPath: 'C:\\Code\\Nocturnel',
    })

    await setActiveProjectId(runtimeHome, 'default', project.id)

    const registry = JSON.parse(await readFile(path.join(runtimeHome, 'projects.json'), 'utf8')) as {
      profiles: Record<string, { activeProjectId: string | null }>
    }

    expect(registry.profiles.default.activeProjectId).toBe(project.id)
  })
})
