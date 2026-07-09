import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const slashMenuFeatureState = vi.hoisted(() => ({
  install: vi.fn(),
}))

const hookState = vi.hoisted(() => {
  let latestFactory: ((root: HTMLElement) => unknown) | null = null
  let latestDeps: unknown[] = []

  return {
    setFactory(factory: ((root: HTMLElement) => unknown) | null) {
      latestFactory = factory
    },
    setDeps(deps: unknown[] | undefined) {
      latestDeps = deps ?? []
    },
    getFactory() {
      return latestFactory
    },
    getDeps() {
      return latestDeps
    },
    reset() {
      latestFactory = null
      latestDeps = []
    },
  }
})

const milkdownState = vi.hoisted(() => {
  const use = vi.fn()
  const config = vi.fn()
  const create = vi.fn(() => Promise.resolve(undefined))
  const destroy = vi.fn(() => Promise.resolve(undefined))

  return {
    use,
    config,
    create,
    destroy,
    reset() {
      use.mockClear()
      config.mockClear()
      create.mockClear()
      destroy.mockClear()
    },
    buildEditor() {
      const editor = {
        use: use.mockImplementation(() => editor),
        config: config.mockImplementation(() => editor),
        create,
        destroy,
      }

      return editor
    },
  }
})

vi.mock('@milkdown/react', () => ({
  MilkdownProvider: ({ children }: { children: React.ReactNode }) => children,
  Milkdown: () => <div data-testid="milkdown-root" />,
  useEditor: (factory: (root: HTMLElement) => unknown, deps?: unknown[]) => {
    hookState.setFactory(factory)
    hookState.setDeps(deps)
    return {
      loading: false,
      get: () => undefined,
    }
  },
}))

vi.mock('@milkdown/kit/core', () => {
  const rootCtx = Symbol('rootCtx')
  const defaultValueCtx = Symbol('defaultValueCtx')
  const editorViewOptionsCtx = Symbol('editorViewOptionsCtx')

  return {
    Editor: {
      make: vi.fn(() => milkdownState.buildEditor()),
    },
    rootCtx,
    defaultValueCtx,
    editorViewOptionsCtx,
  }
})

vi.mock('@milkdown/kit/plugin/clipboard', () => ({
  clipboard: Symbol('clipboard'),
}))

vi.mock('@milkdown/kit/plugin/history', () => ({
  history: Symbol('history'),
}))

vi.mock('@milkdown/kit/plugin/trailing', () => ({
  trailing: Symbol('trailing'),
}))

vi.mock('@milkdown/kit/preset/commonmark', () => ({
  commonmark: Symbol('commonmark'),
}))

vi.mock('@milkdown/kit/preset/gfm', () => ({
  gfm: Symbol('gfm'),
}))

vi.mock('@milkdown/kit/plugin/listener', () => {
  const listenerCtx = Symbol('listenerCtx')

  return {
    listener: Symbol('listener'),
    listenerCtx,
  }
})

vi.mock('../../src/editor/slash-menu-feature', () => ({
  installSlashMenuFeature: slashMenuFeatureState.install,
}))

import { defaultValueCtx, Editor, editorViewOptionsCtx, rootCtx } from '@milkdown/kit/core'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { trailing } from '@milkdown/kit/plugin/trailing'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { VisualMarkdownEditorImpl } from '../../src/editor/visual-markdown-editor-impl'

