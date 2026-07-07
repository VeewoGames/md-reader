import path from "node:path";
import {
  copyFile,
  mkdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";

import { resolveMarkdownDocumentPath } from "./project-reader.mjs";

export async function createDocumentNode(projectRoot, contentRoots = ["."], documentPath, content = "") {
  const { normalizedPath, resolvedDocumentPath } = resolveMarkdownDocumentPath(
    projectRoot,
    contentRoots,
    documentPath,
  );

  await ensurePathDoesNotExist(resolvedDocumentPath, normalizedPath);
  await mkdir(path.dirname(resolvedDocumentPath), { recursive: true });
  await writeFile(resolvedDocumentPath, String(content ?? ""), "utf8");

  return readDocumentMetadata(normalizedPath, resolvedDocumentPath);
}

export async function createDirectoryNode(projectRoot, contentRoots = ["."], directoryPath) {
  const { normalizedPath, resolvedDirectoryPath } = resolveDirectoryNodePath(
    projectRoot,
    contentRoots,
    directoryPath,
  );

  await ensurePathDoesNotExist(resolvedDirectoryPath, normalizedPath);
  await mkdir(resolvedDirectoryPath, { recursive: true });

  return {
    path: normalizedPath,
  };
}

export async function duplicateDocumentNode(
  projectRoot,
  contentRoots = ["."],
  sourceDocumentPath,
  targetDocumentPath,
) {
  const source = resolveMarkdownDocumentPath(projectRoot, contentRoots, sourceDocumentPath);
  const target = resolveMarkdownDocumentPath(projectRoot, contentRoots, targetDocumentPath);

  await ensureDocumentExists(source.resolvedDocumentPath, source.normalizedPath);
  await ensurePathDoesNotExist(target.resolvedDocumentPath, target.normalizedPath);
  await mkdir(path.dirname(target.resolvedDocumentPath), { recursive: true });
  await copyFile(source.resolvedDocumentPath, target.resolvedDocumentPath);

  return readDocumentMetadata(target.normalizedPath, target.resolvedDocumentPath);
}

export async function moveDocumentNode(
  projectRoot,
  contentRoots = ["."],
  sourceDocumentPath,
  targetDocumentPath,
) {
  const source = resolveMarkdownDocumentPath(projectRoot, contentRoots, sourceDocumentPath);
  const target = resolveMarkdownDocumentPath(projectRoot, contentRoots, targetDocumentPath);

  await ensureDocumentExists(source.resolvedDocumentPath, source.normalizedPath);
  await ensurePathDoesNotExist(target.resolvedDocumentPath, target.normalizedPath);
  await mkdir(path.dirname(target.resolvedDocumentPath), { recursive: true });
  await rename(source.resolvedDocumentPath, target.resolvedDocumentPath);

  return readDocumentMetadata(target.normalizedPath, target.resolvedDocumentPath);
}

export async function renameDocumentNode(
  projectRoot,
  contentRoots = ["."],
  sourceDocumentPath,
  nextName,
) {
  const source = resolveMarkdownDocumentPath(projectRoot, contentRoots, sourceDocumentPath);
  const sanitizedName = normalizeNodeName(nextName, "Document name is required.");
  const targetPath = path.posix.join(path.posix.dirname(source.normalizedPath), sanitizedName);

  return moveDocumentNode(projectRoot, contentRoots, source.normalizedPath, targetPath);
}

export async function deleteDocumentNode(projectRoot, contentRoots = ["."], documentPath) {
  const { normalizedPath, resolvedDocumentPath } = resolveMarkdownDocumentPath(
    projectRoot,
    contentRoots,
    documentPath,
  );

  await ensureDocumentExists(resolvedDocumentPath, normalizedPath);
  await unlink(resolvedDocumentPath);

  return {
    path: normalizedPath,
  };
}

function resolveDirectoryNodePath(projectRoot, contentRoots = ["."], directoryPath) {
  const normalizedPath = normalizeNodeRelativePath(directoryPath, "Directory path is required.");
  const root = path.resolve(projectRoot);
  const resolvedDirectoryPath = path.resolve(root, normalizedPath);
  const allowedRoots = contentRoots.map((contentRoot) => path.resolve(root, contentRoot));

  const isAllowed = allowedRoots.some(
    (allowedRoot) =>
      resolvedDirectoryPath === allowedRoot ||
      resolvedDirectoryPath.startsWith(`${allowedRoot}${path.sep}`),
  );

  if (!isAllowed) {
    throw new Error(`Directory path is outside allowed content roots: ${directoryPath}`);
  }

  return {
    normalizedPath,
    resolvedDirectoryPath,
  };
}

function normalizeNodeRelativePath(nodePath, requiredMessage) {
  const rawPath = String(nodePath ?? "").trim();
  if (!rawPath) {
    throw new Error(requiredMessage);
  }

  const normalized = rawPath.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) {
    throw new Error(`Absolute paths are not allowed: ${nodePath}`);
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new Error(`Parent directory traversal is not allowed: ${nodePath}`);
  }

  return normalized;
}

function normalizeNodeName(name, requiredMessage) {
  const normalized = String(name ?? "").trim();
  if (!normalized) {
    throw new Error(requiredMessage);
  }
  if (normalized.includes("/") || normalized.includes("\\") || normalized === "." || normalized === "..") {
    throw new Error(`Invalid node name: ${name}`);
  }
  return normalized;
}

async function ensurePathDoesNotExist(resolvedPath, normalizedPath) {
  try {
    await stat(resolvedPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }

  throw new Error(`Target already exists: ${normalizedPath}`);
}

async function ensureDocumentExists(resolvedPath, normalizedPath) {
  let metadata;
  try {
    metadata = await stat(resolvedPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Document not found: ${normalizedPath}`);
    }
    throw error;
  }

  if (!metadata.isFile()) {
    throw new Error(`Document path is not a file: ${normalizedPath}`);
  }
}

async function readDocumentMetadata(normalizedPath, resolvedDocumentPath) {
  const metadata = await stat(resolvedDocumentPath);
  return {
    path: normalizedPath,
    mtimeMs: metadata.mtimeMs,
    size: metadata.size,
  };
}
