import type {ActorStateRecord} from "./state.t.ts"
import type {ActorValueRecord} from "./actor_value.t.ts"
import type {ValueItemRecord, ValueRecord} from "./value.t.ts"

export interface ActorRecord {
  id: number
  /** Id родительского `Actor`, если родитель — другой wimp. Иначе `null`. */
  parentActor: number | null
  /** Id родительского `Topology`-узла, если родитель — fuzzy/axion/macho. Иначе `null`. */
  parentTopology: number | null
  wimp: string
  position: number
}

/**
 * Вход для `Actor.writeRows`. Без `position` — он вычисляется автоматически
 * как next среди siblings (по `parent_actor`/`parent_topology`).
 */
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
