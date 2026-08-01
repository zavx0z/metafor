/**
 * Merges one patch's line batches into the paths the viewport currently holds.
 *
 * A render patch carries every path of the batches it touched and names the
 * batches that disappeared; it says nothing about the rest. Merging keeps the
 * held sequence authoritative so batch synchronisation still sees the whole
 * scene — a batch absent from both the incoming paths and the removed ids
 * survives untouched, which is what keeps its GPU line buffer alive.
 */
export const mergeVisualBatchPaths = <Path extends {readonly batchId: string}>(
  current: readonly Path[],
  incoming: readonly Path[],
  removedBatchIds: readonly string[],
): readonly Path[] => {
  const replaced = new Set(incoming.map((path) => path.batchId))
  for (const batchId of removedBatchIds) replaced.add(batchId)
  if (replaced.size === 0) return current
  const kept = current.filter((path) => !replaced.has(path.batchId))
  return incoming.length === 0 ? kept : [...kept, ...incoming]
}
