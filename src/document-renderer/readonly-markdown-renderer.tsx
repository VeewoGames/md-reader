import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'

import type { DocumentLinkInvalidReason } from '../markdown/document-link'
import { splitLeadingHtmlComments } from '../markdown/split-leading-html-comments'

export interface ReadonlyMarkdownRendererProps {
  value: string
  currentDocumentPath?: string | null
  documentPaths?: Iterable<string>
  contentRoots?: Iterable<string>
  getDocumentLinkHref?: (documentPath: string, headingId: string | null) => string
  onDocumentLinkNavigate?: (documentPath: string, headingId: string | null) => void | Promise<void>
  onCurrentDocumentAnchorNavigate?: (headingId: string) => void
  onInvalidDocumentLink?: (href: string, reason: DocumentLinkInvalidReason) => void
}

type ReadonlyMarkdownRendererModule = {
  ReadonlyMarkdownRendererImpl: ComponentType<ReadonlyMarkdownRendererProps>
}

let cachedRendererComponent: ComponentType<ReadonlyMarkdownRendererProps> | null = null
let rendererModulePromise: Promise<ReadonlyMarkdownRendererModule> | null = null

function loadReadonlyMarkdownRendererModule() {
  if (!rendererModulePromise) {
    rendererModulePromise = import('./readonly-markdown-renderer-impl')
  }

  return rendererModulePromise
}

export function preloadReadonlyMarkdownRenderer() {
  void loadReadonlyMarkdownRendererModule()
}

export function ReadonlyMarkdownRenderer(props: ReadonlyMarkdownRendererProps) {
  const [LoadedRenderer, setLoadedRenderer] =
    useState<ComponentType<ReadonlyMarkdownRendererProps> | null>(() => cachedRendererComponent)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const generationRef = useRef(0)
  const latestPropsRef = useRef(props)
  const { editorValue } = splitLeadingHtmlComments(props.value)
  const getDocumentLinkHref = useCallback((documentPath: string, headingId: string | null) => (
    latestPropsRef.current.getDocumentLinkHref?.(documentPath, headingId) ?? '#'
  ), [])
  const onDocumentLinkNavigate = useCallback((documentPath: string, headingId: string | null) => (
    latestPropsRef.current.onDocumentLinkNavigate?.(documentPath, headingId)
  ), [])
  const onCurrentDocumentAnchorNavigate = useCallback((headingId: string) => {
    latestPropsRef.current.onCurrentDocumentAnchorNavigate?.(headingId)
  }, [])
  const onInvalidDocumentLink = useCallback((href: string, reason: DocumentLinkInvalidReason) => {
    latestPropsRef.current.onInvalidDocumentLink?.(href, reason)
  }, [])

  useEffect(() => {
    latestPropsRef.current = props
  }, [props])

  useEffect(() => {
    if (cachedRendererComponent) {
      setLoadedRenderer(() => cachedRendererComponent)
      return
    }

    const generation = generationRef.current + 1
    generationRef.current = generation
    let isDisposed = false

    void loadReadonlyMarkdownRendererModule()
      .then((module) => {
        if (isDisposed || generationRef.current !== generation) {
          return
        }

        cachedRendererComponent = module.ReadonlyMarkdownRendererImpl
        setLoadedRenderer(() => module.ReadonlyMarkdownRendererImpl)
      })
      .catch((error: unknown) => {
        if (isDisposed || generationRef.current !== generation) {
          return
        }

        setLoadError(error instanceof Error ? error : new Error('只读渲染器加载失败'))
      })

    return () => {
      isDisposed = true
    }
  }, [])

  const renderedDocument = useMemo(() => LoadedRenderer ? (
    <LoadedRenderer
      value={editorValue}
      currentDocumentPath={props.currentDocumentPath}
      documentPaths={props.documentPaths}
      contentRoots={props.contentRoots}
      getDocumentLinkHref={getDocumentLinkHref}
      onDocumentLinkNavigate={onDocumentLinkNavigate}
      onCurrentDocumentAnchorNavigate={onCurrentDocumentAnchorNavigate}
      onInvalidDocumentLink={onInvalidDocumentLink}
    />
  ) : null, [
    LoadedRenderer,
    editorValue,
    getDocumentLinkHref,
    onCurrentDocumentAnchorNavigate,
    onDocumentLinkNavigate,
    onInvalidDocumentLink,
    props.contentRoots,
    props.currentDocumentPath,
    props.documentPaths,
  ])

  if (renderedDocument) return renderedDocument

  if (loadError) {
    return (
      <div
        className="readonly-markdown-renderer readonly-markdown-renderer--error"
        role="status"
        aria-live="polite"
      >
        只读渲染器加载失败：{loadError.message}
      </div>
    )
  }

  return (
    <div
      className="readonly-markdown-renderer readonly-markdown-renderer--loading"
      role="status"
      aria-live="polite"
    >
      正在加载只读渲染器…
    </div>
  )
}
