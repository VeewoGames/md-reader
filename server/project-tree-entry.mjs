import path from "node:path";

export function isMarkdownFile(fileName) {
  return String(fileName).endsWith(".md") || String(fileName).endsWith(".mdx");
}

export function normalizeProjectTreeDocumentPath(value) {
  const normalized = String(value ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split("/").includes("..") ||
    !isMarkdownFile(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function createProjectTreeDocumentEntry(normalizedPath, metadata) {
  const path = normalizeProjectTreeDocumentPath(normalizedPath);
  if (!path) throw new Error(`Invalid project tree document path: ${normalizedPath}`);

  const modifiedAtMs = Number(metadata?.mtimeMs);
  if (!Number.isFinite(modifiedAtMs) || modifiedAtMs < 0) {
    throw new Error(`Invalid document modification time: ${normalizedPath}`);
  }
  const birthtimeMs = Number(metadata?.birthtimeMs);
  const createdAtMs = Number.isFinite(birthtimeMs) && birthtimeMs >= 0 ? birthtimeMs : modifiedAtMs;

  return {
    path,
    createdAtMs,
    modifiedAtMs,
    recentAtMs: Math.max(createdAtMs, modifiedAtMs),
  };
}
