import path from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { scanMarkdownTree } from '../../server/project-scanner.mjs'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('project scanner', () => {
  it('collects markdown files and ignores non-markdown files', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'md-reader-scan-'))
    tempDirs.push(projectRoot)

    await mkdir(path.join(projectRoot, 'docs', 'nested'), { recursive: true })
    await writeFile(path.join(projectRoot, 'README.md'), '# hello')
    await writeFile(path.join(projectRoot, 'docs', 'guide.mdx'), '# guide')
    await writeFile(path.join(projectRoot, 'docs', 'nested', 'notes.txt'), 'ignore me')

    const paths = await scanMarkdownTree(projectRoot, ['.'])

    expect(paths).toEqual(['README.md', 'docs/guide.mdx'])
  })
})
