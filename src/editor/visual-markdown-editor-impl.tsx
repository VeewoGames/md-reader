import { useEffect, useRef, useState } from 'react'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { Editor, defaultValueCtx, editorViewOptionsCtx, rootCtx } from '@milkdown/kit/core'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { trailing } from '@milkdown/kit/plugin/trailing'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'

import '@milkdown/crepe/theme/classic.css'
import { dispatchEditorStructureUpdated } from './editor-structure-events'
import { syncStrongOnlyParagraphClasses } from '../markdown/strong-only-paragraph'
import { installSlashMenuFeature } from './slash-menu-feature'

interface VisualMarkdownEditorImplProps {
  value: string
  readonly?: boolean
  onChange: (nextValue: string) => void
  onCompositionStart?: () => void
  onCompositionEnd?: () => void
}

function VisualMarkdownEditorContent({
  value,
  onChange,
  readonly = false,
  onCompositionStart,
  onCompositionEnd,
  resetKey,
  onLocalMarkdownChange,
}: VisualMarkdownEditorImplProps & { resetKey: number; onLocalMarkdownChange: (nextValue: string) => void }) {
  const latestMarkdownRef = useRef(value)
  const paragraphClassSyncFrameRef = useRef(0)

  useEffect(() => {
    latestMarkdownRef.current = value
  }, [value])

  useEffect(() => {
    return () => {
      if (paragraphClassSyncFrameRef.current !== 0) {
        window.cancelAnimationFrame(paragraphClassSyncFrameRef.current)
        paragraphClassSyncFrameRef.current = 0
      }
    }
  }, [])

  useEditor(
    (root) => {
      const scheduleParagraphClassSync = () => {
        if (paragraphClassSyncFrameRef.current !== 0) {
          return
        }

        paragraphClassSyncFrameRef.current = window.requestAnimationFrame(() => {
          paragraphClassSyncFrameRef.current = 0
          syncStrongOnlyParagraphClasses(root)
          dispatchEditorStructureUpdated(root)
        })
      }

      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root)
          ctx.set(defaultValueCtx, value)
          ctx.set(editorViewOptionsCtx, {
            attributes: {
              autocapitalize: 'off',
              autocomplete: 'off',
              autocorrect: 'off',
              spellcheck: 'false',
            },
            editable: () => !readonly,
          })
        })
        .use(commonmark)
        .use(listener)
        .use(history)
        .use(trailing)
        .use(clipboard)
        .use(gfm)
        .config((ctx) => {
          const listenerManager = ctx.get(listenerCtx)

          listenerManager.mounted(() => {
            scheduleParagraphClassSync()
          })

          listenerManager.updated(() => {
            scheduleParagraphClassSync()
          })

          listenerManager.markdownUpdated((_ctx, markdown) => {
            if (readonly) {
              return
            }

            if (markdown === latestMarkdownRef.current) {
              return
            }

            latestMarkdownRef.current = markdown
            onLocalMarkdownChange(markdown)
            onChange(markdown)
          })
        })

      installSlashMenuFeature(editor)

      return editor
    },
    [resetKey, readonly],
  )

  return (
    <div
      className="visual-markdown-editor"
      role="group"
      aria-label="可视 Markdown 编辑器"
      onCompositionStart={onCompositionStart}
      onCompositionEnd={onCompositionEnd}
    >
      <Milkdown />
    </div>
  )
}

export function VisualMarkdownEditorImpl({
  value,
  readonly = false,
  onChange,
  onCompositionStart,
  onCompositionEnd,
}: VisualMarkdownEditorImplProps) {
  const latestPropagatedMarkdownRef = useRef(value)
  const [resetKey, setResetKey] = useState(0)

  useEffect(() => {
    if (value === latestPropagatedMarkdownRef.current) {
      return
    }

    latestPropagatedMarkdownRef.current = value
    setResetKey((current) => current + 1)
  }, [value])

  return (
    <MilkdownProvider>
      <VisualMarkdownEditorContent
        value={value}
        onChange={onChange}
        readonly={readonly}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        resetKey={resetKey}
        onLocalMarkdownChange={(nextValue) => {
          latestPropagatedMarkdownRef.current = nextValue
        }}
      />
    </MilkdownProvider>
  )
}
