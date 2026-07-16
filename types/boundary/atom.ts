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
  /** Legacy storage key; the value is the materialized Atom row. */
  actor: AtomInputRow
  values: AtomValueRecord[]
  valueRecords: ValueRecord[]
  valueItems: ValueItemRecord[]
  state: AtomStateRecord
}
