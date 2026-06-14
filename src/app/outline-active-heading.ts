export interface HeadingTarget {
  element: HTMLElement
  id: string
}

export function findActiveHeadingId(headingTargets: HeadingTarget[], anchorTop: number): string | null {
  if (headingTargets.length === 0) {
    return null
  }

  const lastHeadingAboveAnchor = headingTargets.findLast(
    (target) => target.element.getBoundingClientRect().top <= anchorTop,
  )

  if (lastHeadingAboveAnchor) {
    return lastHeadingAboveAnchor.id
  }

  return headingTargets[0]?.id ?? null
}
