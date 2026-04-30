
import type { ActorStateRecord } from "./state.t.ts"
import type { ActorValueRecord } from "./actor_value.t.ts"
import type { ValueItemRecord, ValueRecord } from "./value.t.ts"

export interface ActorRecord {
  uuid: string
    parent: string | null
    meta: string
    position: number
}

export interface ActorRows {
  actor: ActorRecord
    values: ActorValueRecord[]
    valueRecords: ValueRecord[]
    valueItems: ValueItemRecord[]
  state: ActorStateRecord
}
