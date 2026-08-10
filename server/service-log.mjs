import path from "node:path";
import { appendFile, mkdir } from "node:fs/promises";

export function getServiceLogPath(runtimeHome) {
  return path.join(runtimeHome, "runtime", "bridge-service.log.jsonl");
}

export async function appendServiceLog(runtimeHome, event, details = {}) {
  try {
    const logPath = getServiceLogPath(runtimeHome);
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(logPath, `${JSON.stringify({ at: new Date().toISOString(), event, ...details })}\n`, "utf8");
  } catch {
    // Observability must never make the local service unavailable.
  }
}
