import { isValidElement, useEffect, useRef, type ComponentPropsWithoutRef, type MouseEvent, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { resolveDocumentLink, type DocumentLinkInvalidReason } from '../markdown/document-link'
import { remarkHeadingIds } from '../markdown/heading-outline'
import { applyMarkdownTransforms } from '../markdown/markdown-transform'
import { syncStrongOnlyParagraphClasses } from '../markdown/strong-only-paragraph'
import { MermaidDiagram } from './mermaid-diagram'

interface ReadonlyMarkdownRendererImplProps {
  value: string
  currentDocumentPath?: string | null
  documentPaths?: Iterable<string>
  contentRoots?: Iterable<string>
  getDocumentLinkHref?: (documentPath: string, headingId: string | null) => string
  onDocumentLinkNavigate?: (documentPath: string, headingId: string | null) => void | Promise<void>
  onCurrentDocumentAnchorNavigate?: (headingId: string) => void
  onInvalidDocumentLink?: (href: string, reason: DocumentLinkInvalidReason) => void
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

function isModifiedClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
}

export function ReadonlyMarkdownRendererImpl({
  value,
  currentDocumentPath = null,
  documentPaths = [],
  contentRoots = ['.'],
  getDocumentLinkHref,
  onDocumentLinkNavigate,
  onCurrentDocumentAnchorNavigate,
  onInvalidDocumentLink,
}: ReadonlyMarkdownRendererImplProps) {
  const transformedValue = applyMarkdownTransforms(value)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const renderLink = ({ href, children, ...anchorProps }: ComponentPropsWithoutRef<'a'>) => {
    const rawHref = href ?? ''
    const resolution = currentDocumentPath
      ? resolveDocumentLink({ currentDocumentPath, href: rawHref, documentPaths, contentRoots })
      : { kind: 'external' as const, href: rawHref }

    if (resolution.kind === 'external') {
      return (
        <a href={resolution.href} {...anchorProps}>
          {children}
        </a>
      )
    }

    if (resolution.kind === 'invalid') {
      const reportInvalid = (event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault()
        onInvalidDocumentLink?.(resolution.href, resolution.reason)
      }

      return (
        <a href="#" {...anchorProps} target={undefined} onClick={reportInvalid} onAuxClick={reportInvalid}>
          {children}
        </a>
      )
    }

    if (resolution.kind === 'anchor') {
      const navigateAnchor = (event: MouseEvent<HTMLAnchorElement>) => {
        if (isModifiedClick(event)) return
        event.preventDefault()
        onCurrentDocumentAnchorNavigate?.(resolution.headingId)
      }
      const canonicalHref = currentDocumentPath
        ? (getDocumentLinkHref?.(currentDocumentPath, resolution.headingId) ?? '#')
        : '#'

      return (
        <a href={canonicalHref} {...anchorProps} onClick={navigateAnchor}>
          {children}
        </a>
      )
    }

    const canonicalHref = getDocumentLinkHref?.(resolution.documentPath, resolution.headingId) ?? '#'
    const navigateDocument = (event: MouseEvent<HTMLAnchorElement>) => {
      if (isModifiedClick(event)) return
      event.preventDefault()
      void onDocumentLinkNavigate?.(resolution.documentPath, resolution.headingId)
    }

    return (
      <a href={canonicalHref} {...anchorProps} onClick={navigateDocument}>
        {children}
      </a>
    )
  }

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
        components={{ pre: renderCodeBlock, a: renderLink }}
      >
        {transformedValue}
      </ReactMarkdown>
    </div>
  )
}
