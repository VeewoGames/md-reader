import { defaultRuntimeHome } from "./server/project-registry.mjs";
import { requestServiceHost } from "./server/service-host-protocol.mjs";

const action = process.argv[2] ?? "status";
const commands = new Map([
  ["start", "console-trace-start"],
  ["status", "console-trace-status"],
  ["stop", "console-trace-stop"],
  ["purge", "console-trace-purge"],
]);

if (!commands.has(action)) {
  process.stderr.write("Usage: npm run console-trace -- <start|status|stop|purge>\n");
  process.exitCode = 1;
} else {
  try {
    const result = await requestServiceHost(defaultRuntimeHome(), { command: commands.get(action) });
    process.stdout.write(`${JSON.stringify(result.consoleTrace, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
