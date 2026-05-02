import type {Actor, ActorRecord, ActorRoots, AnyValue, ActorFieldValue, ActorRows} from "@store/actor"
import type {AnyTopology, TopologyInput, TopologyRecord} from "@store/topology"
import type {Wimp} from "@store/wimp/sqlite"
import type {StoreUpdateMessage} from "./server.ts"

export interface WimpApi {
  /**
   * Создаёт минимальную row в `wimp` (только `src`, остальные поля null).
   * Идемпотентно по `src` (DELETE+INSERT).
   */
  create(src: string): Promise<Wimp>

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

export interface Store {
  readonly wimp: WimpApi
  readonly actor: ActorApi
  readonly topology: TopologyApi

  /**
   * Inbound API для приёма sync-патчей от других процессов.
   * Domain-код (Dark/Boundary/Bulk) должен использовать ORM-методы (`wimp.create`, `actor.create`, etc.),
   * не этот канал. `update` переводит JSON Patch в соответствующие SQL-операции.
   */
  update(message: StoreUpdateMessage): Promise<void>

  close(): Promise<void>
}
