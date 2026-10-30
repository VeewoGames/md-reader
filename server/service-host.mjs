import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import { defaultRuntimeHome } from "./project-registry.mjs";
import { getServiceHostPipeName, requestServiceHost } from "./service-host-protocol.mjs";

const SERVICE_ID = "md-reader-bridge";
const DEFAULT_PORT = 8797;
const READY_TIMEOUT_MS = 8000;
const STOP_TIMEOUT_MS = 5000;
const MAX_RESTARTS = 3;
const MAX_CAPTURE_BYTES = 16 * 1024;
const MAX_TRACE_RECORDS = 256;
const TRACE_RETENTION_MS = 72 * 60 * 60 * 1000;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(moduleDir);

export function getServiceHostPaths(runtimeHome = defaultRuntimeHome()) {
  const runtimeDir = path.join(runtimeHome, "runtime");
  return {
    runtimeDir,
    stateFile: path.join(runtimeDir, "service-state.json"),
    lockFile: path.join(runtimeDir, "service-host.lock.json"),
    lifecycleLog: path.join(runtimeDir, "service-lifecycle.log.jsonl"),
    consoleTraceLog: path.join(runtimeDir, "console-process-attribution.jsonl"),
    pipeName: getServiceHostPipeName(runtimeHome),
  };
}

