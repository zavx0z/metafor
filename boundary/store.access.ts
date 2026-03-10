import type {
  BoundaryBraneRecord,
  BoundaryData,
  BoundaryFieldValueRecord,
  BoundaryStateRecord,
  BoundaryValue,
} from "./store.t"

function getBrane(store: BoundaryData, braneIndex: number): BoundaryBraneRecord | undefined {
  return store.branes[braneIndex]
}

export function findBraneFieldRecord(
  store: BoundaryData,
  braneIndex: number,
  fieldIndex: number,
): BoundaryFieldValueRecord | undefined {
  const brane = getBrane(store, braneIndex)
  if (!brane) {
    return undefined
  }

  const localValueEnd = brane.localValueOffset + brane.localValueCount
  for (let valueIndex = brane.localValueOffset; valueIndex < localValueEnd; valueIndex++) {
    const record = store.braneValues[valueIndex]
    if (record?.fieldIndex === fieldIndex) {
      return record
    }
  }

  const sharedRefEnd = brane.sharedBlockRefOffset + brane.sharedBlockRefCount
  for (let refIndex = brane.sharedBlockRefOffset; refIndex < sharedRefEnd; refIndex++) {
    const blockIndex = store.braneSharedBlockRefs[refIndex]
    if (blockIndex === undefined) {
      continue
    }

    const block = store.sharedBlocks[blockIndex]
    if (!block) {
      continue
    }

    const blockValueEnd = block.valueOffset + block.valueCount
    for (let valueIndex = block.valueOffset; valueIndex < blockValueEnd; valueIndex++) {
      const record = store.sharedValues[valueIndex]
      if (record?.fieldIndex === fieldIndex) {
        return record
      }
    }
  }

  return undefined
}

export function readBraneFieldValue(
  store: BoundaryData,
  braneIndex: number,
  fieldIndex: number,
): BoundaryValue | undefined {
  return findBraneFieldRecord(store, braneIndex, fieldIndex)?.value
}

export function getBraneStateRecord(
  store: BoundaryData,
  braneIndex: number,
  stateIndex: number,
): BoundaryStateRecord | undefined {
  const brane = getBrane(store, braneIndex)
  if (!brane || stateIndex < 0 || stateIndex >= brane.stateCount) {
    return undefined
  }

  return store.stateTable[brane.stateOffset + stateIndex]
}
