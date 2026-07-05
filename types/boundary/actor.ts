import type { ActorStateRecord, ActorValueRecord, ValueItemRecord, ValueRecord } from "./value.ts"

export interface ActorRecord {
  id: number
  parentActor: number | null
  parentTopology: number | null
  wimp: string
  position: number
}

export interface ActorInputRow {
  id?: number | undefined
  parentActor: number | null
  parentTopology: number | null
  wimp: string
}

export interface ActorRows {
  actor: ActorInputRow
  values: ActorValueRecord[]
  valueRecords: ValueRecord[]
  valueItems: ValueItemRecord[]
  state: ActorStateRecord
}
