import path from 'node:path'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import {
  canonicalizeTreePaths,
  createProjectFingerprint,
  createProjectTreeCache,
  createSnapshotRevision,
} from '../../server/project-tree-cache.mjs'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createRuntimeHome() {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'md-reader-tree-cache-'))
  tempDirs.push(runtimeHome)
  return runtimeHome
}

const project = {
  id: 'notes',
  rootPath: 'C:/projects/notes',
  contentRoots: ['docs', '.'],
}

describe('project tree cache', () => {
  it('canonicalizes paths and derives stable project snapshot identities', () => {
    const paths = canonicalizeTreePaths(['docs\\guide.md', './README.md', 'docs/guide.md', 'skip.txt'])
    const fingerprint = createProjectFingerprint(project)

    expect(paths).toEqual(['README.md', 'docs/guide.md'])
    expect(fingerprint).toBe(createProjectFingerprint({ ...project, contentRoots: ['.', 'docs'] }))
    expect(createSnapshotRevision({ projectFingerprint: fingerprint, paths })).toBe(
      createSnapshotRevision({ projectFingerprint: fingerprint, paths: [...paths] }),
    )
  })

  it('single-flights a cold index and persists a complete snapshot', async () => {
    const runtimeHome = await createRuntimeHome()
    let resolveScan!: (paths: string[]) => void
    let calls = 0
    const cache = createProjectTreeCache({
      runtimeHome,
      scan: async () => {
        calls += 1
        return new Promise<string[]>((resolve) => { resolveScan = resolve })
      },
    })

    const first = await cache.get(project)
    const second = await cache.get(project)
    expect(first.status).toBe('indexing')
    expect(second).toMatchObject({ status: 'indexing', refreshId: first.refreshId })
    expect(calls).toBe(1)

    resolveScan(['docs/guide.mdx', 'README.md'])
    const waited = await cache.get(project, { mode: 'wait', refreshId: first.refreshId })
    expect(waited).toMatchObject({ status: 'ready', tree: ['README.md', 'docs/guide.mdx'] })

    const raw = JSON.parse(await readFile(cache.getSnapshotPath(project), 'utf8'))
    expect(raw).toMatchObject({ complete: true, paths: ['README.md', 'docs/guide.mdx'] })
  })

  it('retains a terminal refresh result for multiple waiters and rejects expired ids', async () => {
    const runtimeHome = await createRuntimeHome()
    let clock = 1_000
    const cache = createProjectTreeCache({
      runtimeHome,
      now: () => clock,
      refreshResultTtlMs: 100,
      scan: async () => ['guide.md'],
    })

    const initial = await cache.get(project)
    expect((await cache.get(project, { mode: 'wait', refreshId: initial.refreshId })).status).toBe('ready')
    expect((await cache.get(project, { mode: 'wait', refreshId: initial.refreshId })).status).toBe('ready')

    clock += 101
    expect(await cache.get(project, { mode: 'wait', refreshId: initial.refreshId })).toEqual({ status: 'expired' })
  })

  it('creates a new generation for force even when a cached tree is fresh', async () => {
    const runtimeHome = await createRuntimeHome()
    const scans = [['first.md'], ['second.md']]
    const cache = createProjectTreeCache({ runtimeHome, scan: async () => scans.shift() ?? [] })

    const initial = await cache.get(project)
    await cache.get(project, { mode: 'wait', refreshId: initial.refreshId })
    const forced = await cache.get(project, { mode: 'force' })

    expect(forced).toMatchObject({ status: 'refreshing', requestedGeneration: 2 })
    expect(await cache.get(project, { mode: 'wait', refreshId: forced.refreshId })).toMatchObject({
      status: 'ready',
      tree: ['second.md'],
    })
  })

  it('makes force wait for a generation that starts after an in-flight scan', async () => {
    const runtimeHome = await createRuntimeHome()
    const resolvers: Array<(paths: string[]) => void> = []
    const cache = createProjectTreeCache({
      runtimeHome,
      scan: async () => new Promise<string[]>((resolve) => resolvers.push(resolve)),
    })

    const indexing = await cache.get(project)
    const forced = await cache.get(project, { mode: 'force' })
    expect(forced).toMatchObject({ status: 'refreshing', refreshId: indexing.refreshId, requestedGeneration: 2 })

    resolvers.shift()?.(['too-early.md'])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(resolvers).toHaveLength(1)
    resolvers.shift()?.(['fresh.md'])
    expect((await cache.get(project, { mode: 'wait', refreshId: forced.refreshId })).tree).toEqual(['fresh.md'])
  })

  it('limits scanning across projects to one active scan and lets cold indexes run first', async () => {
    const runtimeHome = await createRuntimeHome()
    const started: string[] = []
    const resolvers = new Map<string, (paths: string[]) => void>()
    const cache = createProjectTreeCache({
      runtimeHome,
      scan: async (rootPath: string) => new Promise<string[]>((resolve) => {
        started.push(rootPath)
        resolvers.set(rootPath, resolve)
      }),
    })
    const otherProject = { ...project, rootPath: 'C:/projects/other' }

    const first = await cache.get(project)
    const second = await cache.get(otherProject)
    expect(started).toEqual([project.rootPath])

    resolvers.get(project.rootPath)?.(['one.md'])
    await cache.get(project, { mode: 'wait', refreshId: first.refreshId })
    expect(started).toEqual([project.rootPath, otherProject.rootPath])

    resolvers.get(otherProject.rootPath)?.(['two.md'])
    expect((await cache.get(otherProject, { mode: 'wait', refreshId: second.refreshId })).status).toBe('ready')
  })

  it('runs a queued cold index before an already queued background refresh', async () => {
    const runtimeHome = await createRuntimeHome()
    const backgroundProject = { ...project, rootPath: 'C:/projects/background' }
    const seeded = createProjectTreeCache({ runtimeHome, scan: async () => ['saved.md'] })
    const seed = await seeded.get(backgroundProject)
    await seeded.get(backgroundProject, { mode: 'wait', refreshId: seed.refreshId })

    const started: string[] = []
    const resolvers = new Map<string, (paths: string[]) => void>()
    const cache = createProjectTreeCache({
      runtimeHome,
      freshAfterMs: 0,
      scan: async (rootPath: string) => new Promise<string[]>((resolve) => {
        started.push(rootPath)
        resolvers.set(rootPath, resolve)
      }),
    })
    const activeProject = { ...project, rootPath: 'C:/projects/active' }
    const foregroundProject = { ...project, rootPath: 'C:/projects/foreground' }

    const active = await cache.get(activeProject)
    const background = await cache.get(backgroundProject)
    const foreground = await cache.get(foregroundProject)
    expect(started).toEqual([activeProject.rootPath])

    resolvers.get(activeProject.rootPath)?.(['active.md'])
    await cache.get(activeProject, { mode: 'wait', refreshId: active.refreshId })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(started).toEqual([activeProject.rootPath, foregroundProject.rootPath])

    resolvers.get(foregroundProject.rootPath)?.(['foreground.md'])
    await cache.get(foregroundProject, { mode: 'wait', refreshId: foreground.refreshId })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(started).toEqual([activeProject.rootPath, foregroundProject.rootPath, backgroundProject.rootPath])
    resolvers.get(backgroundProject.rootPath)?.(['background.md'])
    await cache.get(backgroundProject, { mode: 'wait', refreshId: background.refreshId })
  })

  it('keeps the memory snapshot usable and retries persistence on the next request', async () => {
    const runtimeHome = await createRuntimeHome()
    let shouldFail = true
    const cache = createProjectTreeCache({
      runtimeHome,
      scan: async () => ['guide.md'],
      replaceSnapshot: async (from: string, to: string) => {
        if (shouldFail) throw new Error('replace failed')
        await rename(from, to)
      },
    })

    const first = await cache.get(project)
    expect((await cache.get(project, { mode: 'wait', refreshId: first.refreshId })).status).toBe('ready')
    shouldFail = false

    const retry = await cache.get(project)
    expect(retry).toMatchObject({ status: 'ready', refreshId: expect.any(String) })
    await cache.get(project, { mode: 'wait', refreshId: retry.refreshId })
    expect(JSON.parse(await readFile(cache.getSnapshotPath(project), 'utf8')).paths).toEqual(['guide.md'])
  })

  it('keeps the previous complete disk snapshot when a newer replacement fails', async () => {
    const runtimeHome = await createRuntimeHome()
    const initial = createProjectTreeCache({ runtimeHome, scan: async () => ['old.md'] })
    const initialIndex = await initial.get(project)
    await initial.get(project, { mode: 'wait', refreshId: initialIndex.refreshId })

    const failing = createProjectTreeCache({
      runtimeHome,
      freshAfterMs: 0,
      scan: async () => ['new.md'],
      replaceSnapshot: async () => { throw new Error('Windows replacement failed') },
    })
    const refresh = await failing.get(project)
    await failing.get(project, { mode: 'wait', refreshId: refresh.refreshId })

    const restarted = createProjectTreeCache({ runtimeHome, scan: async () => { throw new Error('should use old disk snapshot') } })
    expect(await restarted.get(project)).toMatchObject({ status: 'ready', tree: ['old.md'] })
  })

  it('shares persisted hydration across concurrent readers without starting a scan', async () => {
    const runtimeHome = await createRuntimeHome()
    const initial = createProjectTreeCache({ runtimeHome, scan: async () => ['saved.md'] })
    const index = await initial.get(project)
    await initial.get(project, { mode: 'wait', refreshId: index.refreshId })
    let scans = 0
    const restarted = createProjectTreeCache({
      runtimeHome,
      scan: async () => { scans += 1; return ['unexpected.md'] },
    })

    const [first, second] = await Promise.all([restarted.get(project), restarted.get(project)])
    expect(first).toMatchObject({ status: 'ready', tree: ['saved.md'] })
    expect(second).toMatchObject({ status: 'ready', tree: ['saved.md'] })
    expect(scans).toBe(0)
  })

  it('evicts the oldest terminal refresh records while preserving a running chain', async () => {
    const runtimeHome = await createRuntimeHome()
    const cache = createProjectTreeCache({
      runtimeHome,
      maxTerminalRecords: 2,
      scan: async () => ['guide.md'],
    })
    const records: string[] = []
    for (let index = 0; index < 3; index += 1) {
      const response = await cache.get(project, { mode: index === 0 ? 'prefer-cache' : 'force' })
      records.push(response.refreshId!)
      await cache.get(project, { mode: 'wait', refreshId: response.refreshId })
    }

    expect(await cache.get(project, { mode: 'wait', refreshId: records[0] })).toEqual({ status: 'expired' })
    expect((await cache.get(project, { mode: 'wait', refreshId: records[2] })).status).toBe('ready')
  })

  it('fails closed when a persisted path escapes the project root', async () => {
    const runtimeHome = await createRuntimeHome()
    const cache = createProjectTreeCache({ runtimeHome, scan: async () => ['safe.md'] })
    const fingerprint = createProjectFingerprint(project)
    const unsafePaths = ['../escape.md']
    await mkdir(path.dirname(cache.getSnapshotPath(project)), { recursive: true })
    await writeFile(cache.getSnapshotPath(project), JSON.stringify({
      version: 1,
      projectFingerprint: fingerprint,
      complete: true,
      paths: unsafePaths,
      snapshotRevision: createSnapshotRevision({ projectFingerprint: fingerprint, paths: unsafePaths }),
    }))

    const result = await cache.get(project)
    expect(result.status).toBe('indexing')
    expect((await cache.get(project, { mode: 'wait', refreshId: result.refreshId })).tree).toEqual(['safe.md'])
  })

  it('invalidates persisted data when a mutation occurs before an old snapshot can be renamed', async () => {
    const runtimeHome = await createRuntimeHome()
    let cache: ReturnType<typeof createProjectTreeCache>
    cache = createProjectTreeCache({
      runtimeHome,
      scan: async () => ['old.md'],
      beforePersistRename: async () => {
        await cache.markMutation(project)
      },
    })

    const indexing = await cache.get(project)
    const ready = await cache.get(project, { mode: 'wait', refreshId: indexing.refreshId })
    expect(ready.status).toBe('ready')

    const reloaded = createProjectTreeCache({ runtimeHome, scan: async () => ['new.md'] })
    const reindexing = await reloaded.get(project)
    expect(reindexing.status).toBe('indexing')
    expect((await reloaded.get(project, { mode: 'wait', refreshId: reindexing.refreshId })).status).toBe('ready')
  })
})
