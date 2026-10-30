import { cachedEditorComponent, loadVisualMarkdownEditorModule, setCachedVisualMarkdownEditor } from './visual-markdown-editor-loader'
import { useEffect, useRef, useState, type ComponentType } from 'react'

import { applyMarkdownTransforms } from '../markdown/markdown-transform'
import { splitLeadingHtmlComments } from '../markdown/split-leading-html-comments'

export interface VisualMarkdownEditorProps {
  value: string
  readonly?: boolean
  onChange: (nextValue: string) => void
  onCompositionStart?: () => void
  onCompositionEnd?: () => void
}

export function VisualMarkdownEditor(props: VisualMarkdownEditorProps) {
  const [LoadedEditor, setLoadedEditor] = useState<ComponentType<VisualMarkdownEditorProps> | null>(
    () => cachedEditorComponent,
  )
  const [loadError, setLoadError] = useState<Error | null>(null)
  const generationRef = useRef(0)
  const { preservedPrefix, editorValue } = splitLeadingHtmlComments(props.value)
  const renderedEditorValue = applyMarkdownTransforms(editorValue)

  useEffect(() => {
    const generation = generationRef.current + 1
    generationRef.current = generation
    let isDisposed = false

    void loadVisualMarkdownEditorModule()
      .then((module) => {
        if (isDisposed || generationRef.current !== generation) {
          return
        }

        setCachedVisualMarkdownEditor(module.VisualMarkdownEditorImpl)
        setLoadedEditor(() => module.VisualMarkdownEditorImpl)
      })
      .catch((error: unknown) => {
        if (isDisposed || generationRef.current !== generation) {
          return
        }

        setLoadError(error instanceof Error ? error : new Error('可视编辑器加载失败'))
      })

    return () => {
      isDisposed = true
    }
  }, [])

  if (LoadedEditor) {
    return (
      <LoadedEditor
        {...props}
        value={renderedEditorValue}
        onChange={(nextValue) => {
          props.onChange(`${preservedPrefix}${nextValue}`)
        }}
      />
    )
  }

  if (loadError) {
    return (
      <div
        className="visual-markdown-editor visual-markdown-editor--error"
        role="status"
        aria-live="polite"
      >
        可视编辑器加载失败：{loadError.message}
      </div>
    )
  }

  return (
    <div
      className="visual-markdown-editor visual-markdown-editor--loading"
      role="status"
      aria-live="polite"
    >
      正在加载可视编辑器…
    </div>
  )
}
