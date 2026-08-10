import path from 'node:path'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { startBridgeServer, stopBridgeServer } from '../../server/bridge-server.mjs'
import { registerProject } from '../../server/project-registry.mjs'
import { getServiceLogPath } from '../../server/service-log.mjs'

const tempDirs: string[] = []
const activeServers: Array<{ close: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(
    activeServers.splice(0).map(async (entry) => {
      await entry.close()
    }),
  )
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('bridge server node operations', () => {
  it('records lifecycle events without relying on detached process output', async () => {
    const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'md-reader-runtime-'))
    tempDirs.push(runtimeHome)
    const server = await startBridgeServer({ port: 0, runtimeHome, webMode: 'none' })

    await stopBridgeServer(server, { runtimeHome })

    const events = (await readFile(getServiceLogPath(runtimeHome), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { event: string })
      .map((entry) => entry.event)
    expect(events).toEqual(['started', 'stopped'])
  })

  it('keeps serving health when a registered project root is unavailable', async () => {
    const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'md-reader-runtime-'))
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-project-'))
    tempDirs.push(runtimeHome)
    const project = await registerProject({ runtimeHome, profileId: 'default', rootPath: projectRoot })
    await rm(projectRoot, { recursive: true, force: true })
    const server = await startBridgeServer({ port: 0, runtimeHome, webMode: 'none' })
    activeServers.push({ close: () => stopBridgeServer(server, { runtimeHome }) })
    const { port } = server.address() as { port: number }
    const base = `http://127.0.0.1:${port}/api/projects/${project.id}/tree?profileId=default`

    const indexing = await fetch(`${base}&mode=prefer-cache`)
    const indexingPayload = await indexing.json() as { refreshId: string }
    const failed = await fetch(`${base}&mode=wait&refreshId=${encodeURIComponent(indexingPayload.refreshId)}`)

    expect(indexing.status).toBe(202)
    expect(failed.status).toBe(503)
    await expect(fetch(`http://127.0.0.1:${port}/api/health`)).resolves.toMatchObject({ ok: true })
  })

  it('serves tree indexing, wait, and force through the bridge contract', async () => {
    const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'md-reader-runtime-'))
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-project-'))
    tempDirs.push(runtimeHome, projectRoot)
    await mkdir(path.join(projectRoot, 'docs'), { recursive: true })
    await (await import('node:fs/promises')).writeFile(path.join(projectRoot, 'docs', 'guide.md'), '# Guide')
    const project = await registerProject({ runtimeHome, profileId: 'default', rootPath: projectRoot })
    const server = await startBridgeServer({ port: 0, runtimeHome, webMode: 'none' })
    activeServers.push({ close: () => stopBridgeServer(server, { runtimeHome }) })
    const { port } = server.address() as { port: number }
    const base = `http://127.0.0.1:${port}/api/projects/${project.id}/tree?profileId=default`

    const indexing = await fetch(`${base}&mode=prefer-cache`)
    expect(indexing.status).toBe(202)
    const indexingPayload = await indexing.json() as { refreshId: string; status: string }
    expect(indexingPayload.status).toBe('indexing')

    const ready = await fetch(`${base}&mode=wait&refreshId=${encodeURIComponent(indexingPayload.refreshId)}`)
    expect(ready.status).toBe(200)
    await expect(ready.json()).resolves.toMatchObject({
      status: 'ready',
      snapshot: {
        entries: [expect.objectContaining({ path: 'docs/guide.md' })],
      },
    })

    const force = await fetch(`${base}&mode=force`)
    expect(force.status).toBe(202)
    const forcePayload = await force.json() as { refreshId: string; status: string }
    expect(forcePayload.status).toBe('refreshing')
    const forceReady = await fetch(`${base}&mode=wait&refreshId=${encodeURIComponent(forcePayload.refreshId)}`)
    expect(forceReady.status).toBe(200)
  })

  it('creates a document through the bridge node endpoint', async () => {
    const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'md-reader-runtime-'))
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-project-'))
    tempDirs.push(runtimeHome, projectRoot)

    await mkdir(path.join(projectRoot, 'docs'), { recursive: true })
    const project = await registerProject({ runtimeHome, profileId: 'default', rootPath: projectRoot })
    const server = await startBridgeServer({ port: 0, runtimeHome, webMode: 'none' })
    activeServers.push({
      close: () => stopBridgeServer(server, { runtimeHome }),
    })

    const { port } = server.address() as { port: number }
    const response = await fetch(
      `http://127.0.0.1:${port}/api/projects/${project.id}/nodes/document/create?profileId=default`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          path: 'docs/guides/intro.md',
          content: '# Intro',
        }),
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ path: 'docs/guides/intro.md', treeStatus: 'dirty', tree: null })
    await expect(readFile(path.join(projectRoot, 'docs', 'guides', 'intro.md'), 'utf8')).resolves.toBe(
      '# Intro',
    )
  })
})
