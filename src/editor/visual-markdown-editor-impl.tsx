import { useEffect, useRef, useState } from 'react'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { Crepe, CrepeFeature } from '@milkdown/crepe'

import '@milkdown/crepe/theme/classic.css'

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

  useEffect(() => {
    latestMarkdownRef.current = value
  }, [value])

  useEditor(
    (root) => {
      const crepe = new Crepe({
        root,
        defaultValue: value,
        features: {
          [CrepeFeature.Cursor]: false,
          [CrepeFeature.CodeMirror]: false,
          [CrepeFeature.ListItem]: false,
          [CrepeFeature.LinkTooltip]: false,
          [CrepeFeature.ImageBlock]: false,
          [CrepeFeature.BlockEdit]: false,
          [CrepeFeature.Toolbar]: false,
          [CrepeFeature.Table]: false,
          [CrepeFeature.Latex]: false,
          [CrepeFeature.AI]: false,
          [CrepeFeature.TopBar]: false,
        },
      })

      crepe.setReadonly(readonly)

      return crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
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
