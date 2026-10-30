import net from 'node:net'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'

import { afterEach, describe, expect, it } from 'vitest'

import { ensureServiceRunning, readServiceHealth, stopService } from '../../service-lifecycle.mjs'
import { requestServiceHost } from '../../server/service-host-protocol.mjs'

const runtimeHomes: string[] = []

afterEach(async () => {
  for (const runtimeHome of runtimeHomes.splice(0)) {
    await requestServiceHost(runtimeHome, { command: 'shutdown-host' }, { timeoutMs: 3000 }).catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 250))
    await rm(runtimeHome, { recursive: true, force: true })
  }
})

describe('ServiceHost integration', () => {
  it('owns one bridge generation, recovers a process crash, and preserves intentional stop', async () => {
    const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'md-reader-service-host-'))
    runtimeHomes.push(runtimeHome)
    const port = await getAvailablePort()

    const [first, duplicate] = await Promise.all([
      ensureServiceRunning({ runtimeHome, port }),
      ensureServiceRunning({ runtimeHome, port }),
    ])
    const firstHealth = await readServiceHealth(port)

    expect([first.alreadyRunning, duplicate.alreadyRunning].sort()).toEqual([false, true])
    expect(duplicate.hostPid).toBe(first.hostPid)
    expect(firstHealth).toMatchObject({
      ok: true,
      serviceId: 'md-reader-bridge',
      generation: first.generation,
    })

    process.kill(first.pid)
    const recovered = await waitFor(async () => {
      try {
        const health = await readServiceHealth(port, { timeoutMs: 500 })
        return health.generation > first.generation ? health : null
      } catch {
        return null
      }
    }, 12_000)
    expect(recovered).toMatchObject({ ok: true, serviceId: 'md-reader-bridge' })

    await expect(stopService(runtimeHome)).resolves.toMatchObject({ ok: true })
    await new Promise((resolve) => setTimeout(resolve, 1250))
    await expect(readServiceHealth(port, { timeoutMs: 300 })).rejects.toThrow()
    const state = JSON.parse(await readFile(path.join(runtimeHome, 'runtime', 'service-state.json'), 'utf8'))
    expect(state).toMatchObject({ intentionalStop: true, desiredState: 'stopped', status: 'stopped' })
  }, 25_000)

  it('replaces an orphan bridge when a new host takes ownership', async () => {
    const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'md-reader-service-host-orphan-'))
    runtimeHomes.push(runtimeHome)
    const port = await getAvailablePort()
    const first = await ensureServiceRunning({ runtimeHome, port })

    process.kill(first.hostPid)
    await waitFor(async () => {
      try {
        await requestServiceHost(runtimeHome, { command: 'ping' }, { timeoutMs: 100 })
        return null
      } catch {
        return true
      }
    }, 5000)

    const recovered = await ensureServiceRunning({ runtimeHome, port })
    const health = await readServiceHealth(port)
    expect(recovered.hostPid).not.toBe(first.hostPid)
    expect(recovered.pid).not.toBe(first.pid)
    expect(health.generation).toBeGreaterThan(first.generation)
  }, 20_000)

  it('reports an unknown port occupant without terminating it', async () => {
    const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'md-reader-service-host-conflict-'))
    runtimeHomes.push(runtimeHome)
    const occupant = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true }))
    })
    await new Promise<void>((resolve, reject) => {
      occupant.once('error', reject)
      occupant.listen(0, '127.0.0.1', resolve)
    })
    const address = occupant.address()
    const port = typeof address === 'object' && address ? address.port : 0
    let occupantClosed = false

    try {
      await expect(ensureServiceRunning({ runtimeHome, port })).rejects.toThrow(/not the expected md-reader bridge/)
      expect(occupant.listening).toBe(true)
      const state = JSON.parse(await readFile(path.join(runtimeHome, 'runtime', 'service-state.json'), 'utf8'))
      expect(state).toMatchObject({ status: 'port_conflict', bridgePid: null })

      await new Promise<void>((resolve, reject) => occupant.close((error) => error ? reject(error) : resolve()))
      occupantClosed = true
      await expect(ensureServiceRunning({ runtimeHome, port })).resolves.toMatchObject({
        alreadyRunning: true,
        hostPid: state.hostPid,
      })
      await expect(readServiceHealth(port)).resolves.toMatchObject({
        ok: true,
        serviceId: 'md-reader-bridge',
      })
    } finally {
      if (!occupantClosed) {
        await new Promise<void>((resolve, reject) => occupant.close((error) => error ? reject(error) : resolve()))
      }
    }
  }, 15_000)

  it('keeps a persisted stable failure stopped until an explicit start', async () => {
    const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'md-reader-service-host-failed-'))
    runtimeHomes.push(runtimeHome)
    const port = await getAvailablePort()
    await mkdir(path.join(runtimeHome, 'runtime'), { recursive: true })
    await writeFile(path.join(runtimeHome, 'runtime', 'service-state.json'), JSON.stringify({
      version: 2,
      generation: 4,
      port,
      status: 'failed',
      desiredState: 'ready',
      intentionalStop: false,
      failureCount: 4,
    }), 'utf8')

    const host = spawn(process.execPath, [
      path.resolve('server/service-host.mjs'),
      '--runtime-home', runtimeHome,
      '--port', String(port),
    ], { cwd: process.cwd(), windowsHide: true, stdio: 'ignore' })
    host.unref()
    const blocked = await waitFor(async () => {
      try {
        return await requestServiceHost(runtimeHome, { command: 'ping' }, { timeoutMs: 200 })
      } catch {
        return null
      }
    }, 5000)
    expect(blocked).toMatchObject({ status: 'failed', failureCount: 4, bridgePid: null })
    await expect(readServiceHealth(port, { timeoutMs: 200 })).rejects.toThrow()

    await expect(ensureServiceRunning({ runtimeHome, port })).resolves.toMatchObject({
      alreadyRunning: true,
      hostPid: host.pid,
    })
    await expect(readServiceHealth(port)).resolves.toMatchObject({ serviceId: 'md-reader-bridge' })
  }, 15_000)

  it('stops a recorded orphan when ServiceHost is unavailable', async () => {
    const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'md-reader-service-host-stop-orphan-'))
    runtimeHomes.push(runtimeHome)
    const port = await getAvailablePort()
    const first = await ensureServiceRunning({ runtimeHome, port })

    process.kill(first.hostPid)
    await waitFor(async () => {
      try {
        await requestServiceHost(runtimeHome, { command: 'ping' }, { timeoutMs: 100 })
        return null
      } catch {
        return true
      }
    }, 5000)

    await expect(stopService(runtimeHome)).resolves.toMatchObject({ ok: true })
    await expect(readServiceHealth(port, { timeoutMs: 300 })).rejects.toThrow()
    const state = JSON.parse(await readFile(path.join(runtimeHome, 'runtime', 'service-state.json'), 'utf8'))
    expect(state).toMatchObject({ intentionalStop: true, desiredState: 'stopped', status: 'stopped', bridgePid: null })
  }, 15_000)

  it('enforces a wall-clock deadline against a trickling health response', async () => {
    const occupant = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      const timer = setInterval(() => response.write(' '), 20)
      response.once('close', () => clearInterval(timer))
    })
    await new Promise<void>((resolve, reject) => {
      occupant.once('error', reject)
      occupant.listen(0, '127.0.0.1', resolve)
    })
    const address = occupant.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const startedAt = Date.now()
    try {
      await expect(readServiceHealth(port, { timeoutMs: 100 })).rejects.toThrow()
      expect(Date.now() - startedAt).toBeLessThan(750)
    } finally {
      await new Promise<void>((resolve, reject) => occupant.close((error) => error ? reject(error) : resolve()))
    }
  })

  it('latches repeated host failures across watchdog-style launches until explicit start', async () => {
    const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'md-reader-service-host-failure-latch-'))
    runtimeHomes.push(runtimeHome)
    const port = await getAvailablePort()

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const host = startHostProcess(runtimeHome, port)
      const exited = new Promise<void>((resolve) => host.once('exit', () => resolve()))
      await waitFor(async () => {
        try {
          return await requestServiceHost(runtimeHome, { command: 'ping' }, { timeoutMs: 200 })
        } catch {
          return null
        }
      }, 5000)
      await requestServiceHost(runtimeHome, { command: 'simulate-host-failure' }, { timeoutMs: 1000 })
      await Promise.race([
        exited,
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error(`host failure attempt ${attempt} did not exit`)), 8000)),
      ])
    }

    const blockedHost = startHostProcess(runtimeHome, port)
    const blocked = await waitFor(async () => {
      try {
        return await requestServiceHost(runtimeHome, { command: 'ping' }, { timeoutMs: 200 })
      } catch {
        return null
      }
    }, 5000)
    expect(blocked).toMatchObject({
      status: 'host_failed_blocked',
      hostFailureCount: 4,
      hostRecoveryBlocked: true,
      bridgePid: null,
    })
    await expect(readServiceHealth(port, { timeoutMs: 200 })).rejects.toThrow()

    await expect(ensureServiceRunning({ runtimeHome, port })).resolves.toMatchObject({
      alreadyRunning: true,
      hostPid: blockedHost.pid,
    })
    await expect(readServiceHealth(port)).resolves.toMatchObject({ serviceId: 'md-reader-bridge' })
  }, 35_000)

  it.runIf(process.platform === 'win32')('records a controlled Node start without displaying a console window', async () => {
    const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'md-reader-console-trace-'))
    runtimeHomes.push(runtimeHome)
    const port = await getAvailablePort()
    await ensureServiceRunning({ runtimeHome, port })

    const started = await requestServiceHost(runtimeHome, { command: 'console-trace-start' }, { timeoutMs: 5000 })
    expect(started.consoleTrace).toMatchObject({ status: 'running' })

    const probe = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    await new Promise<void>((resolve, reject) => probe.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`probe exited ${code}`))))

    const trace = await waitFor(async () => {
      const status = await requestServiceHost(runtimeHome, { command: 'console-trace-status' }, { timeoutMs: 1000 })
      if (status.consoleTrace?.lastError) throw new Error(status.consoleTrace.lastError)
      return status.consoleTrace?.recordCount ? status : null
    }, 8000)
    expect(trace.consoleTrace).toMatchObject({ status: 'running', recordCount: 1 })
    expect(JSON.parse(await readFile(trace.consoleTrace.logFile, 'utf8'))).toMatchObject({
      process: { pid: probe.pid, name: 'node.exe' },
    })

    await expect(requestServiceHost(runtimeHome, { command: 'console-trace-stop' }, { timeoutMs: 5000 })).resolves.toMatchObject({
      consoleTrace: { status: 'stopped' },
    })
  }, 20_000)
})

function startHostProcess(runtimeHome: string, port: number) {
  const child = spawn(process.execPath, [
    path.resolve('server/service-host.mjs'),
    '--runtime-home', runtimeHome,
    '--port', String(port),
  ], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'test' },
  })
  child.unref()
  return child
}

async function getAvailablePort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitFor<T>(probe: () => Promise<T | null>, timeoutMs: number): Promise<T> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const value = await probe()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out after ${timeoutMs}ms`)
}
