import { spawn } from "node:child_process";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { defaultRuntimeHome } from "./server/project-registry.mjs";

const execFileAsync = promisify(execFile);
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 8797;

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
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function clearServiceState(runtimeHome = defaultRuntimeHome()) {
  const { stateFile } = getRuntimePaths(runtimeHome);
  await rm(stateFile, { force: true });
}

export async function isPortResponding(port, requestPath = "/api/health") {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: requestPath,
        timeout: 1000,
      },
      (response) => {
        response.resume();
        resolve((response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 500);
      },
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

export async function ensureServiceRunning({ runtimeHome = defaultRuntimeHome(), port = DEFAULT_PORT } = {}) {
  const existing = await loadServiceState(runtimeHome);
  if (existing?.pid && (await isServiceProcess(existing.pid, existing)) && (await isPortResponding(existing.port ?? port))) {
    return {
      alreadyRunning: true,
      port: existing.port ?? port,
      pid: existing.pid,
    };
  }

  if (existing) {
    await clearServiceState(runtimeHome);
  }

  const { runtimeDir, stateFile } = getRuntimePaths(runtimeHome);
  await mkdir(runtimeDir, { recursive: true });
  const child = spawn(
    process.execPath,
    [
      "server/bridge-server.mjs",
      "--port",
      String(port),
      "--runtime-home",
      runtimeHome,
      "--state-file",
      stateFile,
      "--web-mode",
      "dev",
    ],
    {
      cwd: scriptRoot,
      detached: true,
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  child.unref();
  await waitForServiceReady(port);
  await writeFile(
    stateFile,
    JSON.stringify(
      {
        pid: child.pid,
        port,
        runtimeHome,
        script: "server/bridge-server.mjs",
        webMode: "dev",
      },
      null,
      2,
    ),
  );
  return {
    alreadyRunning: false,
    port,
    pid: child.pid,
  };
}

export async function stopService(runtimeHome = defaultRuntimeHome()) {
  const state = await loadServiceState(runtimeHome);
  if (!state?.pid) {
    return { ok: true, message: "No running md-reader service state was found." };
  }

  if (!(await isServiceProcess(state.pid, state))) {
    return { ok: false, message: `Refusing to stop pid ${state.pid} because it is not the recorded md-reader service.` };
  }

  if (process.platform === "win32") {
    await execFileAsync("taskkill.exe", ["/PID", String(state.pid), "/T", "/F"], { windowsHide: true });
  } else {
    process.kill(state.pid, "SIGTERM");
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    if (!(await isPortResponding(state.port ?? DEFAULT_PORT))) {
      await clearServiceState(runtimeHome);
      return { ok: true, message: `Stopped md-reader service pid ${state.pid}.` };
    }
    await delay(100);
  }

  return { ok: false, message: `Timed out waiting for md-reader pid ${state.pid} to exit.` };
}

export async function readServiceHealth(port = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${port}/api/health`, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if ((response.statusCode ?? 0) >= 400) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        resolve(JSON.parse(body));
      });
    });
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error("timeout")));
  });
}

async function waitForServiceReady(port, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortResponding(port)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for md-reader service to start on port ${port}.`);
}

async function isServiceProcess(pid, state) {
  const processInfo = await inspectProcess(pid);
  if (!processInfo) return false;
  const commandLine = String(processInfo.commandLine ?? processInfo.CommandLine ?? "").toLowerCase().replaceAll("\\", "/");
  return commandLine.includes("server/bridge-server.mjs") && commandLine.includes(`--port ${String(state.port ?? DEFAULT_PORT)}`);
}

async function inspectProcess(pid) {
  if (process.platform === "win32") {
    const psCommand = [
      `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"`,
      "if (-not $p) { exit 0 }",
      "$p | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress",
    ].join("; ");
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], {
      windowsHide: true,
    });
    const trimmed = stdout.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed);
  }

  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "command="]);
    const commandLine = stdout.trim();
    if (!commandLine) return null;
    return { ProcessId: pid, commandLine };
  } catch {
    return null;
  }
}
