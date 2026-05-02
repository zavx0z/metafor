import type {ActorStateRecord} from "./state.t.ts"
import type {ActorValueRecord} from "./actor_value.t.ts"
import type {ValueItemRecord, ValueRecord} from "./value.t.ts"

export interface ActorRecord {
  uuid: string
  /** UUID родительского `Actor`, если родитель — другой wimp. Иначе `null`. */
  parentActor: string | null
  /** UUID родительского `Topology`-узла, если родитель — fuzzy/axion/macho. Иначе `null`. */
  parentTopology: string | null
  wimp: string
  position: number
}

export interface ActorRows {
  actor: ActorRecord
  values: ActorValueRecord[]
  valueRecords: ValueRecord[]
  valueItems: ValueItemRecord[]
  state: ActorStateRecord
}
