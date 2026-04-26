import { createMetaStoreOrm } from "./meta/meta"
import { createActorStoreOrm } from "./actor/actor"
import { createViewStoreOrm } from "./view"
import type { CreateMetaforStoreOptions, MetaforStore } from "./index.t"

export type { CreateMetaforStoreOptions, MetaforStore } from "./index.t"

export const resolveMaybe = async <T>(value: T | Promise<T>): Promise<T> => await value

export const createMetaforStore = ({
  metaBackend,
  viewBackend,
  actorBackend,
}: CreateMetaforStoreOptions): MetaforStore => {
  const meta = createMetaStoreOrm(metaBackend)
  const actor = createActorStoreOrm(actorBackend)
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
        actorBackend.close(),
        resolveMaybe(metaBackend.close()),
        metaBackend === viewBackend ? Promise.resolve() : resolveMaybe(viewBackend.close()),
      ])
    },
  }
}
