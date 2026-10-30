import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { mkdir, realpath, stat, readdir } from 'node:fs/promises';
import { RegistryError, readRegistry, registryTransaction } from './registry-transaction.mjs';
export { RegistryError } from './registry-transaction.mjs';

export function defaultRuntimeHome() { return process.env.APPDATA ? path.join(process.env.APPDATA, 'md-reader') : path.join(os.homedir(), '.md-reader'); }
export function normalizeRootPath(rootPath) { return path.resolve(String(rootPath)).replaceAll('\\', '/').toLowerCase().replace(/\/+$/, ''); }
export function createProjectId(name, rootPath) {
  const slug = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  return `${slug}-${crypto.createHash('sha1').update(normalizeRootPath(rootPath)).digest('hex').slice(0, 8)}`;
}
function profileSnapshot(registry, profileId) {
  if (typeof profileId !== 'string' || !profileId.trim() || ['__proto__', 'prototype', 'constructor'].includes(profileId)) throw new RegistryError('个人配置标识无效');
  const record = Object.hasOwn(registry.profiles, profileId) ? registry.profiles[profileId] : undefined;
  if (record !== undefined && (!record || typeof record !== 'object' || Array.isArray(record))) throw new RegistryError('个人配置登记损坏', 'REGISTRY_CORRUPT', 500);
  const revision = record?.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) throw new RegistryError('项目列表版本无效', 'REGISTRY_CORRUPT', 500);
  if (!record || !Object.hasOwn(record, 'projects')) {
    if (record && Object.keys(record).some(key => key !== 'revision')) throw new RegistryError('项目登记字段不完整', 'REGISTRY_CORRUPT', 500);
    return { initialized: false, revision, projects: [], activeProjectId: null };
  }
  if (!Array.isArray(record.projects) || record.projects.some(p => !p || typeof p.id !== 'string' || typeof p.rootPath !== 'string') || new Set(record.projects.map(p => p.id)).size !== record.projects.length) throw new RegistryError('项目列表记录损坏', 'REGISTRY_CORRUPT', 500);
  return { initialized: true, revision, projects: record.projects, activeProjectId: record.activeProjectId ?? null };
}
function repairedActive(s) { return s.projects.some(p => p.id === s.activeProjectId) ? s.activeProjectId : s.projects[0]?.id ?? null; }
function expectRevision(s, revision) {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new RegistryError('缺少有效的项目列表版本');
  if (s.revision !== revision) throw new RegistryError('项目列表已变化，请刷新后重试', 'REGISTRY_CONFLICT', 409);
}
function writeSnapshot(registry, profileId, snapshot) {
  if (snapshot.revision >= Number.MAX_SAFE_INTEGER) throw new RegistryError('项目列表版本已超出范围', 'REGISTRY_CORRUPT', 500);
  const next = { ...snapshot, revision: snapshot.revision + 1 };
  registry.profiles[profileId] = next.initialized ? { revision: next.revision, projects: next.projects, activeProjectId: next.activeProjectId } : { revision: next.revision };
  return next;
}
async function mutate(runtimeHome, profileId, revision, change) {
  return registryTransaction(runtimeHome, async registry => {
    const snapshot = profileSnapshot(registry, profileId); expectRevision(snapshot, revision);
    const changed = await change(snapshot);
    return { changed, result: changed ? writeSnapshot(registry, profileId, snapshot) : snapshot };
  });
}
export async function loadProjectRegistry(runtimeHome = defaultRuntimeHome()) {
  await mkdir(runtimeHome, { recursive: true }); return readRegistry(await realpath(runtimeHome));
}
export async function getProjectsSnapshot(runtimeHome = defaultRuntimeHome(), profileId) {
  const snapshot = profileSnapshot(await loadProjectRegistry(runtimeHome), profileId);
  if (repairedActive(snapshot) === snapshot.activeProjectId) return snapshot;
  return registryTransaction(runtimeHome, registry => {
    const current = profileSnapshot(registry, profileId), active = repairedActive(current);
    if (active === current.activeProjectId) return { changed: false, result: current };
    current.activeProjectId = active; return { changed: true, result: writeSnapshot(registry, profileId, current) };
  });
}
export async function registerProject({ runtimeHome = defaultRuntimeHome(), profileId, rootPath, expectedRevision }) {
  if (typeof rootPath !== 'string' || !rootPath.trim()) throw new RegistryError('请输入项目目录');
  const absolute = path.resolve(rootPath.trim()); let canonical;
  try {
    if (!(await stat(absolute)).isDirectory()) throw new Error('不是目录');
    await readdir(absolute); canonical = await realpath(absolute);
  } catch (error) { throw new RegistryError(`项目目录不可读取：${error.message}`, 'PROJECT_PATH_UNAVAILABLE', 400); }
  const name = path.basename(absolute) || 'Project';
  const project = { id: createProjectId(name, absolute), name, rootPath: absolute, accessMode: 'local-service', contentRoots: ['.'], permissionState: 'granted' };
  const snapshot = await mutate(runtimeHome, profileId, expectedRevision, async current => {
    const index = current.projects.findIndex(entry => entry.id === project.id);
    if (index >= 0) {
      let existing; try { existing = await realpath(current.projects[index].rootPath); } catch { /* Unavailable old registration remains intact. */ }
      if (existing && existing !== canonical) throw new RegistryError('项目路径身份存在歧义，未合并目录', 'PROJECT_ID_COLLISION', 409);
      return false;
    }
    current.projects.push(project); current.initialized = true; current.activeProjectId = repairedActive(current); return true;
  });
  return { project: snapshot.projects.find(p => p.id === project.id), snapshot, ...(snapshot.lockCleanupWarning ? { lockCleanupWarning: snapshot.lockCleanupWarning } : {}) };
}
export async function setActiveProjectId(runtimeHome = defaultRuntimeHome(), profileId, projectId, expectedRevision) {
  return mutate(runtimeHome, profileId, expectedRevision, current => {
    if (!current.projects.some(p => p.id === projectId)) throw new RegistryError('项目不在当前个人配置列表中', 'PROJECT_NOT_REGISTERED', 404);
    if (current.activeProjectId === projectId) return false;
    current.activeProjectId = projectId; return true;
  });
}
export async function reorderProjects({ runtimeHome = defaultRuntimeHome(), profileId, orderedIds, expectedRevision }) {
  return mutate(runtimeHome, profileId, expectedRevision, current => {
    if (!Array.isArray(orderedIds) || orderedIds.length !== current.projects.length || new Set(orderedIds).size !== orderedIds.length || orderedIds.some(id => !current.projects.some(p => p.id === id))) throw new RegistryError('排序必须包含当前列表中的每个项目且不能重复');
    if (orderedIds.every((id, i) => id === current.projects[i].id)) return false;
    current.projects = orderedIds.map(id => current.projects.find(p => p.id === id)); return true;
  });
}
export async function unregisterProject({ runtimeHome = defaultRuntimeHome(), profileId, projectId, replacementProjectId, expectedRevision }) {
  return mutate(runtimeHome, profileId, expectedRevision, current => {
    const index = current.projects.findIndex(p => p.id === projectId);
    if (index < 0) throw new RegistryError('项目不在当前列表中', 'PROJECT_NOT_REGISTERED', 404);
    if (current.activeProjectId === projectId) {
      const neighbor = current.projects[index + 1]?.id ?? current.projects[index - 1]?.id ?? null;
      if (replacementProjectId !== neighbor) throw new RegistryError('替代项目必须为已准备的相邻项目', 'REGISTRY_CONFLICT', 409);
      current.activeProjectId = neighbor;
    } else if (replacementProjectId != null) throw new RegistryError('移除非当前项目不应指定替代项目');
    current.projects.splice(index, 1); return true;
  });
}
export async function reconcileProjects({ runtimeHome = defaultRuntimeHome(), profileId, expectedRevision }) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new RegistryError('缺少有效的原项目列表版本');
  return registryTransaction(runtimeHome, registry => {
    const current = profileSnapshot(registry, profileId);
    if (current.revision < expectedRevision) throw new RegistryError('项目登记版本发生回退，请检查登记文件', 'REGISTRY_VERSION_ROLLBACK', 409);
    const changed = current.revision === expectedRevision;
    return { changed, result: changed ? writeSnapshot(registry, profileId, current) : current };
  });
}
export async function getProjectById(runtimeHome = defaultRuntimeHome(), profileId, projectId) {
  return (await getProjectsSnapshot(runtimeHome, profileId)).projects.find(p => p.id === projectId) ?? null;
}
