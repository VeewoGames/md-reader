import path from 'node:path'
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createDirectoryNode,
  createDocumentNode,
  deleteDocumentNode,
  duplicateDocumentNode,
  moveDocumentNode,
  renameDocumentNode,
} from '../../server/project-node-operations.mjs'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('project node operations', () => {
  it('creates a markdown document inside the allowed content root', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-node-'))
    tempDirs.push(projectRoot)

    await mkdir(path.join(projectRoot, 'docs'), { recursive: true })

    const created = await createDocumentNode(projectRoot, ['docs'], 'docs/guides/intro.md', '# Intro')

    expect(created.path).toBe('docs/guides/intro.md')
    expect(created.size).toBe(Buffer.byteLength('# Intro'))
    await expect(readFile(path.join(projectRoot, 'docs', 'guides', 'intro.md'), 'utf8')).resolves.toBe(
      '# Intro',
    )
  })

  it('creates a directory inside the allowed content root', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-node-'))
    tempDirs.push(projectRoot)

    await mkdir(path.join(projectRoot, 'docs'), { recursive: true })

    const created = await createDirectoryNode(projectRoot, ['docs'], 'docs/guides')

    expect(created.path).toBe('docs/guides')
    await expect(stat(path.join(projectRoot, 'docs', 'guides'))).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    })
  })

  it('duplicates a markdown document into a new target path', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-node-'))
    tempDirs.push(projectRoot)

    await mkdir(path.join(projectRoot, 'docs'), { recursive: true })
    await writeFile(path.join(projectRoot, 'docs', 'guide.md'), '# Guide')

    const duplicated = await duplicateDocumentNode(
      projectRoot,
      ['docs'],
      'docs/guide.md',
      'docs/guide-copy.md',
    )

    expect(duplicated.path).toBe('docs/guide-copy.md')
    await expect(readFile(path.join(projectRoot, 'docs', 'guide-copy.md'), 'utf8')).resolves.toBe('# Guide')
  })

  it('moves a markdown document into another allowed folder', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-node-'))
    tempDirs.push(projectRoot)

    await mkdir(path.join(projectRoot, 'docs', 'drafts'), { recursive: true })
    await mkdir(path.join(projectRoot, 'docs', 'archive'), { recursive: true })
    await writeFile(path.join(projectRoot, 'docs', 'drafts', 'guide.md'), '# Guide')

    const moved = await moveDocumentNode(
      projectRoot,
      ['docs'],
      'docs/drafts/guide.md',
      'docs/archive/guide.md',
    )

    expect(moved.path).toBe('docs/archive/guide.md')
    await expect(readFile(path.join(projectRoot, 'docs', 'archive', 'guide.md'), 'utf8')).resolves.toBe(
      '# Guide',
    )
    await expect(access(path.join(projectRoot, 'docs', 'drafts', 'guide.md'))).rejects.toBeTruthy()
  })

  it('renames a markdown document within the same allowed folder', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-node-'))
    tempDirs.push(projectRoot)

    await mkdir(path.join(projectRoot, 'docs'), { recursive: true })
    await writeFile(path.join(projectRoot, 'docs', 'guide.md'), '# Guide')

    const renamed = await renameDocumentNode(projectRoot, ['docs'], 'docs/guide.md', 'guide-v2.md')

    expect(renamed.path).toBe('docs/guide-v2.md')
    await expect(readFile(path.join(projectRoot, 'docs', 'guide-v2.md'), 'utf8')).resolves.toBe('# Guide')
  })

  it('deletes a markdown document from the allowed content root', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-node-'))
    tempDirs.push(projectRoot)

    await mkdir(path.join(projectRoot, 'docs'), { recursive: true })
    await writeFile(path.join(projectRoot, 'docs', 'guide.md'), '# Guide')

    const deleted = await deleteDocumentNode(projectRoot, ['docs'], 'docs/guide.md')

    expect(deleted.path).toBe('docs/guide.md')
    await expect(access(path.join(projectRoot, 'docs', 'guide.md'))).rejects.toBeTruthy()
  })

  it('rejects document creation outside allowed content roots', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-node-'))
    tempDirs.push(projectRoot)

    await mkdir(path.join(projectRoot, 'docs'), { recursive: true })

    await expect(createDocumentNode(projectRoot, ['docs'], '../guide.md', '# Nope')).rejects.toThrow(
      /Parent directory traversal/,
    )
  })

  it('rejects moving a document onto an existing file', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-node-'))
    tempDirs.push(projectRoot)

    await mkdir(path.join(projectRoot, 'docs'), { recursive: true })
    await writeFile(path.join(projectRoot, 'docs', 'guide.md'), '# Guide')
    await writeFile(path.join(projectRoot, 'docs', 'existing.md'), '# Existing')

    await expect(
      moveDocumentNode(projectRoot, ['docs'], 'docs/guide.md', 'docs/existing.md'),
    ).rejects.toThrow(/already exists/i)
  })
})
