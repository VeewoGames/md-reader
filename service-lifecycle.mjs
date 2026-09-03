import crypto from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { setTimeout as delay } from "node:timers/promises";

import { defaultRuntimeHome } from "./server/project-registry.mjs";
import { requestServiceHost } from "./server/service-host-protocol.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 8797;
const SERVICE_ID = "md-reader-bridge";

export function getRuntimePaths(runtimeHome = defaultRuntimeHome()) {
  return {
    runtimeHome,
    runtimeDir: path.join(runtimeHome, "runtime"),
    stateFile: path.join(runtimeHome, "runtime", "service-state.json"),
  };
}

export async function loadServiceState(runtimeHome = defaultRuntimeHome()) {
  const { stateFile } = getRuntimePaths(runtimeHome);
  try {
    const raw = await readFile(stateFile, "utf8");
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function clearServiceState(runtimeHome = defaultRuntimeHome()) {
  await rm(getRuntimePaths(runtimeHome).stateFile, { force: true });
}

export async function isPortResponding(port, requestPath = "/api/health") {
  const result = await readHttpJson(port, requestPath, 1000);
  return result.responding;
}

export async function ensureServiceRunning({ runtimeHome = defaultRuntimeHome(), port = DEFAULT_PORT } = {}) {
  let existing = null;
  try {
    existing = await requestServiceHost(runtimeHome, { command: "ping" }, { timeoutMs: 1000 });
  } catch {}

  let spawnedHostPid = null;
  if (!existing) {
    const child = spawn(process.execPath, [
      "server/service-host.mjs",
      "--runtime-home", runtimeHome,
      "--port", String(port),
    ], {
      cwd: scriptRoot,
      detached: true,
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    spawnedHostPid = child.pid ?? null;
    child.unref();
    await waitForHost(runtimeHome);
  }

  const wasAlreadyReady = existing?.status === "ready" && !existing.intentionalStop;
  const host = await requestServiceHost(runtimeHome, { command: "start", requestId: crypto.randomUUID() }, { timeoutMs: 10000 });
  const hostStartedByThisCall = spawnedHostPid !== null && host.hostPid === spawnedHostPid;

  const health = await readServiceHealth(port, { timeoutMs: 3000 });
  if (!health.ok || health.serviceId !== SERVICE_ID) {
    throw new Error("md-reader ServiceHost returned before the bridge passed its identity health check.");
  }
  return {
    alreadyRunning: wasAlreadyReady || !hostStartedByThisCall,
    port,
    pid: host.bridgePid,
    hostPid: host.hostPid,
    generation: host.generation,
  };
}

export async function stopService(runtimeHome = defaultRuntimeHome()) {
  try {
    const result = await requestServiceHost(runtimeHome, { command: "stop", requestId: crypto.randomUUID() }, { timeoutMs: 10000 });
    return { ok: true, message: `Stopped md-reader service${result.bridgePid ? ` pid ${result.bridgePid}` : ""}.` };
  } catch (error) {
    const state = await loadServiceState(runtimeHome);
    if (!state) return { ok: true, message: "No running md-reader service state was found." };
    if (state.hostPid && isProcessAlive(state.hostPid)) {
      return {
        ok: false,
        message: `Refusing fallback stop because ServiceHost pid ${state.hostPid} is still alive but its control channel is unavailable.`,
      };
    }

    const stoppingState = {
      ...state,
      intentionalStop: true,
      desiredState: "stopped",
      status: "stopping",
      updatedAt: new Date().toISOString(),
    };
    await writeServiceState(runtimeHome, stoppingState);
    const occupant = await readHttpJson(state.port ?? DEFAULT_PORT, "/api/health", 1000);
    if (occupant.responding) {
      const matchesRecordedBridge = occupant.payload?.serviceId === SERVICE_ID
        && Number(occupant.payload?.generation) === Number(state.generation)
        && occupant.payload?.nonce === state.bridgeNonce;
      if (!matchesRecordedBridge) {
        return { ok: false, message: `Refusing to stop the unknown process on port ${state.port ?? DEFAULT_PORT}.` };
      }
      await requestRecordedBridgeShutdown(state.port ?? DEFAULT_PORT, state.bridgeNonce, 2000).catch(() => {});
      const released = await waitForPortRelease(state.port ?? DEFAULT_PORT, 5000);
      if (!released) return { ok: false, message: "Timed out waiting for the recorded md-reader bridge to stop." };
    }
    await writeServiceState(runtimeHome, {
      ...stoppingState,
      bridgePid: null,
      status: "stopped",
      updatedAt: new Date().toISOString(),
    });
    return { ok: true, message: "Stopped the recorded md-reader service while ServiceHost was unavailable." };
  }
}

export async function restartService(runtimeHome = defaultRuntimeHome()) {
  return requestServiceHost(runtimeHome, { command: "restart", requestId: crypto.randomUUID() }, { timeoutMs: 15000 });
}

export async function readServiceHealth(port = DEFAULT_PORT, { timeoutMs = 2000 } = {}) {
  const result = await readHttpJson(port, "/api/health", timeoutMs);
  if (!result.responding) throw new Error(`connect ECONNREFUSED 127.0.0.1:${port}`);
  if ((result.statusCode ?? 500) >= 400) throw new Error(`HTTP ${result.statusCode}`);
  if (result.payload?.serviceId !== SERVICE_ID) throw new Error(`Port ${port} is not the md-reader bridge.`);
  return result.payload;
}

async function readHttpJson(port, requestPath, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      request.destroy();
      resolve(value);
    };
    const request = http.get({ hostname: "127.0.0.1", port, path: requestPath, timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          finish({ responding: true, statusCode: response.statusCode ?? 0, payload: JSON.parse(body) });
        } catch {
          finish({ responding: true, statusCode: response.statusCode ?? 0, payload: null });
        }
      });
      response.on("aborted", () => finish({ responding: false, payload: null }));
      response.on("error", () => finish({ responding: false, payload: null }));
    });
    const deadline = setTimeout(() => finish({ responding: false, payload: null }), timeoutMs);
    request.on("timeout", () => finish({ responding: false, payload: null }));
    request.on("error", () => finish({ responding: false, payload: null }));
  });
}

async function writeServiceState(runtimeHome, state) {
  const { runtimeDir, stateFile } = getRuntimePaths(runtimeHome);
  await mkdir(runtimeDir, { recursive: true });
  const temporaryPath = `${stateFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(state, null, 2), "utf8");
  await rename(temporaryPath, stateFile);
}

async function requestRecordedBridgeShutdown(port, nonce, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/api/internal/shutdown",
      method: "POST",
      timeout: timeoutMs,
      headers: { "x-md-reader-bridge-nonce": nonce ?? "" },
    }, (response) => {
      response.resume();
      response.on("end", resolve);
    });
    const deadline = setTimeout(() => request.destroy(new Error("shutdown deadline exceeded")), timeoutMs);
    request.once("close", () => clearTimeout(deadline));
    request.on("timeout", () => request.destroy(new Error("shutdown timeout")));
    request.on("error", reject);
    request.end();
  });
}

async function waitForPortRelease(port, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!(await readHttpJson(port, "/api/health", 250)).responding) return true;
    await delay(100);
  }
  return false;
}

function isProcessAlive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForHost(runtimeHome, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await requestServiceHost(runtimeHome, { command: "ping" }, { timeoutMs: 250 });
      return;
    } catch {
      await delay(100);
    }
  }
  throw new Error("Timed out waiting for md-reader ServiceHost to start.");
}
