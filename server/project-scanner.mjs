import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { createProjectTreeDocumentEntry, isMarkdownFile } from "./project-tree-entry.mjs";

export { isMarkdownFile };

function shouldSkipDirectory(name) {
  return name === ".git" || name === "node_modules" || name === ".md-reader";
}

async function walk(rootPath, currentPath, results) {
  const entries = await readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) continue;
      await walk(rootPath, path.join(currentPath, entry.name), results);
      continue;
    }

    if (!entry.isFile() || !isMarkdownFile(entry.name)) {
      continue;
    }

    const absolutePath = path.join(currentPath, entry.name);
    results.push(createProjectTreeDocumentEntry(
      path.relative(rootPath, absolutePath).replaceAll("\\", "/"),
      await stat(absolutePath),
    ));
  }
}

export async function scanMarkdownTree(projectRoot, contentRoots = ["."]) {
  const root = path.resolve(projectRoot);
  const results = [];

  for (const contentRoot of contentRoots) {
    await walk(root, path.resolve(root, contentRoot), results);
  }

  return results.sort((left, right) => {
    const depthDelta = left.path.split("/").length - right.path.split("/").length;
    if (depthDelta !== 0) return depthDelta;
    return left.path.localeCompare(right.path);
  });
}
