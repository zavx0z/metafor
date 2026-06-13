import type {Actor, ActorRecord, ActorRoots, AnyValue, ActorFieldValue, ActorRows} from "@store/actor"
import type {AnyTopology, TopologyInput, TopologyRecord} from "@store/topology"
import type {Wimp, WimpCreateInput} from "@store/wimp/sqlite"
import type {StoreUpdateMessage} from "./sqlite.ts"
import type {ForceSurface} from "./force.ts"

export {METAFOR_FORCE_CHANNEL, force} from "./force.ts"
export type {Force, ForceMessage, ForceMessageHandler, ForceSurface, ParticleOperation, Part, Particle} from "./force.ts"
export {open} from "./sqlite.ts"
export type {StorePart, StoreParticle, StoreUpdateMessage} from "./sqlite.ts"

export interface WimpApi {
  /** Возвращает ORM-ссылку без SQL-проверки существования. */
  ref(src: string): Wimp

  /** Дешевая проверка существования декларации без создания ORM-объекта. */
  exists(src: string): Promise<boolean>

  /**
   * Создаёт wimp-декларацию одним ORM-входом.
   * Все параметры опциональны; Store после записи отправляет `particles`.
   */
  create(src: string, input?: WimpCreateInput): Promise<Wimp>

  get(src: string): Promise<Wimp | null>
}

export interface ValueApi {
  get(uuid: string): Promise<AnyValue | null>
}

export interface LinkApi {
  get(actor: string, field: string): Promise<ActorFieldValue | null>
}

export interface ActorApi {
  /** Записывает актора одной транзакцией: row + values + actor_state. */
  create(rows: ActorRows): Promise<Actor>

  get(uuid: string): Promise<Actor | null>

  head(uuid: string): Promise<ActorRecord | null>

  readonly roots: ActorRoots
  readonly value: ValueApi
  readonly link: LinkApi
}

export interface TopologyApi {
  /** Создаёт topology-узел (Fuzzy/Axion/Macho). Position вычисляется автоматически. */
  create(input: TopologyInput): Promise<AnyTopology>

  get(uuid: string): Promise<AnyTopology | null>

  head(uuid: string): Promise<TopologyRecord | null>

  childrenOfActor(actorUuid: string): Promise<AnyTopology[]>
}

export interface Store extends ForceSurface {
  readonly wimp: WimpApi
  readonly actor: ActorApi
  readonly topology: TopologyApi

  /**
   * Inbound API для приёма force parts от других процессов.
   * Domain-код (Dark/Boundary/Bulk) должен использовать ORM-методы (`wimp.create`, `actor.create`, etc.),
   * не этот канал. `update` переводит parts в соответствующие SQL-операции.
   */
  update(message: StoreUpdateMessage): Promise<void>

  close(): Promise<void>
}
