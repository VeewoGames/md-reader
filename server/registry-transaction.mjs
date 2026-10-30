import * as disk from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const queues = new Map();
export class RegistryError extends Error {
  constructor(message, code = 'REGISTRY_INVALID', status = 400) {
    super(message); this.code = code; this.status = status;
  }
}
export async function readRegistry(directory, io = disk) {
  try {
    const registry = JSON.parse(await io.readFile(path.join(directory, 'projects.json'), 'utf8'));
    if (registry?.version !== 1 || !registry.profiles || typeof registry.profiles !== 'object' || Array.isArray(registry.profiles)) throw new RegistryError('项目登记文件格式无效，未覆盖原文件', 'REGISTRY_CORRUPT', 500);
    return registry;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, profiles: {} };
    throw error;
  }
}
// All writers, including direct module callers, use this boundary. I/O injection tests failures.
export async function registryTransaction(runtimeHome, update, { io = disk, timeoutMs = 5000 } = {}) {
  await io.mkdir(runtimeHome, { recursive: true });
  const directory = await io.realpath(runtimeHome);
  const previous = queues.get(directory) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    const lockPath = path.join(directory, 'projects.json.lock');
    const ownerToken = crypto.randomUUID();
    const deadline = Date.now() + timeoutMs;
    let handle;
    while (!handle) {
      try { handle = await io.open(lockPath, 'wx'); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (Date.now() >= deadline) throw new RegistryError('项目列表正被占用；如服务异常退出，请停止相关服务后维护清理遗留锁', 'REGISTRY_BUSY', 503);
        await delay(Math.min(25, Math.max(1, deadline - Date.now())));
      }
    }
    let result, primaryError, tempPath;
    let metadataWritten = false;
    try {
      await handle.writeFile(JSON.stringify({ ownerToken, pid: process.pid, createdAt: new Date().toISOString() }));
      metadataWritten = true;
      await handle.close(); handle = null;
      const registry = await readRegistry(directory, io);
      const outcome = await update(registry);
      if (outcome.changed) {
        tempPath = path.join(directory, `projects.json.${crypto.randomUUID()}.tmp`);
        await io.writeFile(tempPath, JSON.stringify(registry, null, 2), { flag: 'wx' });
        await io.rename(tempPath, path.join(directory, 'projects.json'));
        tempPath = null;
      }
      result = outcome.result;
    } catch (error) { primaryError = error; }
    finally {
      let cleanupError;
      try { if (handle) await handle.close(); } catch (error) { cleanupError = error; }
      try { if (tempPath) await io.rm(tempPath, { force: true }); } catch (error) { cleanupError ??= error; }
      try {
        if (metadataWritten && JSON.parse(await io.readFile(lockPath, 'utf8')).ownerToken !== ownerToken) throw new Error('锁所有权已改变，未清理他人的锁');
        await io.unlink(lockPath);
      } catch (error) { cleanupError ??= error; }
      if (cleanupError) {
        const warning = `项目列表锁清理失败：${cleanupError.message}；停止相关服务后维护清理遗留锁`;
        if (primaryError) primaryError.lockCleanupWarning = warning;
        else result = { ...result, lockCleanupWarning: warning };
      }
    }
    if (primaryError) throw primaryError;
    return result;
  });
  queues.set(directory, pending);
  try { return await pending; }
  finally { if (queues.get(directory) === pending) queues.delete(directory); }
}
