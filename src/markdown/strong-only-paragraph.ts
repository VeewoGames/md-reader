export const STRONG_ONLY_PARAGRAPH_CLASS = 'md-strong-only-paragraph'

function isStrongOnlyParagraph(paragraph: Element): boolean {
  if (paragraph.tagName !== 'P' || paragraph.childElementCount !== 1) {
    return false
  }

  const onlyChild = paragraph.firstElementChild

  if (!onlyChild || onlyChild.tagName !== 'STRONG') {
    return false
  }

  const paragraphText = paragraph.textContent?.trim() ?? ''
  const strongText = onlyChild.textContent?.trim() ?? ''

  return paragraphText.length > 0 && paragraphText === strongText
}

export function syncStrongOnlyParagraphClasses(root: ParentNode | null | undefined) {
  if (!root) {
    return
  }

  const paragraphs = root.querySelectorAll('p')

  for (const paragraph of paragraphs) {
    paragraph.classList.toggle(STRONG_ONLY_PARAGRAPH_CLASS, isStrongOnlyParagraph(paragraph))
  }
}
