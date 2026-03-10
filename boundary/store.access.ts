import type {
  BoundaryBraneRecord,
  BoundaryData,
  BoundaryFieldValueRecord,
  BoundarySharedBlockRecord,
  BoundaryStateRecord,
  BoundaryValue,
} from "./store.t"

function getBrane(store: BoundaryData, braneIndex: number): BoundaryBraneRecord | undefined {
  return store.branes[braneIndex]
}

function getSharedBlock(store: BoundaryData, blockIndex: number): BoundarySharedBlockRecord | undefined {
  return store.sharedBlocks[blockIndex]
}

export type BoundaryFieldStorageLocation =
  | { scope: "local"; record: BoundaryFieldValueRecord }
  | { scope: "shared"; blockIndex: number; record: BoundaryFieldValueRecord }

export function findBraneFieldLocation(
  store: BoundaryData,
  braneIndex: number,
  fieldIndex: number,
): BoundaryFieldStorageLocation | undefined {
  const brane = getBrane(store, braneIndex)
  if (!brane) {
    return undefined
  }

  const localValueEnd = brane.localValueOffset + brane.localValueCount
  for (let valueIndex = brane.localValueOffset; valueIndex < localValueEnd; valueIndex++) {
    const record = store.braneValues[valueIndex]
    if (record?.fieldIndex === fieldIndex) {
      return { scope: "local", record }
    }
  }

  const sharedRefEnd = brane.sharedBlockRefOffset + brane.sharedBlockRefCount
  for (let refIndex = brane.sharedBlockRefOffset; refIndex < sharedRefEnd; refIndex++) {
    const blockIndex = store.braneSharedBlockRefs[refIndex]
    if (blockIndex === undefined) {
      continue
    }

    const block = getSharedBlock(store, blockIndex)
    if (!block) {
      continue
    }

    const blockValueEnd = block.valueOffset + block.valueCount
    for (let valueIndex = block.valueOffset; valueIndex < blockValueEnd; valueIndex++) {
      const record = store.sharedValues[valueIndex]
      if (record?.fieldIndex === fieldIndex) {
        return { scope: "shared", blockIndex, record }
      }
    }
  }

  return undefined
}

export function findBraneFieldRecord(
  store: BoundaryData,
  braneIndex: number,
  fieldIndex: number,
): BoundaryFieldValueRecord | undefined {
  return findBraneFieldLocation(store, braneIndex, fieldIndex)?.record
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
