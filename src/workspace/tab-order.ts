export interface TabRect {
  left: number
  width: number
  center: number
}

export function moveTabId(order: string[], dragTabId: string, nextIndex: number): string[] {
  const currentIndex = order.indexOf(dragTabId)

  if (currentIndex < 0 || currentIndex === nextIndex) {
    return order
  }

  const nextOrder = order.slice()
  nextOrder.splice(currentIndex, 1)
  nextOrder.splice(nextIndex, 0, dragTabId)
  return nextOrder
}

export function findDropIndexByCenter(
  order: string[],
  dragTabId: string,
  dragCenterX: number,
  rectsById: Record<string, TabRect>,
): number {
  const orderWithoutDrag = order.filter((id) => id !== dragTabId)
  const targetIndex = orderWithoutDrag.findIndex((id) => dragCenterX < rectsById[id].center)

  return targetIndex < 0 ? orderWithoutDrag.length : targetIndex
}

export function buildShiftMap({
  committedOrder,
  previewOrder,
  dragTabId,
  rectsById,
}: {
  committedOrder: string[]
  previewOrder: string[]
  dragTabId: string
  rectsById: Record<string, TabRect>
}): Record<string, number> {
  const measurableCommittedOrder = committedOrder.filter((id) => rectsById[id] != null)
  const slotLeftByIndex = measurableCommittedOrder.map((id) => rectsById[id].left)

  return Object.fromEntries(
    measurableCommittedOrder
      .filter((id) => id !== dragTabId)
      .map((id) => {
        const previewIndex = previewOrder.indexOf(id)

        if (previewIndex < 0) {
          return [id, 0]
        }

        const currentRect = rectsById[id]
        const targetLeft = slotLeftByIndex[previewIndex]

        if (targetLeft == null) {
          return [id, 0]
        }

        return [id, targetLeft - currentRect.left]
      }),
  )
}
