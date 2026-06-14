import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const REGISTRY_FILE = "projects.json";

export function defaultRuntimeHome() {
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, "md-reader");
  }
  return path.join(os.homedir(), ".md-reader");
}

export function normalizeRootPath(rootPath) {
  return path.resolve(String(rootPath)).replaceAll("\\", "/").toLowerCase().replace(/\/+$/, "");
}

export function createProjectId(name, rootPath) {
  const slug = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
  const hash = crypto.createHash("sha1").update(normalizeRootPath(rootPath)).digest("hex").slice(0, 8);
  return `${slug}-${hash}`;
}

function createEmptyRegistry() {
  return {
    version: 1,
    profiles: {},
  };
}

function createEmptyProfile() {
  return {
    activeProjectId: null,
    projects: [],
  };
}

async function ensureRuntimeHome(runtimeHome) {
  await mkdir(runtimeHome, { recursive: true });
}

function registryPath(runtimeHome) {
  return path.join(runtimeHome, REGISTRY_FILE);
}

export async function loadProjectRegistry(runtimeHome = defaultRuntimeHome()) {
  await ensureRuntimeHome(runtimeHome);
  try {
    const raw = await readFile(registryPath(runtimeHome), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return createEmptyRegistry();
    }
    throw error;
  }
}

export async function saveProjectRegistry(runtimeHome, registry) {
  await ensureRuntimeHome(runtimeHome);
  await writeFile(registryPath(runtimeHome), JSON.stringify(registry, null, 2));
}

function inferProjectName(rootPath) {
  return path.basename(path.resolve(rootPath)) || "Project";
}

export async function registerProject({ runtimeHome = defaultRuntimeHome(), profileId, rootPath }) {
  const registry = await loadProjectRegistry(runtimeHome);
  const profile = registry.profiles[profileId] ?? createEmptyProfile();
  const name = inferProjectName(rootPath);
  const project = {
    id: createProjectId(name, rootPath),
    name,
    rootPath: path.resolve(rootPath),
    accessMode: "local-service",
    contentRoots: ["."],
    permissionState: "granted",
  };
  const existingIndex = profile.projects.findIndex((entry) => entry.id === project.id);

  if (existingIndex >= 0) {
    profile.projects[existingIndex] = project;
  } else {
    profile.projects.push(project);
  }

  if (!profile.activeProjectId) {
    profile.activeProjectId = project.id;
  }

  registry.profiles[profileId] = profile;
  await saveProjectRegistry(runtimeHome, registry);
  return project;
}

export async function setActiveProjectId(runtimeHome = defaultRuntimeHome(), profileId, projectId) {
  const registry = await loadProjectRegistry(runtimeHome);
  const profile = registry.profiles[profileId] ?? createEmptyProfile();
  profile.activeProjectId = projectId;
  registry.profiles[profileId] = profile;
  await saveProjectRegistry(runtimeHome, registry);
}

export async function getProjectsSnapshot(runtimeHome = defaultRuntimeHome(), profileId) {
  const registry = await loadProjectRegistry(runtimeHome);
  const profile = registry.profiles[profileId] ?? createEmptyProfile();
  return {
    activeProjectId: profile.activeProjectId,
    projects: profile.projects,
  };
}

export async function getProjectById(runtimeHome = defaultRuntimeHome(), profileId, projectId) {
  const snapshot = await getProjectsSnapshot(runtimeHome, profileId);
  return snapshot.projects.find((project) => project.id === projectId) ?? null;
}
