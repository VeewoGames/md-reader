import { isValidElement, useEffect, useRef, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { remarkHeadingIds } from '../markdown/heading-outline'
import { applyMarkdownTransforms } from '../markdown/markdown-transform'
import { syncStrongOnlyParagraphClasses } from '../markdown/strong-only-paragraph'
import { MermaidDiagram } from './mermaid-diagram'

interface ReadonlyMarkdownRendererImplProps {
  value: string
}

function renderCodeBlock({ children }: { children?: ReactNode }) {
  if (isValidElement<{ className?: string; children?: ReactNode }>(children)) {
    const language = children.props.className?.match(/(?:^|\s)language-([^\s]+)/)?.[1]

    if (language?.toLowerCase() === 'mermaid') {
      const chart = String(children.props.children ?? '').replace(/\n$/, '')
      return <MermaidDiagram chart={chart} />
    }
  }

  return <pre>{children}</pre>
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
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkHeadingIds]}
        components={{ pre: renderCodeBlock }}
      >
        {transformedValue}
      </ReactMarkdown>
    </div>
  )
}
