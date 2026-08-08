import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

import { normalizeRootPath } from "./project-registry.mjs";
import { isMarkdownFile, scanMarkdownTree } from "./project-scanner.mjs";

const SNAPSHOT_VERSION = 1;
const DEFAULT_FRESH_AFTER_MS = 30_000;
const DEFAULT_REFRESH_RESULT_TTL_MS = 5 * 60_000;
const DEFAULT_MAX_TERMINAL_RECORDS = 128;

export function canonicalizeTreePaths(paths) {
  return [...new Set(
    paths
      .map((entry) => String(entry).replaceAll("\\", "/").replace(/^\.\//, ""))
      .filter((entry) => (
        entry &&
        !path.posix.isAbsolute(entry) &&
        !/^[a-zA-Z]:\//.test(entry) &&
        !entry.split("/").includes("..") &&
        isMarkdownFile(entry)
      )),
  )].sort((left, right) => {
    const depthDelta = left.split("/").length - right.split("/").length;
    return depthDelta || left.localeCompare(right);
  });
}

export function createProjectFingerprint(project) {
  const contentRoots = [...(project.contentRoots ?? ["."])]
    .map((entry) => String(entry).replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "") || ".")
    .sort();
  const identity = JSON.stringify({
    rootPath: normalizeRootPath(project.rootPath),
    contentRoots,
  });
  return crypto.createHash("sha256").update(identity).digest("hex");
}

export function createSnapshotRevision({ projectFingerprint, paths }) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ version: SNAPSHOT_VERSION, projectFingerprint, paths }))
    .digest("hex");
}

