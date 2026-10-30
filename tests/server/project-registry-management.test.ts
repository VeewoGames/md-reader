import { afterEach, describe, expect, it } from 'vitest'
import * as disk from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { getProjectsSnapshot, getProjectById, registerProject, reorderProjects, unregisterProject, reconcileProjects, setActiveProjectId } from '../../server/project-registry.mjs'
import { registryTransaction } from '../../server/registry-transaction.mjs'

const temporary: string[] = []
afterEach(async () => { await Promise.all(temporary.splice(0).map(dir => disk.rm(dir, { recursive: true, force: true }))) })
async function fixture() {
  const home = await disk.mkdtemp(path.join(os.tmpdir(), 'registry-management-'))
  temporary.push(home)
  for (const name of ['A', 'B', 'C']) await disk.mkdir(path.join(home, name))
  return home
}
async function add(home: string, name: string, profileId = 'test') {
  return registerProject({ runtimeHome: home, profileId, rootPath: path.join(home, name), expectedRevision: (await getProjectsSnapshot(home, profileId)).revision })
}

describe('registry management contracts', () => {
  it('persists order, preserves active, rejects incomplete orders and stale revisions', async () => {
    const home = await fixture()
    const a = await add(home, 'A'), b = await add(home, 'B')
    const options = { runtimeHome: home, profileId: 'test', expectedRevision: b.snapshot.revision }
    await expect(reorderProjects({ ...options, orderedIds: [a.project.id] })).rejects.toMatchObject({ code: 'REGISTRY_INVALID' })
    const next = await reorderProjects({ ...options, orderedIds: [b.project.id, a.project.id] })
    expect(next.activeProjectId).toBe(a.project.id)
    expect((await getProjectsSnapshot(home, 'test')).projects.map(p => p.id)).toEqual([b.project.id, a.project.id])
    await expect(setActiveProjectId(home, 'test', b.project.id, options.expectedRevision)).rejects.toMatchObject({ code: 'REGISTRY_CONFLICT' })
  })
  it('removes current atomically, then clears last without deleting files or initialization', async () => {
    const home = await fixture()
    await disk.writeFile(path.join(home, 'A', 'note.md'), '# retain')
    const a = await add(home, 'A'), b = await add(home, 'B')
    await expect(unregisterProject({ runtimeHome: home, profileId: 'test', projectId: a.project.id, replacementProjectId: a.project.id, expectedRevision: b.snapshot.revision })).rejects.toMatchObject({ code: 'REGISTRY_CONFLICT' })
    const next = await unregisterProject({ runtimeHome: home, profileId: 'test', projectId: a.project.id, replacementProjectId: b.project.id, expectedRevision: b.snapshot.revision })
    expect(next.activeProjectId).toBe(b.project.id)
    const empty = await unregisterProject({ runtimeHome: home, profileId: 'test', projectId: b.project.id, replacementProjectId: null, expectedRevision: next.revision })
    expect(empty).toMatchObject({ initialized: true, projects: [], activeProjectId: null })
    expect(await disk.readFile(path.join(home, 'A', 'note.md'), 'utf8')).toBe('# retain')
  })
  it('fences delayed first registration without initializing the profile', async () => {
    const home = await fixture()
    const fenced = await reconcileProjects({ runtimeHome: home, profileId: 'new', expectedRevision: 0 })
    expect(fenced).toEqual({ initialized: false, revision: 1, projects: [], activeProjectId: null })
    expect(await getProjectById(home, 'new', 'missing')).toBeNull()
    await expect(registerProject({ runtimeHome: home, profileId: 'new', rootPath: path.join(home, 'A'), expectedRevision: 0 })).rejects.toMatchObject({ code: 'REGISTRY_CONFLICT' })
    expect((await reconcileProjects({ runtimeHome: home, profileId: 'new', expectedRevision: 0 })).revision).toBe(1)
    expect((await add(home, 'A', 'new')).snapshot).toMatchObject({ initialized: true, revision: 2 })
  })
  it('does not bump no-ops, rejects invalid paths, and persists active repairs before returning', async () => {
    const home = await fixture(), a = await add(home, 'A')
    expect((await add(home, 'A')).snapshot.revision).toBe(a.snapshot.revision)
    if (process.platform === 'win32') {
      expect((await registerProject({ runtimeHome: home, profileId: 'test', rootPath: path.join(home, 'A').toLowerCase(), expectedRevision: a.snapshot.revision })).snapshot.revision).toBe(a.snapshot.revision)
    }
    await expect(registerProject({ runtimeHome: home, profileId: 'test', rootPath: path.join(home, 'missing'), expectedRevision: 1 })).rejects.toMatchObject({ code: 'PROJECT_PATH_UNAVAILABLE' })
    const raw = JSON.parse(await disk.readFile(path.join(home, 'projects.json'), 'utf8'))
    raw.profiles.test.activeProjectId = 'gone'
    await disk.writeFile(path.join(home, 'projects.json'), JSON.stringify(raw))
    const repaired = await getProjectsSnapshot(home, 'test')
    expect(repaired).toMatchObject({ activeProjectId: a.project.id, revision: 2 })
    expect(JSON.parse(await disk.readFile(path.join(home, 'projects.json'), 'utf8')).profiles.test.revision).toBe(2)
  })
  it('does not reinterpret corrupt business records as uninitialized', async () => {
    const home = await fixture()
    await disk.writeFile(path.join(home, 'projects.json'), JSON.stringify({ version: 1, profiles: { test: { projects: null } } }))
    await expect(getProjectsSnapshot(home, 'test')).rejects.toMatchObject({ code: 'REGISTRY_CORRUPT' })
  })
  it('cleans metadata failures, preserves primary errors and leaves its queue usable', async () => {
    const home = await fixture()
    const broken = { ...disk, open: async (...args: Parameters<typeof disk.open>) => {
      const handle = await disk.open(...args)
      return { writeFile: async () => { throw new Error('metadata fault') }, close: () => handle.close() }
    } }
    await expect(registryTransaction(home, () => ({ changed: false, result: {} }), { io: broken })).rejects.toThrow('metadata fault')
    await expect(disk.stat(path.join(home, 'projects.json.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await add(home, 'A')).snapshot.revision).toBe(1)
  })
  it('reports committed data and cleanup warning when unlink fails; never steals stale locks', async () => {
    const home = await fixture()
    const result = await registryTransaction(home, registry => { registry.profiles.test = { revision: 1 }; return { changed: true, result: { revision: 1 } } }, { io: { ...disk, unlink: async () => { throw new Error('release fault') } } })
    expect(result.lockCleanupWarning).toContain('release fault')
    expect(JSON.parse(await disk.readFile(path.join(home, 'projects.json'), 'utf8')).profiles.test.revision).toBe(1)
    await expect(registryTransaction(home, () => ({ changed: false, result: {} }), { timeoutMs: 0 })).rejects.toMatchObject({ code: 'REGISTRY_BUSY', status: 503 })
    await disk.unlink(path.join(home, 'projects.json.lock')) // all fixture writers stopped
    expect((await add(home, 'A')).snapshot.revision).toBe(2)
  })
  it('preserves original JSON on failed replace and refuses realpath fallback', async () => {
    const home = await fixture(), a = await add(home, 'A')
    const original = await disk.readFile(path.join(home, 'projects.json'), 'utf8')
    await expect(registryTransaction(home, registry => { registry.profiles.test.revision++; return { changed: true, result: {} } }, { io: { ...disk, rename: async () => { throw new Error('rename fault') } } })).rejects.toThrow('rename fault')
    expect(await disk.readFile(path.join(home, 'projects.json'), 'utf8')).toBe(original)
    expect((await getProjectsSnapshot(home, 'test')).revision).toBe(a.snapshot.revision)
    await expect(registryTransaction(home, () => ({ changed: false, result: {} }), { io: { ...disk, realpath: async () => { throw new Error('realpath fault') } } })).rejects.toThrow('realpath fault')
  })
  it('keeps business failure primary when cleanup also fails', async () => {
    const home = await fixture()
    await expect(registryTransaction(home, () => { throw new Error('primary fault') }, { io: { ...disk, unlink: async () => { throw new Error('cleanup fault') } } })).rejects.toMatchObject({ message: 'primary fault', lockCleanupWarning: expect.stringContaining('cleanup fault') })
  })
  it('never steals a lock after its process crashes, and another runtime remains usable', async () => {
    const home = await fixture(), other = await fixture()
    const moduleUrl = pathToFileURL(path.resolve('server/registry-transaction.mjs')).href
    const code = `import {registryTransaction} from ${JSON.stringify(moduleUrl)};await registryTransaction(process.env.PROBE_HOME,async()=>{process.send('held');await new Promise(()=>{})});`
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, PROBE_HOME: home }, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    try {
      await new Promise<void>((resolve, reject) => { child.once('message', () => resolve()); child.once('error', reject); child.once('exit', () => reject(new Error('lock holder exited before barrier'))) })
      child.kill()
      await new Promise(resolve => child.once('exit', resolve))
      await expect(registryTransaction(home, () => ({ changed: false, result: {} }), { timeoutMs: 0 })).rejects.toMatchObject({ code: 'REGISTRY_BUSY' })
      expect((await add(other, 'A')).snapshot.initialized).toBe(true)
      await disk.unlink(path.join(home, 'projects.json.lock'))
      expect((await add(home, 'A')).snapshot.initialized).toBe(true)
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill() }
  })
  it('serializes two real process writers and rejects one same-revision request', async () => {
    const home = await fixture()
    const moduleUrl = pathToFileURL(path.resolve('server/project-registry.mjs')).href
    const launch = (profileId: string, expectedRevision: number) => new Promise<unknown>(resolve => {
      const code = `import {registerProject} from ${JSON.stringify(moduleUrl)};process.on('message',async()=>{try{const r=await registerProject({runtimeHome:process.env.PROBE_HOME,profileId:process.env.PROBE_PROFILE,rootPath:process.env.PROBE_ROOT,expectedRevision:${expectedRevision}});process.send({revision:r.snapshot.revision});}catch(e){process.send({code:e.code});}finally{process.disconnect()}});process.send('ready');`
      const child = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, PROBE_HOME: home, PROBE_PROFILE: profileId, PROBE_ROOT: path.join(home, 'A') }, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
      child.on('message', message => { if (message === 'ready') child.send('start'); else resolve(message) })
    })
    const results = await Promise.all([launch('test', 0), launch('test', 0)])
    expect(results).toContainEqual({ revision: 1 })
    expect(results).toContainEqual({ code: 'REGISTRY_CONFLICT' })
    await Promise.all([launch('other', 0), launch('another', 0)])
    expect((await getProjectsSnapshot(home, 'other')).projects).toHaveLength(1)
    expect((await getProjectsSnapshot(home, 'another')).projects).toHaveLength(1)
  })
})
