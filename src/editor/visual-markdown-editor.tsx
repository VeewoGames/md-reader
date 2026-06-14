import { useEffect, useRef, useState, type ComponentType } from 'react'
import { splitLeadingHtmlComments } from '../markdown/split-leading-html-comments'

interface VisualMarkdownEditorProps {
  value: string
  readonly?: boolean
  onChange: (nextValue: string) => void
  onCompositionStart?: () => void
  onCompositionEnd?: () => void
}

type VisualMarkdownEditorModule = {
  VisualMarkdownEditorImpl: ComponentType<VisualMarkdownEditorProps>
}

let cachedEditorComponent: ComponentType<VisualMarkdownEditorProps> | null = null
let editorModulePromise: Promise<VisualMarkdownEditorModule> | null = null

function loadVisualMarkdownEditorModule() {
  if (!editorModulePromise) {
    editorModulePromise = import('./visual-markdown-editor-impl')
  }

  return editorModulePromise
}

export function preloadVisualMarkdownEditor() {
  void loadVisualMarkdownEditorModule()
}

export function VisualMarkdownEditor(props: VisualMarkdownEditorProps) {
  const [LoadedEditor, setLoadedEditor] = useState<ComponentType<VisualMarkdownEditorProps> | null>(
    () => cachedEditorComponent,
  )
  const [loadError, setLoadError] = useState<Error | null>(null)
  const generationRef = useRef(0)
  const { preservedPrefix, editorValue } = splitLeadingHtmlComments(props.value)

  useEffect(() => {
    if (cachedEditorComponent) {
      setLoadedEditor(() => cachedEditorComponent)
      return
    }

    const generation = generationRef.current + 1
    generationRef.current = generation
    let isDisposed = false

    void loadVisualMarkdownEditorModule()
      .then((module) => {
        if (isDisposed || generationRef.current !== generation) {
          return
        }

        cachedEditorComponent = module.VisualMarkdownEditorImpl
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
        value={editorValue}
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