export function createProjectTreeCache({
  runtimeHome,
  scan = scanMarkdownTree,
  now = () => Date.now(),
  freshAfterMs = DEFAULT_FRESH_AFTER_MS,
  refreshResultTtlMs = DEFAULT_REFRESH_RESULT_TTL_MS,
  maxTerminalRecords = DEFAULT_MAX_TERMINAL_RECORDS,
  beforePersistRename,
  replaceSnapshot = rename,
} = {}) {
  if (!runtimeHome) throw new Error("ProjectTreeCache requires runtimeHome");

  const entries = new Map();
  const refreshRecords = new Map();
  const scanQueue = [];
  let activeScanCount = 0;
  let nextRefreshId = 1;

  function drainScanQueue() {
    while (activeScanCount < 1 && scanQueue.length > 0) {
      const foregroundIndex = scanQueue.findIndex((task) => task.foreground());
      const task = scanQueue.splice(foregroundIndex >= 0 ? foregroundIndex : 0, 1)[0];
      activeScanCount += 1;
      Promise.resolve()
        .then(task.run)
        .then(task.resolve, task.reject)
        .finally(() => {
          activeScanCount -= 1;
          drainScanQueue();
        });
    }
  }

  function scheduleScan(run, foreground) {
    return new Promise((resolve, reject) => {
      scanQueue.push({ run, foreground, resolve, reject });
      drainScanQueue();
    });
  }

  function snapshotPath(fingerprint) {
    return path.join(runtimeHome, "cache", "project-trees", `${fingerprint}.json`);
  }

  function getEntry(project) {
    const fingerprint = createProjectFingerprint(project);
    let entry = entries.get(fingerprint);
    if (!entry) {
      entry = {
        fingerprint,
        loaded: false,
        loadPromise: null,
        snapshot: null,
        mutationEpoch: 0,
        generation: 0,
        activeRefresh: null,
        persistenceDirty: false,
        persistenceQueue: Promise.resolve(),
      };
      entries.set(fingerprint, entry);
    }
    return entry;
  }

  async function loadPersisted(entry) {
    if (entry.loaded) return;
    if (!entry.loadPromise) {
      entry.loadPromise = (async () => {
        try {
          const payload = JSON.parse(await readFile(snapshotPath(entry.fingerprint), "utf8"));
          if (
            payload?.version !== SNAPSHOT_VERSION ||
            payload?.projectFingerprint !== entry.fingerprint ||
            payload?.complete !== true ||
            !Array.isArray(payload.paths) ||
            typeof payload.snapshotRevision !== "string" ||
            canonicalizeTreePaths(payload.paths).join("\n") !== payload.paths.join("\n") ||
            createSnapshotRevision({ projectFingerprint: entry.fingerprint, paths: payload.paths }) !== payload.snapshotRevision
          ) {
            return;
          }
          entry.snapshot = payload;
          entry.mutationEpoch = Math.max(0, Number(payload.mutationEpoch) || 0);
          entry.generation = Math.max(0, Number(payload.generation) || 0);
        } catch (error) {
          if (error?.code !== "ENOENT") entry.snapshot = null;
        } finally {
          entry.loaded = true;
          entry.loadPromise = null;
        }
      })();
    }
    await entry.loadPromise;
  }

  function pruneTerminalRecords() {
    const cutoff = now() - refreshResultTtlMs;
    for (const [refreshId, record] of refreshRecords) {
      if (record.completedAt != null && record.completedAt <= cutoff) refreshRecords.delete(refreshId);
    }
    const terminals = [...refreshRecords.values()]
      .filter((record) => record.completedAt != null)
      .sort((left, right) => left.completedAt - right.completedAt);
    while (terminals.length > maxTerminalRecords) {
      refreshRecords.delete(terminals.shift().refreshId);
    }
  }

  function createRefreshRecord(entry, requestedGeneration) {
    const record = {
      refreshId: `tree-${nextRefreshId++}`,
      fingerprint: entry.fingerprint,
      requestedGeneration,
      completedAt: null,
      result: null,
      error: null,
      promise: null,
    };
    entry.activeRefresh = record;
    refreshRecords.set(record.refreshId, record);
    return record;
  }

  function queuePersist(entry, snapshot) {
    const capturedEpoch = snapshot.mutationEpoch;
    const capturedRevision = snapshot.snapshotRevision;
    const persist = async () => {
        const destination = snapshotPath(entry.fingerprint);
        await mkdir(path.dirname(destination), { recursive: true });
        const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
        try {
          await writeFile(temporary, JSON.stringify(snapshot, null, 2));
          await beforePersistRename?.({ entry, snapshot });
          if (
            entry.mutationEpoch !== capturedEpoch ||
            entry.snapshot?.snapshotRevision !== capturedRevision
          ) {
            return;
          }
          await replaceSnapshot(temporary, destination);
          entry.persistenceDirty = false;
        } finally {
          await rm(temporary, { force: true }).catch(() => undefined);
        }
      };
    entry.persistenceQueue = entry.persistenceQueue.then(persist, persist).catch(() => {
      entry.persistenceDirty = true;
    });
    return entry.persistenceQueue;
  }

  async function runRefresh(project, entry, record) {
    try {
      while (true) {
        const scanGeneration = ++entry.generation;
        const scanEpoch = entry.mutationEpoch;
        const scannedPaths = canonicalizeTreePaths(await scheduleScan(
          () => scan(project.rootPath, project.contentRoots),
          () => record.foreground,
        ));
        if (entry.mutationEpoch !== scanEpoch || scanGeneration < record.requestedGeneration) {
          continue;
        }
        const generatedAt = now();
        const snapshot = {
          version: SNAPSHOT_VERSION,
          projectFingerprint: entry.fingerprint,
          complete: true,
          paths: scannedPaths,
          snapshotRevision: createSnapshotRevision({ projectFingerprint: entry.fingerprint, paths: scannedPaths }),
          generatedAt,
          lastVerifiedAt: generatedAt,
          mutationEpoch: entry.mutationEpoch,
          generation: scanGeneration,
        };
        entry.snapshot = snapshot;
        await queuePersist(entry, snapshot);
        record.result = snapshot;
        return snapshot;
      }
    } catch (error) {
      record.error = error instanceof Error ? error : new Error(String(error));
      throw record.error;
    } finally {
      record.completedAt = now();
      if (entry.activeRefresh === record) entry.activeRefresh = null;
      pruneTerminalRecords();
    }
  }

  function ensureRefresh(project, entry, { force = false } = {}) {
    const requestedGeneration = force ? entry.generation + 1 : entry.generation;
    if (entry.activeRefresh) {
      entry.activeRefresh.requestedGeneration = Math.max(entry.activeRefresh.requestedGeneration, requestedGeneration);
      entry.activeRefresh.foreground ||= force || !entry.snapshot;
      return entry.activeRefresh;
    }
    const record = createRefreshRecord(entry, requestedGeneration);
    record.foreground = force || !entry.snapshot;
    record.promise = runRefresh(project, entry, record);
    return record;
  }

  async function get(project, { mode = "prefer-cache", refreshId } = {}) {
    const entry = getEntry(project);
    await loadPersisted(entry);
    pruneTerminalRecords();
    if (mode === "wait") {
      const record = refreshRecords.get(refreshId);
      if (!record || record.fingerprint !== entry.fingerprint) {
        return { status: "expired" };
      }
      try {
        const snapshot = record.result ?? await record.promise;
        return { status: "ready", tree: snapshot.paths, refreshId: record.refreshId };
      } catch (error) {
        return { status: "failed", refreshId: record.refreshId, error };
      }
    }
    if (mode !== "prefer-cache" && mode !== "force") throw new Error(`Unknown tree mode: ${mode}`);
    const force = mode === "force";
    const fresh = entry.snapshot && !entry.persistenceDirty && now() - entry.snapshot.lastVerifiedAt < freshAfterMs;
    if (force || !fresh) {
      const record = ensureRefresh(project, entry, { force });
      if (force) {
        return {
          status: "refreshing",
          refreshId: record.refreshId,
          requestedGeneration: record.requestedGeneration,
        };
      }
      if (!entry.snapshot) return { status: force ? "refreshing" : "indexing", refreshId: record.refreshId, requestedGeneration: record.requestedGeneration };
      return { status: "ready", tree: entry.snapshot.paths, refreshId: record.refreshId };
    }
    return { status: "ready", tree: entry.snapshot.paths, refreshId: null };
  }

  async function markMutation(project) {
    const entry = getEntry(project);
    await loadPersisted(entry);
    entry.mutationEpoch += 1;
    entry.snapshot = null;
    await rm(snapshotPath(entry.fingerprint), { force: true });
    return { projectFingerprint: entry.fingerprint, mutationEpoch: entry.mutationEpoch };
  }

  return {
    get,
    markMutation,
    getSnapshotPath: (project) => snapshotPath(getEntry(project).fingerprint),
  };
}
