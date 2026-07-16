import type { AtomStateRecord, AtomValueRecord, ValueItemRecord, ValueRecord } from "./value.ts"

export interface AtomRecord {
  id: number
  parentAtom: number | null
  parentTopology: number | null
  wimp: string
  position: number
}

export interface AtomInputRow {
  id?: number | undefined
  parentAtom: number | null
  parentTopology: number | null
  wimp: string
}

export interface AtomRows {
  atom: AtomInputRow
  values: AtomValueRecord[]
  valueRecords: ValueRecord[]
  valueItems: ValueItemRecord[]
  state: AtomStateRecord
}
