import { readServiceHealth } from "./service-lifecycle.mjs";

try {
  const health = await readServiceHealth();
  process.stdout.write(`${JSON.stringify(health, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
