import { readFile, stat, writeFile } from "node:fs/promises";

import { createContentHash } from "./content-hash.mjs";
import { resolveMarkdownDocumentPath } from "./project-reader.mjs";

export class DocumentConflictError extends Error {
  constructor({ message, kind = "unknown", path, currentMtimeMs = null, currentContentHash = null }) {
    super(message);
    this.name = "DocumentConflictError";
    this.kind = kind;
    this.path = path;
    this.currentMtimeMs = currentMtimeMs;
    this.currentContentHash = currentContentHash;
  }
}

export async function writeMarkdownDocument(
  projectRoot,
  contentRoots = ["."],
  documentPath,
  content,
  expectedMtimeMs,
  expectedContentHash = null,
) {
  const { normalizedPath, resolvedDocumentPath } = resolveMarkdownDocumentPath(
    projectRoot,
    contentRoots,
    documentPath,
  );
  const currentMetadata = await stat(resolvedDocumentPath);
  let currentContentHash = null;

  if (
    expectedMtimeMs != null &&
    Number.isFinite(expectedMtimeMs) &&
    currentMetadata.mtimeMs !== expectedMtimeMs
  ) {
    const currentContent = await readFile(resolvedDocumentPath, "utf8");
    currentContentHash = createContentHash(currentContent);

    if (!expectedContentHash || currentContentHash !== expectedContentHash) {
      throw new DocumentConflictError({
        message: `Document has changed on disk: ${normalizedPath}`,
        kind: "content-changed",
        path: normalizedPath,
        currentMtimeMs: currentMetadata.mtimeMs,
        currentContentHash,
      });
    }
  }

  const nextContent = String(content ?? "");
  await writeFile(resolvedDocumentPath, nextContent, "utf8");
  const nextMetadata = await stat(resolvedDocumentPath);

  return {
    path: normalizedPath,
    content: nextContent,
    mtimeMs: nextMetadata.mtimeMs,
    size: nextMetadata.size,
  };
}
