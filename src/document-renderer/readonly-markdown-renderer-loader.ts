import type { ComponentType } from 'react'
import type { ReadonlyMarkdownRendererProps } from './readonly-markdown-renderer'

type ReadonlyMarkdownRendererModule = {
  ReadonlyMarkdownRendererImpl: ComponentType<ReadonlyMarkdownRendererProps>
}

export let cachedRendererComponent: ComponentType<ReadonlyMarkdownRendererProps> | null = null
let rendererModulePromise: Promise<ReadonlyMarkdownRendererModule> | null = null

export function loadReadonlyMarkdownRendererModule() {
  if (!rendererModulePromise) {
    rendererModulePromise = import('./readonly-markdown-renderer-impl')
  }

  return rendererModulePromise
}

export function preloadReadonlyMarkdownRenderer() {
  void loadReadonlyMarkdownRendererModule()
}


export function setCachedReadonlyMarkdownRenderer(component: ComponentType<ReadonlyMarkdownRendererProps>) { cachedRendererComponent = component }
