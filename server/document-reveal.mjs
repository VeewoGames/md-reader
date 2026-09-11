import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

import { resolveMarkdownDocumentPath } from './project-reader.mjs';

export async function revealMarkdownDocumentInExplorer(projectRoot, contentRoots, documentPath, options = {}) {
  if ((options.platform ?? process.platform) !== 'win32') {
    const error = new Error('Document reveal is only supported on Windows.');
    error.code = 'DOCUMENT_REVEAL_UNSUPPORTED';
    throw error;
  }

  const { normalizedPath, resolvedDocumentPath } = resolveMarkdownDocumentPath(projectRoot, contentRoots, documentPath);
  const metadata = await stat(resolvedDocumentPath);
  if (!metadata.isFile()) {
    const error = new Error(`Document is not a file: ${normalizedPath}`);
    error.code = 'DOCUMENT_REVEAL_NOT_FOUND';
    throw error;
  }

  const spawnImpl = options.spawnImpl ?? spawn;
  await new Promise((resolve, reject) => {
    const child = spawnImpl('explorer.exe', [`/e,/select,${resolvedDocumentPath}`], { shell: false, windowsHide: false, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', resolve);
  });
  return { path: normalizedPath, revealed: true };
}
