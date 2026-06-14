import type { Heading, Root } from 'mdast'
import { toString } from 'mdast-util-to-string'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

export interface MarkdownHeading {
  id: string
  text: string
  depth: number
}

export function extractMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root
  const slugCounts = new Map<string, number>()
  const headings: MarkdownHeading[] = []

  visit(tree, 'heading', (node: Heading) => {
    const text = toString(node).trim()

    if (!text) {
      return
    }

    const slug = createHeadingSlug(text, slugCounts)
    headings.push({
      id: slug,
      text,
      depth: node.depth,
    })
  })

  return headings
}

export function remarkHeadingIds() {
  return (tree: Root) => {
    const slugCounts = new Map<string, number>()

    visit(tree, 'heading', (node: Heading) => {
      const text = toString(node).trim()

      if (!text) {
        return
      }

      const slug = createHeadingSlug(text, slugCounts)
      const data = ((node.data ??= {}) as { hProperties?: Record<string, string> })
      data.hProperties = {
        ...data.hProperties,
        id: slug,
        'data-heading-id': slug,
      }
    })
  }
}

function createHeadingSlug(text: string, slugCounts: Map<string, number>): string {
  const normalized = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

  const baseSlug = normalized || 'section'
  const count = (slugCounts.get(baseSlug) ?? 0) + 1
  slugCounts.set(baseSlug, count)

  return count === 1 ? baseSlug : `${baseSlug}-${count}`
}
