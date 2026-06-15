import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('slash menu styles', () => {
  it('does not hide the slash menu with the generic editor chrome reset', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

    expect(css).not.toMatch(/\.visual-markdown-editor \.milkdown-slash-menu\s*\{\s*display:\s*none\s*!important;/)
    expect(css).not.toMatch(/\.visual-markdown-editor \.milkdown-block-handle,\s*[\r\n]+\s*\.visual-markdown-editor \.milkdown-slash-menu\s*\{/)
    expect(css).toMatch(/\.visual-markdown-editor \.milkdown-slash-menu\s*\{/)
  })

  it('keeps custom slash menu icons outside the hidden milkdown label class', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const feature = readFileSync(resolve(process.cwd(), 'src/editor/slash-menu-feature.ts'), 'utf8')

    expect(feature).toMatch(/className = 'slash-menu__icon'/)
    expect(feature).not.toMatch(/className = 'milkdown-icon label'/)
    expect(css).toMatch(/\.visual-markdown-editor \.milkdown-slash-menu \.menu-group li > \.slash-menu__icon\s*\{/)
  })
})
