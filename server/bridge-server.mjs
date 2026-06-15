import http from "node:http";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import {
  defaultRuntimeHome,
  getProjectById,
  getProjectsSnapshot,
  registerProject,
  setActiveProjectId,
} from "./project-registry.mjs";
import { getProjectProfile, listProjectProfiles, saveProjectProfile } from "./project-profiles.mjs";
import { readMarkdownDocument } from "./project-reader.mjs";
import { DocumentConflictError, writeMarkdownDocument } from "./project-writer.mjs";
import { scanMarkdownTree } from "./project-scanner.mjs";
import { createWebUiRuntime } from "./web-ui.mjs";

const DEFAULT_PORT = 8797;

if (isMainModule()) {
  const options = parseArgs(process.argv.slice(2));
  const server = await startBridgeServer(options);
  process.stdout.write(`md-reader bridge is running at http://127.0.0.1:${options.port}/\n`);
  const shutdown = async () => {
    await stopBridgeServer(server, options);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export async function startBridgeServer({
  port = DEFAULT_PORT,
  runtimeHome = defaultRuntimeHome(),
  stateFile,
  webMode = "dev",
} = {}) {
  await mkdir(runtimeHome, { recursive: true });
  const server = http.createServer();
  const webUiRuntime = await createWebUiRuntime({
    mode: webMode,
    projectRoot: path.dirname(path.dirname(fileURLToPath(import.meta.url))),
    server,
  });
  server.on("request", async (request, response) => {
    try {
      await handleRequest(request, response, { runtimeHome, port, stateFile, server, webUiRuntime });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  const resolvedStateFile = stateFile ?? path.join(runtimeHome, "runtime", "service-state.json");
  await mkdir(path.dirname(resolvedStateFile), { recursive: true });
  await writeFile(
    resolvedStateFile,
    JSON.stringify(
      {
        pid: process.pid,
        port,
        runtimeHome,
        startedAt: new Date().toISOString(),
        webMode,
      },
      null,
      2,
    ),
  );

  server.__mdReaderWebUiRuntime = webUiRuntime;
  server.__mdReaderWebMode = webUiRuntime.mode ?? webMode;
  return server;
}

export async function stopBridgeServer(server, { stateFile, runtimeHome = defaultRuntimeHome() } = {}) {
  await server.__mdReaderWebUiRuntime?.close?.();
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const resolvedStateFile = stateFile ?? path.join(runtimeHome, "runtime", "service-state.json");
  try {
    await writeFile(resolvedStateFile, "");
  } catch {
    // ignore closeout cleanup failures
  }
}

async function handleRequest(request, response, { runtimeHome, port, stateFile, server, webUiRuntime }) {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);

  setCorsHeaders(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    const snapshot = await getProjectsSnapshot(runtimeHome, "default");
    sendJson(response, 200, {
      ok: true,
      mode: "local-service",
      projectsLoaded: snapshot.projects.length,
      port,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/service/stop") {
    sendJson(response, 200, { ok: true });
    queueBridgeShutdown({ server, port, runtimeHome, stateFile });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/service/restart") {
    sendJson(response, 200, { ok: true });
    queueBridgeRestart({ server, port, runtimeHome, stateFile });
    return;
  }

  const profileProjectsMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)\/projects$/);
  if (request.method === "GET" && profileProjectsMatch) {
    const profileId = decodeURIComponent(profileProjectsMatch[1]);
    sendJson(response, 200, await getProjectsSnapshot(runtimeHome, profileId));
    return;
  }

  const registerMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)\/projects\/register$/);
  if (request.method === "POST" && registerMatch) {
    const profileId = decodeURIComponent(registerMatch[1]);
    const body = await readJsonBody(request);
    const project = await registerProject({
      runtimeHome,
      profileId,
      rootPath: body.rootPath,
    });
    sendJson(response, 200, { project });
    return;
  }

  const activeMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)\/projects\/active$/);
  if (request.method === "POST" && activeMatch) {
    const profileId = decodeURIComponent(activeMatch[1]);
    const body = await readJsonBody(request);
    await setActiveProjectId(runtimeHome, profileId, body.projectId);
    sendJson(response, 200, { ok: true });
    return;
  }

  const treeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tree$/);
  if (request.method === "GET" && treeMatch) {
    const profileId = url.searchParams.get("profileId") ?? "default";
    const projectId = decodeURIComponent(treeMatch[1]);
    const project = await getProjectById(runtimeHome, profileId, projectId);
    if (!project) {
      sendJson(response, 404, { error: `Unknown project: ${projectId}` });
      return;
    }
    const paths = await scanMarkdownTree(project.rootPath, project.contentRoots);
    sendJson(response, 200, { paths });
    return;
  }

  const profilesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/profiles$/);
  if (request.method === "GET" && profilesMatch) {
    const registryProfileId = url.searchParams.get("profileId") ?? "default";
    const projectId = decodeURIComponent(profilesMatch[1]);
    const project = await getProjectById(runtimeHome, registryProfileId, projectId);
    if (!project) {
      sendJson(response, 404, { error: `Unknown project: ${projectId}` });
      return;
    }

    sendJson(response, 200, {
      profileIds: await listProjectProfiles(project.rootPath),
    });
    return;
  }

  const profileMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/profile$/);
  if (request.method === "GET" && profileMatch) {
    const registryProfileId = url.searchParams.get("registryProfileId") ?? "default";
    const targetProfileId = url.searchParams.get("profileId") ?? "default";
    const projectId = decodeURIComponent(profileMatch[1]);
    const project = await getProjectById(runtimeHome, registryProfileId, projectId);
    if (!project) {
      sendJson(response, 404, { error: `Unknown project: ${projectId}` });
      return;
    }

    sendJson(response, 200, {
      profile: await getProjectProfile(project.rootPath, targetProfileId),
    });
    return;
  }

  if (request.method === "POST" && profileMatch) {
    const registryProfileId = url.searchParams.get("registryProfileId") ?? "default";
    const projectId = decodeURIComponent(profileMatch[1]);
    const project = await getProjectById(runtimeHome, registryProfileId, projectId);
    if (!project) {
      sendJson(response, 404, { error: `Unknown project: ${projectId}` });
      return;
    }

    const body = await readJsonBody(request);
    sendJson(response, 200, {
      profile: await saveProjectProfile(project.rootPath, body.profile ?? body),
    });
    return;
  }

  const documentMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/document$/);
  if (request.method === "GET" && documentMatch) {
    const profileId = url.searchParams.get("profileId") ?? "default";
    const projectId = decodeURIComponent(documentMatch[1]);
    const documentPath = url.searchParams.get("path") ?? "";
    const project = await getProjectById(runtimeHome, profileId, projectId);
    if (!project) {
      sendJson(response, 404, { error: `Unknown project: ${projectId}` });
      return;
    }

    const document = await readMarkdownDocument(project.rootPath, project.contentRoots, documentPath);
    sendJson(response, 200, document);
    return;
  }

  if (request.method === "POST" && documentMatch) {
    const profileId = url.searchParams.get("profileId") ?? "default";
    const projectId = decodeURIComponent(documentMatch[1]);
    const project = await getProjectById(runtimeHome, profileId, projectId);
    if (!project) {
      sendJson(response, 404, { error: `Unknown project: ${projectId}` });
      return;
    }

    const body = await readJsonBody(request);

    try {
      const document = await writeMarkdownDocument(
        project.rootPath,
        project.contentRoots,
        body.path ?? "",
        body.content ?? "",
        body.expectedMtimeMs,
        body.expectedContentHash ?? null,
      );
      sendJson(response, 200, document);
    } catch (error) {
      if (error instanceof DocumentConflictError) {
        sendJson(response, 409, {
          error: error.message,
          code: "DOCUMENT_CONFLICT",
          conflictKind: error.kind,
          path: error.path,
          currentMtimeMs: error.currentMtimeMs,
          currentContentHash: error.currentContentHash,
        });
        return;
      }

      throw error;
    }
    return;
  }

  if (await webUiRuntime.handleRequest(request, response, url)) {
    return;
  }

  sendJson(response, 404, { error: `Unknown route: ${request.method} ${url.pathname}` });
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function setCorsHeaders(response) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function parseArgs(argv) {
  return {
    port: Number(readOption(argv, "--port") ?? DEFAULT_PORT),
    runtimeHome: readOption(argv, "--runtime-home") ?? defaultRuntimeHome(),
    stateFile: readOption(argv, "--state-file") ?? undefined,
    webMode: readOption(argv, "--web-mode") ?? "dev",
  };
}

function readOption(argv, name) {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === name) return argv[index + 1] ?? "";
    if (token.startsWith(`${name}=`)) return token.slice(name.length + 1);
  }
  return null;
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function queueBridgeShutdown({ server, runtimeHome, stateFile, port }) {
  setTimeout(async () => {
    await stopBridgeServer(server, { runtimeHome, stateFile });
    process.exit(0);
  }, 0);
}

function queueBridgeRestart({ server, runtimeHome, stateFile, port }) {
  setTimeout(async () => {
    const webMode = server.__mdReaderWebMode ?? "dev";
    await stopBridgeServer(server, { runtimeHome, stateFile });
    const args = [
      fileURLToPath(import.meta.url),
      "--port",
      String(port),
      "--runtime-home",
      runtimeHome,
      "--web-mode",
      webMode,
    ];

    if (stateFile) {
      args.push("--state-file", stateFile);
    }

    const child = spawn(process.execPath, args, {
      cwd: path.dirname(fileURLToPath(import.meta.url)),
      detached: true,
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    process.exit(0);
  }, 0);
}
