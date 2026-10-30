import type { ComponentType } from 'react'
import type { VisualMarkdownEditorProps } from './visual-markdown-editor'

type VisualMarkdownEditorModule = {
  VisualMarkdownEditorImpl: ComponentType<VisualMarkdownEditorProps>
}

export let cachedEditorComponent: ComponentType<VisualMarkdownEditorProps> | null = null
let editorModulePromise: Promise<VisualMarkdownEditorModule> | null = null

export function loadVisualMarkdownEditorModule() {
  if (!editorModulePromise) {
    editorModulePromise = import('./visual-markdown-editor-impl')
  }

  return editorModulePromise
}

export function preloadVisualMarkdownEditor() {
  void loadVisualMarkdownEditorModule()
}


export function setCachedVisualMarkdownEditor(component: ComponentType<VisualMarkdownEditorProps>) { cachedEditorComponent = component }
