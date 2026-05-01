import type {Actor, ActorRecord, ActorRoots, AnyValue, ActorFieldValue, ActorRows} from "@store/actor"
import type {AnyTopology, TopologyRecord} from "@store/topology"
import type {DarkMetaParticleModel, Meta} from "@store/meta/sqlite"
import type {MetaDSL} from "../metafor.t"
import type {MatterRelationParticle} from "./meta/sqlite/matter.t.ts"
import type {StoreUpdateMessage} from "./server.ts"

export interface MetaApi {
  /** Создаёт декларацию меты в БД одной транзакцией. Идемпотентно по `src` (DELETE+INSERT). */
  create(src: string, dsl: MetaDSL, matter: MatterRelationParticle[]): Promise<Meta>

  get(src: string): Promise<Meta | null>

  readDarkParticleModel(src: string): Promise<DarkMetaParticleModel | null>
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
  /** Создаёт topology-узел (Fuzzy/Axion/Macho). */
  create(input: TopologyRecord): Promise<AnyTopology>

  get(uuid: string): Promise<AnyTopology | null>

  head(uuid: string): Promise<TopologyRecord | null>

  childrenOfActor(actorUuid: string): Promise<AnyTopology[]>
}

export interface Store {
  readonly meta: MetaApi
  readonly actor: ActorApi
  readonly topology: TopologyApi

  /**
   * Inbound API для приёма sync-патчей от других процессов.
   * Domain-код (Dark/Boundary/Bulk) должен использовать ORM-методы (`meta.create`, `actor.create`, etc.),
   * не этот канал. `update` переводит JSON Patch в соответствующие SQL-операции.
   */
  update(message: StoreUpdateMessage): Promise<void>

  close(): Promise<void>
}
