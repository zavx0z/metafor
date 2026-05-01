import type {Actor, ActorRecord, ActorRoots, AnyValue, ActorFieldValue} from "@store/actor"
import type {AnyTopology, TopologyRecord} from "@store/topology"
import type {DarkMetaParticleModel, Meta} from "@store/meta/sqlite"
import type {StoreUpdateMessage} from "./server.ts"

export interface MetaApi {
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
  get(uuid: string): Promise<Actor | null>

  head(uuid: string): Promise<ActorRecord | null>

  readonly roots: ActorRoots
  readonly value: ValueApi
  readonly link: LinkApi
}

export interface TopologyApi {
  get(uuid: string): Promise<AnyTopology | null>

  head(uuid: string): Promise<TopologyRecord | null>

  /** Topology-узлы, у которых parent_actor = actorUuid. */
  childrenOfActor(actorUuid: string): Promise<AnyTopology[]>
}

export interface Store {
  readonly meta: MetaApi
  readonly actor: ActorApi
  readonly topology: TopologyApi

  update(message: StoreUpdateMessage): Promise<void>

  close(): Promise<void>
}
