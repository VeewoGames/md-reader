import { describe, expect, it } from 'vitest'

import {
  findSlashTriggerMatch,
  matchesSlashQuery,
} from '../../src/editor/slash-menu-feature'

function createView(options: {
  editable?: boolean
  focus?: boolean
  nodeType?: string
  parentOffset: number
  text: string
}) {
  const text = options.text
  const parentOffset = options.parentOffset

  return {
    editable: options.editable ?? true,
    hasFocus: () => options.focus ?? true,
    state: {
      selection: {
        empty: true,
        from: 100 + parentOffset,
        $from: {
          parent: {
            type: {
              name: options.nodeType ?? 'paragraph',
            },
            textBetween: () => text.slice(0, parentOffset),
          },
          parentOffset,
          start: () => 100,
        },
      },
    },
  }
}

describe('matchesSlashQuery', () => {
  it('matches aliases and labels case-insensitively', () => {
    expect(matchesSlashQuery('h1', ['标题 1', 'h1', '#'])).toBe(true)
    expect(matchesSlashQuery('todo', ['待办清单', 'task', 'todo'])).toBe(true)
    expect(matchesSlashQuery('quote', ['引用', 'blockquote'])).toBe(true)
    expect(matchesSlashQuery('missing', ['引用', 'blockquote'])).toBe(false)
  })
})

describe('findSlashTriggerMatch', () => {
  it('finds the nearest slash token after existing content', () => {
    const match = findSlashTriggerMatch(
      createView({
        text: '现有内容 /h1',
        parentOffset: '现有内容 /h1'.length,
      }) as never,
    )

    expect(match).toEqual({
      cleanupFrom: 104,
      from: 105,
      query: 'h1',
      to: 108,
    })
  })

  it('supports an empty query so plain slash also opens the menu', () => {
    const match = findSlashTriggerMatch(
      createView({
        text: '现有内容 /',
        parentOffset: '现有内容 /'.length,
      }) as never,
    )

    expect(match?.query).toBe('')
  })

  it('also supports slash typed directly after existing text', () => {
    const match = findSlashTriggerMatch(
      createView({
        text: '现有内容/',
        parentOffset: '现有内容/'.length,
      }) as never,
    )

    expect(match?.query).toBe('')
    expect(match?.from).toBe(104)
  })

  it('rejects slashes inside urls or non-boundary text', () => {
    const match = findSlashTriggerMatch(
      createView({
        text: 'https://example.com/',
        parentOffset: 'https://example.com/'.length,
      }) as never,
    )

    expect(match).toBeNull()
  })

  it('rejects slash queries that already contain whitespace', () => {
    const match = findSlashTriggerMatch(
      createView({
        text: '现有内容 /he ad',
        parentOffset: '现有内容 /he ad'.length,
      }) as never,
    )

    expect(match).toBeNull()
  })

  it('only works for paragraph or heading blocks', () => {
    const match = findSlashTriggerMatch(
      createView({
        text: 'code /h1',
        parentOffset: 'code /h1'.length,
        nodeType: 'code_block',
      }) as never,
    )

    expect(match).toBeNull()
  })
})
