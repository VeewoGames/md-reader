import { defaultRuntimeHome } from "./server/project-registry.mjs";
import { ensureServiceRunning } from "./service-lifecycle.mjs";

try {
  const result = await ensureServiceRunning({
    runtimeHome: defaultRuntimeHome(),
  });
  const state = result.alreadyRunning ? "already running" : "started";
  process.stdout.write(
    `md-reader local workspace ${state} at http://127.0.0.1:${result.port}/ (health: http://127.0.0.1:${result.port}/api/health)\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
