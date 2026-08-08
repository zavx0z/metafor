/**
 * The executing Window remains a valid observer even while a reconnecting host
 * temporarily omits it from one topology snapshot. Other missing nodes are not
 * retained because the browser has no independent proof that they still exist.
 */
export function shouldRetainMissingLocalWindowSelection(
  selectedNodeIds: readonly string[],
  localWindowNodeId: string,
  availableNodeIds: ReadonlySet<string>,
): boolean {
  return selectedNodeIds.includes(localWindowNodeId) && !availableNodeIds.has(localWindowNodeId)
}
