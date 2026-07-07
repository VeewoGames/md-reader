import path from 'node:path'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { startBridgeServer, stopBridgeServer } from '../../server/bridge-server.mjs'
import { registerProject } from '../../server/project-registry.mjs'

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
    await expect(readFile(path.join(projectRoot, 'docs', 'guides', 'intro.md'), 'utf8')).resolves.toBe(
      '# Intro',
    )
  })
})
