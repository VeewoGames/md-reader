import crypto from "node:crypto";
import net from "node:net";

const DEFAULT_TIMEOUT_MS = 3000;

export function getServiceHostPipeName(runtimeHome) {
  const suffix = crypto.createHash("sha256").update(String(runtimeHome)).digest("hex").slice(0, 16);
  return process.platform === "win32"
    ? `\\\\.\\pipe\\md-reader-host-${suffix}`
    : `${runtimeHome}/runtime/service-host.sock`;
}

export async function requestServiceHost(runtimeHome, command, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pipeName = getServiceHostPipeName(runtimeHome);

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(pipeName);
    let settled = false;
    let responseText = "";
    const timer = setTimeout(() => finish(new Error(`Timed out waiting for md-reader ServiceHost after ${timeoutMs}ms.`)), timeoutMs);

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    }

    socket.setEncoding("utf8");
    socket.once("connect", () => {
      socket.write(`${JSON.stringify(command)}\n`);
    });
    socket.on("data", (chunk) => {
      responseText += chunk;
      const newlineIndex = responseText.indexOf("\n");
      if (newlineIndex < 0) return;
      try {
        const response = JSON.parse(responseText.slice(0, newlineIndex));
        if (!response.ok) {
          finish(new Error(response.error ?? "md-reader ServiceHost request failed."));
          return;
        }
        finish(null, response.result);
      } catch (error) {
        finish(error);
      }
    });
    socket.once("error", (error) => finish(error));
    socket.once("end", () => {
      if (!settled) finish(new Error("md-reader ServiceHost closed the control connection without a response."));
    });
  });
}
