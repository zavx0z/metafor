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

/**
 * Вход для `Actor.writeRows`. Без `position` — он вычисляется автоматически
 * как next среди siblings (по `parent_actor`/`parent_topology`).
 */
export interface ActorInputRow {
  uuid: string
  parentActor: string | null
  parentTopology: string | null
  wimp: string
}

export interface ActorRows {
  actor: ActorInputRow
  values: ActorValueRecord[]
  valueRecords: ValueRecord[]
  valueItems: ValueItemRecord[]
  state: ActorStateRecord
}
