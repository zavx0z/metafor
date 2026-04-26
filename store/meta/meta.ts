import type { DbBackend } from "@metafor/db"
import type { MetaStoreOrm } from "./meta.t"
import { resolveMaybe } from ".."

export const createMetaStoreOrm = (backend: DbBackend): MetaStoreOrm => ({
    backend,
    all: () => backend.readData().metas,
    get: (metaId) => backend.readMetaRows(metaId),
    put: async (rows) => {
        await resolveMaybe(backend.writeMetaRows(rows))
    },
    dump: () => backend.readData(),
    flush: () => backend.flush(),
    reset: async () => {
        await resolveMaybe(backend.reset())
    },
})
