import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { remarkHeadingIds } from '../markdown/heading-outline'
import { applyMarkdownTransforms } from '../markdown/markdown-transform'
import { syncStrongOnlyParagraphClasses } from '../markdown/strong-only-paragraph'

interface ReadonlyMarkdownRendererImplProps {
  value: string
}

export function ReadonlyMarkdownRendererImpl({ value }: ReadonlyMarkdownRendererImplProps) {
  const transformedValue = applyMarkdownTransforms(value)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    syncStrongOnlyParagraphClasses(rootRef.current)
  }, [transformedValue])

  return (
    <div
      ref={rootRef}
      className="readonly-markdown-renderer markdown-document"
      role="group"
      aria-label="只读 Markdown 渲染器"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkHeadingIds]}>{transformedValue}</ReactMarkdown>
    </div>
  )
}
