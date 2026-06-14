import path from "node:path";
import { readFile } from "node:fs/promises";

const TEXT_HTML = "text/html";

export function shouldServeSpaDocument({
  method = "GET",
  pathname = "/",
  accept = "",
}) {
  if (method !== "GET" && method !== "HEAD") return false;
  if (pathname.startsWith("/api/")) return false;
  if (pathname.includes(".", pathname.lastIndexOf("/"))) return false;

  const normalizedAccept = String(accept).toLowerCase();
  return (
    normalizedAccept.includes("text/html") ||
    normalizedAccept.includes("*/*") ||
    normalizedAccept.length === 0
  );
}

export async function createWebUiRuntime({
  mode = "dev",
  projectRoot,
  server,
  distDir = path.join(projectRoot, "dist"),
} = {}) {
  if (mode === "none") {
    return createNoopRuntime();
  }

  if (mode === "static") {
    return createStaticRuntime({ distDir });
  }

  return createViteRuntime({ projectRoot, server });
}

function createNoopRuntime() {
  return {
    mode: "none",
    async handleRequest() {
      return false;
    },
    async close() {},
  };
}

async function createViteRuntime({ projectRoot, server }) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: projectRoot,
    appType: "custom",
    server: {
      middlewareMode: true,
      hmr: { server },
    },
  });
  const indexHtmlPath = path.join(projectRoot, "index.html");

  return {
    mode: "dev",
    async handleRequest(request, response, url) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return false;
      }

      await new Promise((resolve, reject) => {
        vite.middlewares(request, response, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      if (response.writableEnded) {
        return true;
      }

      if (!shouldServeSpaDocument({
        method: request.method,
        pathname: url.pathname,
        accept: request.headers.accept ?? "",
      })) {
        return false;
      }

      const template = await readFile(indexHtmlPath, "utf8");
      const html = await vite.transformIndexHtml(url.pathname, template);
      sendHtml(response, 200, html, request.method);
      return true;
    },
    async close() {
      await vite.close();
    },
  };
}

async function createStaticRuntime({ distDir }) {
  const indexHtmlPath = path.join(distDir, "index.html");

  return {
    mode: "static",
    async handleRequest(request, response, url) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return false;
      }

      const relativePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const candidatePath = path.resolve(distDir, `.${relativePath}`);

      if (candidatePath.startsWith(path.resolve(distDir))) {
        const file = await tryReadFile(candidatePath);
        if (file) {
          sendBuffer(response, 200, file.body, getContentType(candidatePath), request.method);
          return true;
        }
      }

      if (!shouldServeSpaDocument({
        method: request.method,
        pathname: url.pathname,
        accept: request.headers.accept ?? "",
      })) {
        return false;
      }

      const html = await readFile(indexHtmlPath, "utf8");
      sendHtml(response, 200, html, request.method);
      return true;
    },
    async close() {},
  };
}

async function tryReadFile(filePath) {
  try {
    return { body: await readFile(filePath) };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function sendHtml(response, statusCode, html, method = "GET") {
  response.writeHead(statusCode, {
    "content-type": `${TEXT_HTML}; charset=utf-8`,
  });
  if (method === "HEAD") {
    response.end();
    return;
  }
  response.end(html);
}

function sendBuffer(response, statusCode, body, contentType, method = "GET") {
  response.writeHead(statusCode, {
    "content-type": contentType,
  });
  if (method === "HEAD") {
    response.end();
    return;
  }
  response.end(body);
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    case ".html":
    default:
      return `${TEXT_HTML}; charset=utf-8`;
  }
}
