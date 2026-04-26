import type { DbActorStore, DbBackend } from "@metafor/db"
import type { ActorStoreOrm } from "./actor/actor.t"
import type { MetaStoreOrm } from "./meta/meta.t"
import type { ViewStoreOrm } from "./view/view.t"

export interface MetaforStore {
  meta: MetaStoreOrm
  actor: ActorStoreOrm
  view: ViewStoreOrm
  flush(): Promise<void>
  reset(): Promise<void>
  close(): Promise<void>
}

export interface CreateMetaforStoreOptions {
  metaBackend: DbBackend
  viewBackend: DbBackend
  actorBackend: DbActorStore
}