describe('VisualMarkdownEditorImpl', () => {
  afterEach(() => {
    hookState.reset()
    milkdownState.reset()
  })

  it('creates a milkdown editor factory with the minimal plugin chain', () => {
    render(<VisualMarkdownEditorImpl value={'# 标题\n\n正文'} onChange={() => {}} />)

    expect(screen.getByLabelText('可视 Markdown 编辑器')).toBeInTheDocument()
    expect(hookState.getFactory()).toBeTypeOf('function')

    const factory = hookState.getFactory()

    expect(factory).not.toBeNull()

    const root = document.createElement('div')
    const editor = factory!(root) as {
      use: ReturnType<typeof vi.fn>
      config: ReturnType<typeof vi.fn>
    }

    expect(Editor.make).toHaveBeenCalledTimes(1)
    expect(editor.use).toHaveBeenNthCalledWith(1, commonmark)
    expect(editor.use).toHaveBeenNthCalledWith(2, listener)
    expect(editor.use).toHaveBeenNthCalledWith(3, history)
    expect(editor.use).toHaveBeenNthCalledWith(4, trailing)
    expect(editor.use).toHaveBeenNthCalledWith(5, clipboard)
    expect(editor.use).toHaveBeenNthCalledWith(6, gfm)
    expect(slashMenuFeatureState.install).toHaveBeenCalledWith(editor)

    const configCalls = editor.config.mock.calls.map(([callback]) => callback as (ctx: any) => void)
    const baseSet = vi.fn()
    configCalls[0]({
      set: baseSet,
    })

    expect(baseSet).toHaveBeenCalledWith(rootCtx, root)
    expect(baseSet).toHaveBeenCalledWith(defaultValueCtx, '# 标题\n\n正文')
    expect(baseSet).toHaveBeenCalledWith(
      editorViewOptionsCtx,
      expect.objectContaining({
        attributes: {
          autocapitalize: 'off',
          autocomplete: 'off',
          autocorrect: 'off',
          spellcheck: 'false',
        },
        editable: expect.any(Function),
      }),
    )
  })

  it('sets the editor to readonly through editorViewOptionsCtx when readonly prop is true', () => {
    render(<VisualMarkdownEditorImpl value={'# 只读内容'} readonly onChange={() => {}} />)

    const factory = hookState.getFactory()

    expect(factory).not.toBeNull()

    const root = document.createElement('div')
    const editor = factory!(root) as {
      config: ReturnType<typeof vi.fn>
    }

    const configCalls = editor.config.mock.calls.map(([callback]) => callback as (ctx: any) => void)
    const baseSet = vi.fn()
    configCalls[0]({
      set: baseSet,
    })

    const optionsCall = baseSet.mock.calls.find(([slice]) => slice === editorViewOptionsCtx)
    const options = optionsCall?.[1] as { editable: () => boolean } | undefined

    expect(options?.editable()).toBe(false)
  })

  it('forwards markdownUpdated events to onChange', () => {
    const handleChange = vi.fn()

    render(<VisualMarkdownEditorImpl value={'# 初始内容'} onChange={handleChange} />)

    const factory = hookState.getFactory()

    expect(factory).not.toBeNull()

    const editor = factory!(document.createElement('div')) as {
      config: ReturnType<typeof vi.fn>
    }

    const configCalls = editor.config.mock.calls.map(([callback]) => callback as (ctx: any) => void)
    let onUpdated: ((ctx: unknown, markdown: string) => void) | null = null

    configCalls[1]({
      get: (slice: symbol) => {
        if (slice === listenerCtx) {
          return {
            mounted() {
              return this
            },
            updated() {
              return this
            },
            markdownUpdated(callback: (ctx: unknown, markdown: string) => void) {
              onUpdated = callback
              return this
            },
          }
        }

        return null
      },
    })

    onUpdated?.({}, '# 已更新内容')

    expect(handleChange).toHaveBeenCalledWith('# 已更新内容')
  })

  it('ignores unchanged markdownUpdated events from editor bootstrapping', () => {
    const handleChange = vi.fn()

    render(<VisualMarkdownEditorImpl value={'# 初始内容'} onChange={handleChange} />)

    const factory = hookState.getFactory()

    expect(factory).not.toBeNull()

    const editor = factory!(document.createElement('div')) as {
      config: ReturnType<typeof vi.fn>
    }

    const configCalls = editor.config.mock.calls.map(([callback]) => callback as (ctx: any) => void)
    let onUpdated: ((ctx: unknown, markdown: string) => void) | null = null

    configCalls[1]({
      get: () => ({
        mounted() {
          return this
        },
        updated() {
          return this
        },
        markdownUpdated(callback: (ctx: unknown, markdown: string) => void) {
          onUpdated = callback
          return this
        },
      }),
    })

    onUpdated?.({}, '# 初始内容')

    expect(handleChange).not.toHaveBeenCalled()
  })

  it('does not forward markdownUpdated events when editor is readonly', () => {
    const handleChange = vi.fn()

    render(<VisualMarkdownEditorImpl value={'# 初始内容'} readonly onChange={handleChange} />)

    const factory = hookState.getFactory()

    expect(factory).not.toBeNull()

    const editor = factory!(document.createElement('div')) as {
      config: ReturnType<typeof vi.fn>
    }

    const configCalls = editor.config.mock.calls.map(([callback]) => callback as (ctx: any) => void)
    let onUpdated: ((ctx: unknown, markdown: string) => void) | null = null

    configCalls[1]({
      get: () => ({
        mounted() {
          return this
        },
        updated() {
          return this
        },
        markdownUpdated(callback: (ctx: unknown, markdown: string) => void) {
          onUpdated = callback
          return this
        },
      }),
    })

    onUpdated?.({}, '# 只读态输入')

    expect(handleChange).not.toHaveBeenCalled()
  })

  it('does not reset the editor when parent value only echoes local typing', () => {
    const handleChange = vi.fn()
    const { rerender } = render(<VisualMarkdownEditorImpl value={'# 初始内容'} onChange={handleChange} />)

    const factory = hookState.getFactory()

    expect(factory).not.toBeNull()

    const editor = factory!(document.createElement('div')) as {
      config: ReturnType<typeof vi.fn>
    }

    const configCalls = editor.config.mock.calls.map(([callback]) => callback as (ctx: any) => void)
    let onUpdated: ((ctx: unknown, markdown: string) => void) | null = null

    configCalls[1]({
      get: () => ({
        mounted() {
          return this
        },
        updated() {
          return this
        },
        markdownUpdated(callback: (ctx: unknown, markdown: string) => void) {
          onUpdated = callback
          return this
        },
      }),
    })

    onUpdated?.({}, '# 用户输入的新内容')
    expect(handleChange).toHaveBeenCalledWith('# 用户输入的新内容')

    rerender(<VisualMarkdownEditorImpl value={'# 用户输入的新内容'} onChange={handleChange} />)
    expect(hookState.getDeps()).toEqual([0, false])

    rerender(<VisualMarkdownEditorImpl value={'# 外部重新加载的内容'} onChange={handleChange} />)
    expect(hookState.getDeps()).toEqual([1, false])
  })
})
