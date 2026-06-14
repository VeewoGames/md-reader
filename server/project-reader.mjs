import path from "node:path";
import { readFile, stat } from "node:fs/promises";

export async function readMarkdownDocument(projectRoot, contentRoots = ["."], documentPath) {
  const { normalizedPath, resolvedDocumentPath } = resolveMarkdownDocumentPath(
    projectRoot,
    contentRoots,
    documentPath,
  );
  const content = await readFile(resolvedDocumentPath, "utf8");
  const metadata = await stat(resolvedDocumentPath);

  return {
    path: normalizedPath,
    content,
    mtimeMs: metadata.mtimeMs,
    size: metadata.size,
  };
}

export function resolveMarkdownDocumentPath(projectRoot, contentRoots = ["."], documentPath) {
  const normalizedPath = normalizeDocumentPath(documentPath);

  if (!normalizedPath) {
    throw new Error("Document path is required.");
  }

  const root = path.resolve(projectRoot);
  const resolvedDocumentPath = path.resolve(root, normalizedPath);
  const allowedRoots = contentRoots.map((contentRoot) => path.resolve(root, contentRoot));

  const isAllowed = allowedRoots.some(
    (allowedRoot) =>
      resolvedDocumentPath === allowedRoot ||
      resolvedDocumentPath.startsWith(`${allowedRoot}${path.sep}`),
  );

  if (!isAllowed) {
    throw new Error(`Document path is outside allowed content roots: ${documentPath}`);
  }

  return {
    normalizedPath,
    resolvedDocumentPath,
  };
}

function normalizeDocumentPath(documentPath) {
  const rawPath = String(documentPath ?? "").trim();
  if (!rawPath) return "";

  const normalized = rawPath.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) {
    throw new Error(`Absolute document paths are not allowed: ${documentPath}`);
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new Error(`Parent directory traversal is not allowed: ${documentPath}`);
  }

  return normalized;
}
