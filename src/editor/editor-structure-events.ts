export const EDITOR_STRUCTURE_UPDATED_EVENT = 'md-reader:editor-structure-updated'

export function dispatchEditorStructureUpdated(root: HTMLElement) {
  root.dispatchEvent(
    new CustomEvent(EDITOR_STRUCTURE_UPDATED_EVENT, {
      bubbles: true,
    }),
  )
}
