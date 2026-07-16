import type { AtomStateRecord, AtomValueRecord, ValueItemRecord, ValueRecord } from "./value.ts"

export interface AtomRecord {
  id: number
  parentActor: number | null
  parentTopology: number | null
  wimp: string
  position: number
}

export interface AtomInputRow {
  id?: number | undefined
  parentActor: number | null
  parentTopology: number | null
  wimp: string
}

export interface AtomRows {
  actor: AtomInputRow
  values: AtomValueRecord[]
  valueRecords: ValueRecord[]
  valueItems: ValueItemRecord[]
  state: AtomStateRecord
}

/** @deprecated Use AtomRecord. Kept only for storage/protocol compatibility. */
export type ActorRecord = AtomRecord
/** @deprecated Use AtomInputRow. Kept only for storage/protocol compatibility. */
export type ActorInputRow = AtomInputRow
/** @deprecated Use AtomRows. Kept only for storage/protocol compatibility. */
export type ActorRows = AtomRows
