import type { DbBackend, DbData, DbMetaRows } from "@metafor/db";


export interface MetaStoreOrm {
    readonly backend: DbBackend
    all(): DbData["metas"]
    get(metaId: string): Promise<DbMetaRows | null>
    put(rows: DbMetaRows): Promise<void>
    dump(): DbData
    flush(): Promise<void>
    reset(): Promise<void>
}
