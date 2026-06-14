import path from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { readMarkdownDocument } from '../../server/project-reader.mjs'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('project reader', () => {
  it('reads markdown document content and metadata inside allowed roots', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-read-'))
    tempDirs.push(projectRoot)

    await mkdir(path.join(projectRoot, 'docs'), { recursive: true })
    await writeFile(path.join(projectRoot, 'docs', 'README.md'), '# Hello')

    const document = await readMarkdownDocument(projectRoot, ['docs'], 'docs/README.md')

    expect(document.path).toBe('docs/README.md')
    expect(document.content).toBe('# Hello')
    expect(document.size).toBe(Buffer.byteLength('# Hello'))
    expect(document.mtimeMs).toBeTypeOf('number')
  })

  it('rejects parent traversal outside content roots', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-read-'))
    tempDirs.push(projectRoot)

    await mkdir(path.join(projectRoot, 'docs'), { recursive: true })
    await writeFile(path.join(projectRoot, 'README.md'), '# Root')

    await expect(readMarkdownDocument(projectRoot, ['docs'], '../README.md')).rejects.toThrow(
      /Parent directory traversal/,
    )
  })
})
