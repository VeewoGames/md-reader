import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { startBridgeServer, stopBridgeServer } from '../../server/bridge-server.mjs'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action() })
it('serves versioned registry commands with explicit conflict, validation and empty-state contracts', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'registry-http-'))
  cleanup.push(() => rm(home, { recursive: true, force: true }))
  const root = path.join(home, 'Notes'); await mkdir(root)
  const server = await startBridgeServer({ port: 0, runtimeHome: home, webMode: 'none' })
  cleanup.push(() => stopBridgeServer(server, { runtimeHome: home }))
  const url = `http://127.0.0.1:${server.address().port}/api/profiles/test/projects`
  const post = (command: string, body: object) => fetch(`${url}/${command}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  expect(await (await fetch(url)).json()).toMatchObject({ initialized: false, revision: 0 })
  expect((await post('register', { rootPath: root })).status).toBe(400)
  const registered = await (await post('register', { rootPath: root, expectedRevision: 0 })).json()
  expect(registered.snapshot.revision).toBe(1)
  const conflict = await post('active', { projectId: registered.project.id, expectedRevision: 0 })
  expect(conflict.status).toBe(409)
  expect(await conflict.json()).toMatchObject({ code: 'REGISTRY_CONFLICT' })
  expect((await post('reorder', { orderedIds: [], expectedRevision: 1 })).status).toBe(400)
  expect(await (await post('unregister', { projectId: registered.project.id, replacementProjectId: null, expectedRevision: 1 })).json()).toMatchObject({ initialized: true, projects: [], activeProjectId: null, revision: 2 })
  expect(await (await post('reconcile', { expectedRevision: 2 })).json()).toMatchObject({ revision: 3 })
})
