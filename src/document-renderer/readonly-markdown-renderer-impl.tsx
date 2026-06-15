import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { applyMarkdownTransforms } from '../markdown/markdown-transform'

interface ReadonlyMarkdownRendererImplProps {
  value: string
}

export function ReadonlyMarkdownRendererImpl({ value }: ReadonlyMarkdownRendererImplProps) {
  const transformedValue = applyMarkdownTransforms(value)

  return (
    <div
      className="readonly-markdown-renderer markdown-document"
      role="group"
      aria-label="只读 Markdown 渲染器"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{transformedValue}</ReactMarkdown>
    </div>
  )
}
