import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'

const codeBlockStrongPluginKey = new PluginKey('md-reader-code-block-strong')
const STRONG_MARKDOWN_PATTERN = /\*\*(?=\S)([^*\n]*?\S)\*\*/g

export type CodeBlockStrongRange = {
  closingMarkerFrom: number
  closingMarkerTo: number
  contentFrom: number
  contentTo: number
  openingMarkerFrom: number
  openingMarkerTo: number
}

export function findCodeBlockStrongRanges(text: string): CodeBlockStrongRange[] {
  const ranges: CodeBlockStrongRange[] = []

  for (const match of text.matchAll(STRONG_MARKDOWN_PATTERN)) {
    const markerFrom = match.index ?? 0
    const contentFrom = markerFrom + 2
    const contentTo = contentFrom + match[1].length

    ranges.push({
      openingMarkerFrom: markerFrom,
      openingMarkerTo: contentFrom,
      contentFrom,
      contentTo,
      closingMarkerFrom: contentTo,
      closingMarkerTo: contentTo + 2,
    })
  }

  return ranges
}

function buildCodeBlockStrongDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, position) => {
    if (node.type.name !== 'code_block') {
      return true
    }

    const contentStart = position + 1

    for (const range of findCodeBlockStrongRanges(node.textContent)) {
      decorations.push(
        Decoration.inline(contentStart + range.contentFrom, contentStart + range.contentTo, {
          class: 'code-block-strong-content',
        }),
        Decoration.inline(contentStart + range.openingMarkerFrom, contentStart + range.openingMarkerTo, {
          class: 'code-block-strong-marker',
        }),
        Decoration.inline(contentStart + range.closingMarkerFrom, contentStart + range.closingMarkerTo, {
          class: 'code-block-strong-marker',
        }),
      )
    }

    return false
  })

  return DecorationSet.create(doc, decorations)
}

export const codeBlockStrongDecorations = new Plugin({
  key: codeBlockStrongPluginKey,
  props: {
    decorations(state) {
      return buildCodeBlockStrongDecorations(state.doc)
    },
  },
})
