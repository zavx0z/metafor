import type {Actor, ActorRecord, ActorRoots, AnyValue, ActorFieldValue, ActorRows} from "@boundary/actor"
import type {AnyTopology, TopologyInput, TopologyRecord} from "@boundary/topology"
import type {Wimp, WimpCreateInput} from "@boundary/wimp/sqlite"
import type {BoundaryUpdateMessage} from "./sqlite.ts"
import type {ForceSurface} from "./force.t.ts"
import type {BoundaryBulkRuntimeSnapshot} from "./runtime/bulk.ts"
import type {BoundaryMatrixRuntimeSnapshot} from "./runtime/matrix.ts"
import type {BoundaryEnergyRuntimeSnapshot} from "./runtime/energy.ts"

export {FORCE, force} from "./force.ts"
export type {DomainPath, Force, ForceBinding, ForceMessage, ForceMessageListener, ForceSurface, ParticleOperation, Part, Particle} from "./force.t.ts"
export type {ProcessEnv, ProcessMass, ProcessResult, ProcessRuntimeKind, ProcessTask} from "./process-task.t.ts"
export {open} from "./sqlite.ts"
export type {BoundaryPart, BoundaryParticle, BoundaryUpdateMessage} from "./sqlite.ts"
export type {BoundaryBulkRuntimeSnapshot} from "./runtime/bulk.ts"
export type {BoundaryMatrixRuntimeSnapshot} from "./runtime/matrix.ts"
export type {BoundaryEnergyHandlerDescriptor, BoundaryEnergyProcessDescriptor, BoundaryEnergyRuntimeSnapshot} from "./runtime/energy.ts"

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

  bulkRuntime(): Promise<BoundaryBulkRuntimeSnapshot>
  matrixRuntime(): Promise<BoundaryMatrixRuntimeSnapshot>
  energyRuntime(): Promise<BoundaryEnergyRuntimeSnapshot>

  close(): Promise<void>
}
