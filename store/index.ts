import type {
  DbBackend,
  DbActorStore,
} from "@metafor/db"
import { type MetaStoreOrm } from "./meta/meta.t"
import { createMetaStoreOrm } from "./meta/meta"
import { createActorStoreOrm } from "./actor/actor"
import { type ActorStoreOrm } from "./actor/actor.t"
import { createViewStoreOrm, type ViewStoreOrm } from "./view"

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
  actorRows: DbActorStore
}

export const resolveMaybe = async <T>(value: T | Promise<T>): Promise<T> => await value

export const createMetaforStore = ({
  metaBackend,
  viewBackend,
  actorRows,
}: CreateMetaforStoreOptions): MetaforStore => {
  const meta = createMetaStoreOrm(metaBackend)
  const actor = createActorStoreOrm(actorRows)
  const view = createViewStoreOrm(viewBackend)

  return {
    meta,
    actor,
    view,
    async flush() {
      await Promise.all([meta.flush(), view.flush()])
    },
    async reset() {
      await Promise.all([meta.reset(), view.reset()])
    },
    async close() {
      await Promise.all([
        actorRows.close(),
        resolveMaybe(metaBackend.close()),
        metaBackend === viewBackend ? Promise.resolve() : resolveMaybe(viewBackend.close()),
      ])
    },
  }
}
