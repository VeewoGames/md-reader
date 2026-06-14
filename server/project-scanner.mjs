import path from "node:path";
import { readdir } from "node:fs/promises";

function isMarkdownFile(fileName) {
  return fileName.endsWith(".md") || fileName.endsWith(".mdx");
}

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
    results.push(path.relative(rootPath, absolutePath).replaceAll("\\", "/"));
  }
}

export async function scanMarkdownTree(projectRoot, contentRoots = ["."]) {
  const root = path.resolve(projectRoot);
  const results = [];

  for (const contentRoot of contentRoots) {
    await walk(root, path.resolve(root, contentRoot), results);
  }

  return results.sort((left, right) => {
    const depthDelta = left.split("/").length - right.split("/").length;
    if (depthDelta !== 0) return depthDelta;
    return left.localeCompare(right);
  });
}
