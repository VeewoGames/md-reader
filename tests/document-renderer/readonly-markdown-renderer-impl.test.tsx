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
    listenerFn:
      | ((listener: { markdownUpdated: (fn: (ctx: unknown, markdown: string) => void) => void }) => void)
      | null = null
    readonly = false

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

    setReadonly(value: boolean) {
      this.readonly = value
      return this
    }
  }

  return {
    Crepe: MockCrepe,
    CrepeFeature: {
      Cursor: 'cursor',
      CodeMirror: 'code-mirror',
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

import { ReadonlyMarkdownRendererImpl } from '../../src/document-renderer/readonly-markdown-renderer-impl'

describe('ReadonlyMarkdownRendererImpl', () => {
  afterEach(() => {
    hookState.reset()
  })

  it('creates a readonly milkdown crepe instance with readonly enabled', () => {
    render(<ReadonlyMarkdownRendererImpl value={'# 标题\n\n正文'} />)

    expect(screen.getByLabelText('只读 Markdown 渲染器')).toBeInTheDocument()
    expect(hookState.getFactory()).toBeTypeOf('function')

    const factory = hookState.getFactory()

    expect(factory).not.toBeNull()

    const crepe = factory!(document.createElement('div')) as {
      config: Record<string, unknown>
      readonly: boolean
    }
    const features = crepe.config.features as Record<string, boolean>

    expect(crepe.readonly).toBe(true)
    expect(features.cursor).toBe(false)
    expect(features['code-mirror']).toBe(false)
    expect(features['link-tooltip']).toBe(false)
    expect(features['image-block']).toBe(false)
    expect(features['block-edit']).toBe(false)
    expect(features.toolbar).toBe(false)
    expect(features.table).toBe(false)
    expect(features.latex).toBe(false)
    expect(features.ai).toBe(false)
    expect(features['top-bar']).toBe(false)
  })

  it('resets the readonly renderer when external value changes', () => {
    const { rerender } = render(<ReadonlyMarkdownRendererImpl value={'# 初始内容'} />)

    expect(hookState.getDeps()).toEqual([0])

    rerender(<ReadonlyMarkdownRendererImpl value={'# 外部重新加载的内容'} />)

    expect(hookState.getDeps()).toEqual([1])
  })
})
