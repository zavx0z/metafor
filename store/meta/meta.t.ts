import type { DbBackend, DbMetaRows } from "store/db"

export interface MetaStoreOrm {
  readonly backend: DbBackend
  get(metaId: string): Promise<DbMetaRows | null>
  put(rows: DbMetaRows): Promise<void>
  flush(): Promise<void>
  reset(): Promise<void>
}
