import { defaultRuntimeHome } from "./server/project-registry.mjs";
import { stopService } from "./service-lifecycle.mjs";

try {
  const result = await stopService(defaultRuntimeHome());
  const stream = result.ok ? process.stdout : process.stderr;
  stream.write(`${result.message}\n`);
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
