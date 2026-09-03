import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

import { defaultRuntimeHome } from "./server/project-registry.mjs";
import { requestServiceHost } from "./server/service-host-protocol.mjs";
import { stopService } from "./service-lifecycle.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const TASK_NAME = "md-reader\\ServiceHost";

export function buildTaskXml({
  scriptHostPath = path.join(process.env.WINDIR ?? "C:\\Windows", "System32", "wscript.exe"),
  launcherPath = path.join(projectRoot, "server", "service-host-launcher.vbs"),
  nodePath = process.execPath,
  hostPath = path.join(projectRoot, "server", "service-host.mjs"),
  runtimeHome = defaultRuntimeHome(),
  workingDirectory = projectRoot,
  userId = process.env.USERDOMAIN && process.env.USERNAME
    ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
    : process.env.USERNAME,
} = {}) {
  const launcherArguments = [launcherPath, nodePath, hostPath, "--runtime-home", runtimeHome, "--port", "8797"]
    .map((argument) => `&quot;${xmlEscape(argument)}&quot;`)
    .join(" ");
  const argumentsText = `//B //NoLogo ${launcherArguments}`;
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Supervises the local md-reader bridge for the signed-in user.</Description></RegistrationInfo>
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled><UserId>${xmlEscape(userId ?? "")}</UserId></LogonTrigger>
    <TimeTrigger><Repetition><Interval>PT1M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>2000-01-01T00:00:00</StartBoundary><Enabled>true</Enabled></TimeTrigger>
  </Triggers>
  <Principals><Principal id="Author"><UserId>${xmlEscape(userId ?? "")}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure>
  </Settings>
  <Actions Context="Author"><Exec><Command>${xmlEscape(scriptHostPath)}</Command><Arguments>${argumentsText}</Arguments><WorkingDirectory>${xmlEscape(workingDirectory)}</WorkingDirectory></Exec></Actions>
</Task>`;
}

export async function installServiceTask(runtimeHome = defaultRuntimeHome()) {
  if (process.platform !== "win32") throw new Error("Task Scheduler integration is only supported on Windows.");
  await access(path.join(projectRoot, "server", "service-host-launcher.vbs"));
  const host = await requestServiceHost(runtimeHome, { command: "health" }, { timeoutMs: 3000 });
  if (host.status !== "ready") throw new Error("Refusing to install the task before ServiceHost is ready.");
  const runtimeDir = path.join(runtimeHome, "runtime");
  await mkdir(runtimeDir, { recursive: true });
  const taskFile = path.join(runtimeDir, "service-host-task.xml");
  await writeFile(taskFile, `\ufeff${buildTaskXml({ runtimeHome })}`, "utf16le");
  try {
    await execFileAsync("schtasks.exe", ["/Create", "/TN", TASK_NAME, "/XML", taskFile, "/F"], { windowsHide: true });
  } finally {
    await rm(taskFile, { force: true });
  }
  return queryServiceTask();
}

export async function queryServiceTask() {
  try {
    const { stdout } = await execFileAsync("schtasks.exe", ["/Query", "/TN", TASK_NAME, "/FO", "LIST", "/V"], { windowsHide: true });
    return { installed: true, taskName: TASK_NAME, details: stdout.trim() };
  } catch (error) {
    if (error?.code === 1) return { installed: false, taskName: TASK_NAME };
    throw error;
  }
}

export async function uninstallServiceTask(runtimeHome = defaultRuntimeHome()) {
  const stopped = await stopService(runtimeHome);
  if (!stopped.ok) throw new Error(stopped.message);
  try {
    await execFileAsync("schtasks.exe", ["/Delete", "/TN", TASK_NAME, "/F"], { windowsHide: true });
  } catch (error) {
    if (error?.code !== 1) throw error;
  }
  let shutdownRequested = false;
  try {
    await requestServiceHost(runtimeHome, { command: "shutdown-host" }, { timeoutMs: 10000 });
    shutdownRequested = true;
  } catch {
    // A fallback stop may already have established that no host exists.
    await removeStaleHostLock(runtimeHome);
  }
  if (shutdownRequested) await waitForHostShutdown(runtimeHome, 10000);
  return { installed: false, taskName: TASK_NAME };
}

async function removeStaleHostLock(runtimeHome) {
  const lockFile = path.join(runtimeHome, "runtime", "service-host.lock.json");
  try {
    const lock = JSON.parse(await readFile(lockFile, "utf8"));
    if (lock?.pid && isProcessAlive(lock.pid)) {
      throw new Error(`ServiceHost pid ${lock.pid} is still alive after its control channel disappeared.`);
    }
    await rm(lockFile, { force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForHostShutdown(runtimeHome, timeoutMs) {
  const lockFile = path.join(runtimeHome, "runtime", "service-host.lock.json");
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    let hostResponding = true;
    let lockExists = true;
    try {
      await requestServiceHost(runtimeHome, { command: "ping" }, { timeoutMs: 250 });
    } catch {
      hostResponding = false;
    }
    try {
      await access(lockFile);
    } catch {
      lockExists = false;
    }
    if (!hostResponding && !lockExists) return;
    await delay(100);
  }
  throw new Error("Timed out waiting for md-reader ServiceHost and its lock to exit during uninstall.");
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function main(argv) {
  const command = argv[0] ?? "status";
  const result = command === "install"
    ? await installServiceTask()
    : command === "uninstall"
      ? await uninstallServiceTask()
      : await queryServiceTask();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