export async function runServiceHost({ runtimeHome = defaultRuntimeHome(), port = DEFAULT_PORT } = {}) {
  const paths = getServiceHostPaths(runtimeHome);
  await mkdir(paths.runtimeDir, { recursive: true });
  const hostId = crypto.randomUUID();
  const releaseLock = await acquireHostLock(paths, hostId);
  let record = normalizeRecord(await readJson(paths.stateFile), { hostId, port });
  record.consoleTrace.logFile = paths.consoleTraceLog;
  let childToken = null;
  let restartTimer = null;
  let commandQueue = Promise.resolve();
  let hostFailurePromise = null;
  let consoleTraceToken = null;
  const controlSockets = new Set();

  const enqueue = (operation) => {
    const result = commandQueue.then(operation, operation);
    commandQueue = result.catch(() => {});
    return result;
  };

  const server = net.createServer((socket) => {
    controlSockets.add(socket);
    socket.once("close", () => controlSockets.delete(socket));
    socket.setEncoding("utf8");
    let input = "";
    socket.on("data", (chunk) => {
      input += chunk;
      const newlineIndex = input.indexOf("\n");
      if (newlineIndex < 0) return;
      const raw = input.slice(0, newlineIndex);
      input = input.slice(newlineIndex + 1);
      void enqueue(async () => {
        try {
          const request = JSON.parse(raw);
          const result = await handleCommand(request);
          socket.end(`${JSON.stringify({ ok: true, result })}\n`);
        } catch (error) {
          socket.end(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`);
        }
      });
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(paths.pipeName, resolve);
  });
  record.hostId = hostId;
  record.hostPid = process.pid;
  await persistRecord();
  await appendEvent("host_started", { hostPid: process.pid });

  if (!record.intentionalStop && record.status !== "failed" && !record.hostRecoveryBlocked) {
    void enqueue(() => startBridgeWithRecovery()).catch(() => {});
  }

  const shutdownHost = async (exitCode = 0, { preserveHostFailure = false } = {}) => {
    if (restartTimer) clearTimeout(restartTimer);
    try {
      await stopConsoleTrace();
    } catch (error) {
      await appendEvent("host_shutdown_step_failed", { step: "stop_console_trace", error: error instanceof Error ? error.message : String(error) });
    }
    try {
      await stopBridge({ preserveDesiredState: !record.intentionalStop });
    } catch (error) {
      await appendEvent("host_shutdown_step_failed", { step: "stop_bridge", error: error instanceof Error ? error.message : String(error) });
    }
    if (preserveHostFailure) {
      try {
        record.status = record.hostRecoveryBlocked ? "host_failed_blocked" : "host_failed";
        await persistRecord();
      } catch (error) {
        await appendEvent("host_shutdown_step_failed", { step: "persist_failure", error: error instanceof Error ? error.message : String(error) });
      }
    }
    try {
      const serverClosed = new Promise((resolve) => server.close(resolve));
      for (const socket of controlSockets) socket.destroy();
      await Promise.race([serverClosed, delay(1000)]);
    } catch (error) {
      await appendEvent("host_shutdown_step_failed", { step: "close_control", error: error instanceof Error ? error.message : String(error) });
    }
    if (process.platform !== "win32") {
      await rm(paths.pipeName, { force: true }).catch((error) =>
        appendEvent("host_shutdown_step_failed", { step: "remove_pipe", error: error instanceof Error ? error.message : String(error) }),
      );
    }
    await releaseLock().catch((error) =>
      appendEvent("host_shutdown_step_failed", { step: "release_lock", error: error instanceof Error ? error.message : String(error) }),
    );
    process.exit(exitCode);
  };

  process.once("SIGINT", () => void shutdownHost(0));
  process.once("SIGTERM", () => void shutdownHost(0));
  process.once("uncaughtException", async (error) => {
    await appendEvent("host_uncaught_exception", { error: error.stack ?? error.message });
    await failHost(error);
  });
  process.once("unhandledRejection", async (reason) => {
    await appendEvent("host_unhandled_rejection", { error: reason instanceof Error ? (reason.stack ?? reason.message) : String(reason) });
    await failHost(reason);
  });

  function failHost(reason) {
    if (hostFailurePromise) return hostFailurePromise;
    hostFailurePromise = (async () => {
      record.hostFailureCount = Number(record.hostFailureCount ?? 0) + 1;
      record.hostRecoveryBlocked = record.hostFailureCount > MAX_RESTARTS;
      record.lastError = reason instanceof Error ? reason.message : String(reason);
      await appendEvent("host_failure_recorded", {
        failureCount: record.hostFailureCount,
        blocked: record.hostRecoveryBlocked,
        error: record.lastError,
      });
      await shutdownHost(1, { preserveHostFailure: true });
    })();
    return hostFailurePromise;
  }

  async function handleCommand(request) {
    switch (request.command) {
      case "ping":
      case "health":
        return record;
      case "start":
        record.intentionalStop = false;
        record.desiredState = "ready";
        record.failureCount = 0;
        record.hostFailureCount = 0;
        record.hostRecoveryBlocked = false;
        record.status = "starting";
        await persistRecord();
        return startBridgeWithRecovery();
      case "stop":
        record.intentionalStop = true;
        record.desiredState = "stopped";
        await persistRecord();
        await stopBridge();
        return record;
      case "restart":
        if (record.intentionalStop) return record;
        await stopBridge({ preserveDesiredState: true });
        return startBridgeWithRecovery();
      case "shutdown-host":
        record.intentionalStop = true;
        record.desiredState = "stopped";
        await persistRecord();
        setTimeout(() => void shutdownHost(0), 0);
        return record;
      case "console-trace-start":
        return startConsoleTrace();
      case "console-trace-status":
        return record;
      case "console-trace-stop":
        await stopConsoleTrace();
        return record;
      case "console-trace-purge":
        if (consoleTraceToken?.child.exitCode === null) throw new Error("Stop console trace before purging its records.");
        await rm(paths.consoleTraceLog, { force: true });
        record.consoleTrace = { ...record.consoleTrace, recordCount: 0, lastRecordAt: null };
        await persistRecord();
        return record;
      case "simulate-host-failure":
        if (process.env.NODE_ENV !== "test") throw new Error("Unsupported ServiceHost command: simulate-host-failure");
        setTimeout(() => void failHost(new Error("simulated host failure")), 25);
        return record;
      default:
        throw new Error(`Unsupported ServiceHost command: ${String(request.command)}`);
    }
  }

  async function ensureBridgeRunning() {
    if (childToken?.child && childToken.child.exitCode === null) {
      const identity = await readBridgeIdentity(port, 1000);
      if (matchesIdentity(identity, record)) return record;
    }

    const occupied = await readBridgeIdentity(port, 750);
    if (occupied.responding) {
      if (matchesIdentity(occupied, record)) {
        await appendEvent("orphan_detected", { bridgePid: record.bridgePid, generation: record.generation });
        await requestBridgeShutdown(port, record.bridgeNonce).catch(() => {});
        const released = await waitForPortRelease(port, STOP_TIMEOUT_MS);
        if (!released) {
          record.status = "orphan_conflict";
          record.lastError = `The previous md-reader bridge on port ${port} did not stop for host takeover.`;
          await persistRecord();
          throw new Error(record.lastError);
        }
      } else {
        record.status = "port_conflict";
        record.lastError = `Port ${port} is occupied by a process that is not the expected md-reader bridge.`;
        await persistRecord();
        await appendEvent("port_conflict", { port });
        throw new Error(record.lastError);
      }
    }

    record.generation = Number(record.generation ?? 0) + 1;
    record.bridgeNonce = crypto.randomUUID();
    record.bridgePid = null;
    record.status = "starting";
    record.lastError = null;
    await persistRecord();

    const child = spawn(process.execPath, [
      path.join(moduleDir, "bridge-server.mjs"),
      "--port", String(port),
      "--runtime-home", runtimeHome,
      "--web-mode", "dev",
      "--generation", String(record.generation),
      "--nonce", record.bridgeNonce,
    ], {
      cwd: projectRoot,
      detached: false,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const token = {
      child,
      intentional: false,
      stdout: "",
      stderr: "",
      stabilityTimer: null,
      observedCode: null,
      observedSignal: null,
      observedError: null,
    };
    childToken = token;
    record.bridgePid = child.pid ?? null;
    await persistRecord();
    await appendEvent("spawned", { bridgePid: child.pid ?? null, generation: record.generation });
    captureStream(child.stdout, token, "stdout");
    captureStream(child.stderr, token, "stderr");
    child.once("error", (error) => {
      token.observedError = error;
      void enqueue(() => handleChildExit(token, null, null, error)).catch((handlerError) =>
        appendEvent("child_exit_handler_failed", { error: handlerError instanceof Error ? handlerError.message : String(handlerError) }),
      );
    });
    child.once("exit", (code, signal) => {
      token.observedCode = code;
      token.observedSignal = signal;
      void enqueue(() => handleChildExit(token, code, signal)).catch((handlerError) =>
        appendEvent("child_exit_handler_failed", { error: handlerError instanceof Error ? handlerError.message : String(handlerError) }),
      );
    });

    const identity = await waitForBridgeReady(record, READY_TIMEOUT_MS);
    if (!matchesIdentity(identity, record)) {
      token.intentional = true;
      childToken = null;
      if (child.exitCode === null) child.kill();
      await waitForExit(child, STOP_TIMEOUT_MS);
      record.bridgePid = null;
      record.exitCode = token.observedCode ?? child.exitCode;
      record.exitSignal = token.observedSignal ?? child.signalCode;
      record.lastError = token.observedError?.message ?? (token.stderr.slice(-MAX_CAPTURE_BYTES) || "ready handshake failed");
      await persistRecord();
      await appendEvent("startup_failed", {
        code: record.exitCode,
        signal: record.exitSignal,
        error: record.lastError,
        generation: record.generation,
      });
      throw new Error("md-reader bridge failed its identity ready handshake.");
    }
    record.status = "ready";
    record.readyAt = new Date().toISOString();
    await persistRecord();
    await appendEvent("ready", { bridgePid: child.pid ?? null, generation: record.generation, bridgeNonce: record.bridgeNonce });
    token.stabilityTimer = setTimeout(() => {
      if (childToken === token && token.child.exitCode === null) {
        record.failureCount = 0;
        record.hostFailureCount = 0;
        record.hostRecoveryBlocked = false;
        void persistRecord();
      }
    }, 60_000);
    return record;
  }

  async function startBridgeWithRecovery() {
    try {
      return await ensureBridgeRunning();
    } catch (error) {
      await appendEvent("restart_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      if (record.status !== "port_conflict" && record.status !== "orphan_conflict") {
        await scheduleRestart();
      }
      throw error;
    }
  }

  async function stopBridge({ preserveDesiredState = false } = {}) {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    const token = childToken;
    if (!token?.child || token.child.exitCode !== null) {
      record.bridgePid = null;
      record.status = preserveDesiredState ? "host_stopping" : "stopped";
      await persistRecord();
      return;
    }
    token.intentional = true;
    await requestBridgeShutdown(port, record.bridgeNonce).catch(() => {});
    const exited = await waitForExit(token.child, STOP_TIMEOUT_MS);
    if (!exited) token.child.kill();
    record.bridgePid = null;
    record.status = preserveDesiredState ? "host_stopping" : "stopped";
    await persistRecord();
    await appendEvent("stopped", { forced: !exited });
  }

  async function handleChildExit(token, code, signal, error = null) {
    if (childToken !== token) return;
    if (token.stabilityTimer) clearTimeout(token.stabilityTimer);
    childToken = null;
    record.bridgePid = null;
    record.exitCode = code;
    record.exitSignal = signal;
    record.lastError = error?.message ?? (token.stderr.slice(-MAX_CAPTURE_BYTES) || null);
    record.status = token.intentional || record.intentionalStop ? "stopped" : "exited";
    await persistRecord();
    await appendEvent("exited", { code, signal, intentional: token.intentional, error: record.lastError });
    if (token.intentional || record.intentionalStop) return;

    await scheduleRestart();
  }

  async function scheduleRestart() {
    if (record.intentionalStop || restartTimer) return;
    record.failureCount = Number(record.failureCount ?? 0) + 1;
    if (record.failureCount > MAX_RESTARTS) {
      record.status = "failed";
      await persistRecord();
      await appendEvent("failed", { failureCount: record.failureCount });
      return;
    }
    const delayMs = 1000 * (2 ** (record.failureCount - 1));
    record.status = "backoff";
    record.nextRestartAt = new Date(Date.now() + delayMs).toISOString();
    await persistRecord();
    await appendEvent("restart_scheduled", { delayMs, failureCount: record.failureCount });
    restartTimer = setTimeout(() => {
      restartTimer = null;
      void enqueue(() => startBridgeWithRecovery()).catch(() => {});
    }, delayMs);
  }

  async function startConsoleTrace() {
    if (process.platform !== "win32") throw new Error("Console process trace is only supported on Windows.");
    if (consoleTraceToken?.child.exitCode === null) return record;
    const runId = crypto.randomUUID();
    const helperPath = path.join(moduleDir, "console-process-attribution.ps1");
    const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", helperPath, "-RunId", runId, "-ParentPid", String(process.pid)], {
      cwd: projectRoot,
      detached: false,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const token = { child, runId, stdout: "", stderr: "", ready: null, failure: null, lineBuffer: "" };
    consoleTraceToken = token;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      token.stdout = `${token.stdout}${chunk}`.slice(-MAX_CAPTURE_BYTES);
      token.lineBuffer += String(chunk);
      const lines = token.lineBuffer.split(/\r?\n/);
      token.lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.includes('"type":"ready"') || line.includes('"type":"failure"')) void consumeConsoleTraceLine(token, line);
        else void enqueue(() => consumeConsoleTraceLine(token, line)).catch(() => {});
      }
    });
    captureStream(child.stderr, token, "stderr");
    child.once("exit", (code) => {
      if (consoleTraceToken !== token) return;
      consoleTraceToken = null;
      record.consoleTrace = { ...record.consoleTrace, status: "stopped", helperPid: null, lastError: code === 0 ? null : (record.consoleTrace.lastError ?? token.stderr.slice(-1024) ?? `helper exited ${code}`) };
      void persistRecord();
    });
    await waitFor(() => {
      if (token.ready) return token.ready;
      if (token.failure) throw new Error(`Console trace helper failed: ${token.failure}`);
      if (child.exitCode !== null) throw new Error(`Console trace helper exited before ready: ${token.stderr.slice(-1024) || child.exitCode}`);
      return null;
    }, 5000, "Console trace helper did not become ready.");
    record.consoleTrace = { ...record.consoleTrace, status: "running", runId, helperPid: child.pid ?? null, sessionId: token.ready.sessionId, startedAt: new Date().toISOString(), lastError: null };
    await persistRecord();
    await appendEvent("console_trace_started", { runId, helperPid: child.pid ?? null, sessionId: token.ready.sessionId });
    return record;
  }

  async function consumeConsoleTraceLine(token, line) {
    if (!line.trim()) return;
    let frame;
    try { frame = JSON.parse(line); } catch { return; }
    if (frame.runId !== token.runId) return;
    if (frame.type === "ready") { token.ready = frame; return; }
    if (frame.type === "failure") {
      token.failure = frame.message ?? "unknown failure";
      record.consoleTrace = { ...record.consoleTrace, lastError: token.failure };
      await persistRecord();
      return;
    }
    if (frame.type === "error") {
      record.consoleTrace = { ...record.consoleTrace, lastError: frame.message ?? "console trace record error" };
      await persistRecord();
      return;
    }
    if (frame.type !== "record" || !frame.process?.pid || !frame.process?.name) return;
    const payload = JSON.stringify(frame);
    if (Buffer.byteLength(payload, "utf8") > MAX_CAPTURE_BYTES) return;
    await pruneConsoleTraceLog();
    await writeFile(paths.consoleTraceLog, `${payload}\n`, { encoding: "utf8", flag: "a" });
    record.consoleTrace = { ...record.consoleTrace, recordCount: Number(record.consoleTrace.recordCount ?? 0) + 1, lastRecordAt: frame.at ?? new Date().toISOString() };
    await persistRecord();
  }

  async function stopConsoleTrace() {
    const token = consoleTraceToken;
    if (!token?.child || token.child.exitCode !== null) {
      record.consoleTrace = { ...record.consoleTrace, status: "stopped", helperPid: null };
      await persistRecord();
      return;
    }
    token.child.kill();
    const stopped = await waitForExit(token.child, 5000);
    if (!stopped) throw new Error("Timed out stopping console trace helper.");
    consoleTraceToken = null;
    record.consoleTrace = { ...record.consoleTrace, status: "stopped", helperPid: null };
    await persistRecord();
    await appendEvent("console_trace_stopped", { runId: token.runId });
  }

  async function pruneConsoleTraceLog() {
    try {
      const lines = (await readFile(paths.consoleTraceLog, "utf8")).trim().split(/\r?\n/).filter(Boolean);
      const cutoff = Date.now() - TRACE_RETENTION_MS;
      const retained = lines.slice(-MAX_TRACE_RECORDS + 1).filter((line) => {
        try { return Date.parse(JSON.parse(line).at) >= cutoff; } catch { return false; }
      });
      if (retained.length !== lines.length) await writeFile(paths.consoleTraceLog, retained.length ? `${retained.join("\n")}\n` : "", "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async function persistRecord() {
    record.updatedAt = new Date().toISOString();
    await writeJsonAtomic(paths.stateFile, record);
  }

  async function appendEvent(event, details = {}) {
    const payload = JSON.stringify({ at: new Date().toISOString(), event, hostId, ...details });
    try {
      await writeFile(paths.lifecycleLog, `${payload}\n`, { encoding: "utf8", flag: "a" });
    } catch (error) {
      process.stderr.write(`md-reader lifecycle log unavailable: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

function normalizeRecord(value, { hostId, port }) {
  const recoveryBlocked = value?.status === "failed" && !value?.intentionalStop;
  const hostRecoveryBlocked = Boolean(value?.hostRecoveryBlocked || value?.status === "host_failed_blocked");
  return {
    version: 2,
    hostId,
    hostPid: process.pid,
    generation: Number(value?.generation ?? 0),
    bridgePid: value?.bridgePid ?? null,
    bridgeNonce: value?.bridgeNonce ?? null,
    port,
    status: value?.intentionalStop
      ? "stopped"
      : hostRecoveryBlocked
        ? "host_failed_blocked"
        : recoveryBlocked
          ? "failed"
          : "starting",
    desiredState: value?.intentionalStop ? "stopped" : "ready",
    intentionalStop: Boolean(value?.intentionalStop),
    failureCount: recoveryBlocked ? Number(value?.failureCount ?? MAX_RESTARTS + 1) : 0,
    hostFailureCount: Number(value?.hostFailureCount ?? 0),
    hostRecoveryBlocked,
    readyAt: value?.readyAt ?? null,
    lastError: null,
    consoleTrace: {
      status: "stopped",
      runId: value?.consoleTrace?.runId ?? null,
      helperPid: null,
      sessionId: value?.consoleTrace?.sessionId ?? null,
      startedAt: value?.consoleTrace?.startedAt ?? null,
      recordCount: Number(value?.consoleTrace?.recordCount ?? 0),
      lastRecordAt: value?.consoleTrace?.lastRecordAt ?? null,
      logFile: value?.consoleTrace?.logFile ?? path.join(defaultRuntimeHome(), "runtime", "console-process-attribution.jsonl"),
      lastError: null,
    },
  };
}

async function acquireHostLock(paths, hostId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const handle = await open(paths.lockFile, "wx");
      await handle.writeFile(JSON.stringify({ pid: process.pid, hostId }));
      await handle.close();
      return async () => rm(paths.lockFile, { force: true });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const running = await requestServiceHost(path.dirname(paths.runtimeDir), { command: "ping" }, { timeoutMs: 250 });
        if (running?.hostPid) throw new Error(`md-reader ServiceHost is already running as pid ${running.hostPid}.`);
      } catch (requestError) {
        if (String(requestError?.message).includes("already running")) throw requestError;
      }
      const lock = await readJson(paths.lockFile);
      if (!lock?.pid || !isProcessAlive(lock.pid)) {
        await rm(paths.lockFile, { force: true });
        continue;
      }
      await delay(100);
    }
  }
  throw new Error("Timed out acquiring the md-reader ServiceHost lock.");
}

function isProcessAlive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function captureStream(stream, token, key) {
  stream?.setEncoding("utf8");
  stream?.on("data", (chunk) => {
    token[key] = `${token[key]}${chunk}`.slice(-MAX_CAPTURE_BYTES);
  });
}

async function waitForBridgeReady(record, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const identity = await readBridgeIdentity(record.port, 750);
    if (matchesIdentity(identity, record)) return identity;
    await delay(100);
  }
  return { responding: false, payload: null };
}

function matchesIdentity(identity, record) {
  return identity.responding
    && identity.payload?.serviceId === SERVICE_ID
    && Number(identity.payload?.generation) === Number(record.generation)
    && identity.payload?.nonce === record.bridgeNonce;
}

export async function readBridgeIdentity(port = DEFAULT_PORT, timeoutMs = 1000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      request.destroy();
      resolve(value);
    };
    const request = http.get({ hostname: "127.0.0.1", port, path: "/api/health", timeout: timeoutMs }, (response) => {
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

async function requestBridgeShutdown(port, nonce) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/api/internal/shutdown",
      method: "POST",
      timeout: 1000,
      headers: { "x-md-reader-bridge-nonce": nonce ?? "" },
    }, (response) => {
      response.resume();
      response.on("end", resolve);
    });
    request.on("timeout", () => request.destroy(new Error("shutdown timeout")));
    request.on("error", reject);
    request.end();
  });
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function waitFor(probe, timeoutMs, failureMessage) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = probe();
    if (value) return value;
    await delay(50);
  }
  throw new Error(failureMessage);
}

async function waitForPortRelease(port, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const identity = await readBridgeIdentity(port, 250);
    if (!identity.responding) return true;
    await delay(100);
  }
  return false;
}

async function readJson(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw.trim() ? JSON.parse(raw) : null;
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  await rename(temporaryPath, filePath);
}

function parseArgs(argv) {
  const runtimeIndex = argv.indexOf("--runtime-home");
  const portIndex = argv.indexOf("--port");
  return {
    runtimeHome: runtimeIndex >= 0 ? argv[runtimeIndex + 1] : defaultRuntimeHome(),
    port: portIndex >= 0 ? Number(argv[portIndex + 1]) : DEFAULT_PORT,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runServiceHost(parseArgs(process.argv.slice(2))).catch((error) => {
    if (error instanceof Error && error.message.includes("ServiceHost is already running")) {
      process.exitCode = 0;
      return;
    }
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  });
}
