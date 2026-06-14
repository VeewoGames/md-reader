import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('@milkdown/crepe', () => {
  class MockCrepe {
    static instances: MockCrepe[] = []

    config: Record<string, unknown>
    setReadonly = vi.fn()
    listenerFn: ((listener: { markdownUpdated: (fn: (ctx: unknown, markdown: string) => void) => void }) => void) | null =
      null

    constructor(config: Record<string, unknown>) {
      this.config = config
      MockCrepe.instances.push(this)
    }

    create() {
      return Promise.resolve(undefined)
    }

    destroy() {
      return Promise.resolve(undefined)
    }

    on(
      listenerFn: (listener: {
        markdownUpdated: (fn: (ctx: unknown, markdown: string) => void) => void
      }) => void,
    ) {
      this.listenerFn = listenerFn
      return this
    }
  }

  return {
    Crepe: MockCrepe,
    CrepeFeature: {
      Cursor: 'cursor',
      CodeMirror: 'code-mirror',
      ListItem: 'list-item',
      LinkTooltip: 'link-tooltip',
      ImageBlock: 'image-block',
      Table: 'table',
      Latex: 'latex',
      AI: 'ai',
      TopBar: 'top-bar',
      BlockEdit: 'block-edit',
      Toolbar: 'toolbar',
    },
  }
})

import { VisualMarkdownEditorImpl } from '../../src/editor/visual-markdown-editor-impl'

describe('VisualMarkdownEditorImpl', () => {
  afterEach(() => {
    hookState.reset()
  })

  it('creates a milkdown editor factory with the current markdown value', () => {
    render(<VisualMarkdownEditorImpl value={'# 标题\n\n正文'} onChange={() => {}} />)

    expect(screen.getByLabelText('可视 Markdown 编辑器')).toBeInTheDocument()
    expect(hookState.getFactory()).toBeTypeOf('function')

    const factory = hookState.getFactory()

    expect(factory).not.toBeNull()

    const crepe = factory!(document.createElement('div')) as { config: Record<string, unknown> }
    const features = crepe.config.features as Record<string, boolean>

    expect(features.cursor).toBe(false)
    expect(features['code-mirror']).toBe(false)
    expect(features['list-item']).toBe(false)
    expect(features['link-tooltip']).toBe(false)
    expect(features['image-block']).toBe(false)
    expect(features['block-edit']).toBe(false)
    expect(features.toolbar).toBe(false)
    expect(features.table).toBe(false)
    expect(features.latex).toBe(false)
    expect(features.ai).toBe(false)
    expect(features['top-bar']).toBe(false)
    expect((crepe as { setReadonly: ReturnType<typeof vi.fn> }).setReadonly).toHaveBeenCalledWith(false)
  })

  it('sets the editor to readonly when readonly prop is true', () => {
    render(<VisualMarkdownEditorImpl value={'# 只读内容'} readonly onChange={() => {}} />)

    const factory = hookState.getFactory()

    expect(factory).not.toBeNull()

    const crepe = factory!(document.createElement('div')) as {
      setReadonly: ReturnType<typeof vi.fn>
    }

    expect(crepe.setReadonly).toHaveBeenCalledWith(true)
  })

  it('forwards markdownUpdated events to onChange', () => {
    const handleChange = vi.fn()

    render(<VisualMarkdownEditorImpl value={'# 初始内容'} onChange={handleChange} />)

    const factory = hookState.getFactory()

    expect(factory).not.toBeNull()

    const crepe = factory!(document.createElement('div')) as {
      listenerFn: ((listener: { markdownUpdated: (fn: (ctx: unknown, markdown: string) => void) => void }) => void) | null
    }

    let onUpdated: ((ctx: unknown, markdown: string) => void) | null = null

    crepe.listenerFn?.({
      markdownUpdated: (callback) => {
        onUpdated = callback
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

    const crepe = factory!(document.createElement('div')) as {
      listenerFn: ((listener: { markdownUpdated: (fn: (ctx: unknown, markdown: string) => void) => void }) => void) | null
    }

    let onUpdated: ((ctx: unknown, markdown: string) => void) | null = null

    crepe.listenerFn?.({
      markdownUpdated: (callback) => {
        onUpdated = callback
      },
    })

    onUpdated?.({}, '# 初始内容')

    expect(handleChange).not.toHaveBeenCalled()
  })

  it('does not forward markdownUpdated events when editor is readonly', () => {
    const handleChange = vi.fn()

    render(<VisualMarkdownEditorImpl value={'# 初始内容'} readonly onChange={handleChange} />)

    const factory = hookState.getFactory()

    expect(factory).not.toBeNull()

    const crepe = factory!(document.createElement('div')) as {
      listenerFn: ((listener: { markdownUpdated: (fn: (ctx: unknown, markdown: string) => void) => void }) => void) | null
    }

    let onUpdated: ((ctx: unknown, markdown: string) => void) | null = null

    crepe.listenerFn?.({
      markdownUpdated: (callback) => {
        onUpdated = callback
      },
    })

    onUpdated?.({}, '# 只读态输入')

    expect(handleChange).not.toHaveBeenCalled()
  })

  it('does not reset the editor when parent value only echoes local typing', () => {
    const handleChange = vi.fn()
    const { rerender } = render(<VisualMarkdownEditorImpl value={'# 初始内容'} onChange={handleChange} />)

    const factory = hookState.getFactory()

    expect(factory).not.toBeNull()

    const crepe = factory!(document.createElement('div')) as {
      listenerFn: ((listener: { markdownUpdated: (fn: (ctx: unknown, markdown: string) => void) => void }) => void) | null
    }

    let onUpdated: ((ctx: unknown, markdown: string) => void) | null = null

    crepe.listenerFn?.({
      markdownUpdated: (callback) => {
        onUpdated = callback
      },
    })

    onUpdated?.({}, '# 用户输入的新内容')
    expect(handleChange).toHaveBeenCalledWith('# 用户输入的新内容')

    rerender(<VisualMarkdownEditorImpl value={'# 用户输入的新内容'} onChange={handleChange} />)
    expect(hookState.getDeps()).toEqual([0, false])

    rerender(<VisualMarkdownEditorImpl value={'# 外部重新加载的内容'} onChange={handleChange} />)
    expect(hookState.getDeps()).toEqual([1, false])
  })
})
