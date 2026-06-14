import { useEffect, useRef, useState } from 'react'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { Crepe, CrepeFeature } from '@milkdown/crepe'

import '@milkdown/crepe/theme/classic.css'

interface ReadonlyMarkdownRendererImplProps {
  value: string
}

function ReadonlyMarkdownRendererContent({
  value,
  resetKey,
}: ReadonlyMarkdownRendererImplProps & { resetKey: number }) {
  useEditor(
    (root) => {
      const crepe = new Crepe({
        root,
        defaultValue: value,
        features: {
          [CrepeFeature.Cursor]: false,
          [CrepeFeature.CodeMirror]: false,
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

      crepe.setReadonly(true)

      return crepe
    },
    [resetKey],
  )

  return (
    <div
      className="readonly-markdown-renderer"
      role="group"
      aria-label="只读 Markdown 渲染器"
    >
      <Milkdown />
    </div>
  )
}

export function ReadonlyMarkdownRendererImpl({ value }: ReadonlyMarkdownRendererImplProps) {
  const latestValueRef = useRef(value)
  const [resetKey, setResetKey] = useState(0)

  useEffect(() => {
    if (value === latestValueRef.current) {
      return
    }

    latestValueRef.current = value
    setResetKey((current) => current + 1)
  }, [value])

  return (
    <MilkdownProvider>
      <ReadonlyMarkdownRendererContent value={value} resetKey={resetKey} />
    </MilkdownProvider>
  )
}
