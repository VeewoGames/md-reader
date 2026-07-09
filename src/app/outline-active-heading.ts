export interface HeadingTarget {
  element: HTMLElement
  id: string
}

const ACTIVE_HEADING_TOLERANCE_PX = 0.5

export function findActiveHeadingId(headingTargets: HeadingTarget[], anchorTop: number): string | null {
  if (headingTargets.length === 0) {
    return null
  }

  const lastHeadingAboveAnchor = headingTargets.findLast(
    (target) => target.element.getBoundingClientRect().top <= anchorTop + ACTIVE_HEADING_TOLERANCE_PX,
  )

  if (lastHeadingAboveAnchor) {
    return lastHeadingAboveAnchor.id
  }

  return headingTargets[0]?.id ?? null
}
