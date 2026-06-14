import path from 'node:path'
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { createContentHash } from '../../server/content-hash.mjs'
import { writeMarkdownDocument } from '../../server/project-writer.mjs'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('project writer', () => {
  it('allows saving when only mtime changed but content hash stays the same', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-write-'))
    tempDirs.push(projectRoot)

    const docsDir = path.join(projectRoot, 'docs')
    const documentFile = path.join(docsDir, 'README.md')
    await mkdir(docsDir, { recursive: true })
    await writeFile(documentFile, '# Hello')

    const initialStats = await stat(documentFile)
    await utimes(documentFile, new Date(initialStats.atimeMs), new Date(initialStats.mtimeMs + 5000))

    const document = await writeMarkdownDocument(
      projectRoot,
      ['docs'],
      'docs/README.md',
      '# Updated',
      initialStats.mtimeMs,
      createContentHash('# Hello'),
    )

    expect(document.content).toBe('# Updated')
    expect(document.path).toBe('docs/README.md')
  })

  it('throws a structured conflict when content changed on disk', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-write-'))
    tempDirs.push(projectRoot)

    const docsDir = path.join(projectRoot, 'docs')
    const documentFile = path.join(docsDir, 'README.md')
    await mkdir(docsDir, { recursive: true })
    await writeFile(documentFile, '# Before')

    const initialStats = await stat(documentFile)
    await writeFile(documentFile, '# After')
    await utimes(documentFile, new Date(initialStats.atimeMs), new Date(initialStats.mtimeMs + 5000))

    await expect(
      writeMarkdownDocument(
        projectRoot,
        ['docs'],
        'docs/README.md',
        '# Updated',
        initialStats.mtimeMs,
        createContentHash('# Before'),
      ),
    ).rejects.toMatchObject({
      name: 'DocumentConflictError',
      kind: 'content-changed',
      path: 'docs/README.md',
    })
  })
})
