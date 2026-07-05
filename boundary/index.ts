import type {Actor, ActorRoots, ActorFieldValue} from "@boundary/actor"
import type {AnyValue} from "@boundary/actor/sqlite/value"
import type {AnyTopology} from "@boundary/topology/sqlite/topology"
import type {Wimp} from "@boundary/wimp/sqlite"
import type {WimpCreateInput} from "@metafor/types/persistence"
import type {ActorRecord, ActorRows, TopologyInput, TopologyRecord} from "@metafor/types/persistence"
import type {ForceSurface} from "@metafor/types/force"
import type {BulkRuntimeSnapshot} from "@metafor/types/bulk"
import type {MatrixRuntimeSnapshot} from "@metafor/types/matrix"
import type {EnergyRuntimeSnapshot} from "@metafor/types/energy"

export {FORCE, force} from "./force.ts"
export {open} from "./sqlite.ts"

export interface WimpApi {
  /** Дешевая проверка существования декларации без создания ORM-объекта. */
  exists(src: string): Promise<boolean>

  /**
   * Создаёт wimp-декларацию одним ORM-входом.
   * Все параметры опциональны; Boundary после записи отправляет `particles`.
   */
  create(src: string, input?: WimpCreateInput): Promise<Wimp>

  get(src: string): Promise<Wimp | null>
}

export interface ValueApi {
  get(id: number): Promise<AnyValue | null>
}

export interface LinkApi {
  get(actor: number, field: number): Promise<ActorFieldValue | null>
}

export interface ActorApi {
  /** Записывает actor snapshot одной транзакцией: head + values + actor_state. */
  create(rows: ActorRows): Promise<Actor>

  get(id: number): Promise<Actor | null>

  findByParent(input: {
    wimp: string
    parent: {kind: "actor"; id: number} | {kind: "topology"; id: number} | null
  }): Promise<Actor | null>

  head(id: number): Promise<ActorRecord | null>

  readonly roots: ActorRoots
  readonly value: ValueApi
  readonly link: LinkApi
}

export interface TopologyApi {
  /** Создаёт topology-узел (Fuzzy/Axion/Macho). Position вычисляется автоматически. */
  create(input: TopologyInput): Promise<AnyTopology>

  get(id: number): Promise<AnyTopology | null>

  head(id: number): Promise<TopologyRecord | null>

  childrenOfActor(actorId: number): Promise<AnyTopology[]>
}

export interface Boundary extends ForceSurface {
  readonly wimp: WimpApi
  readonly actor: ActorApi
  readonly topology: TopologyApi

  bulkRuntime(): Promise<BulkRuntimeSnapshot>
  matrixRuntime(): Promise<MatrixRuntimeSnapshot>
  energyRuntime(): Promise<EnergyRuntimeSnapshot>

  close(): Promise<void>
}
