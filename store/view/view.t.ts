import type {
  DbBackend,
  DbEntanglementFamilyRows,
  DbFieldSourceRecord,
  DbFieldValueRecord,
  DbWimpEdgeRecord,
  DbWimpFieldRecord,
  DbWimpRows,
} from "@metafor/db"

export interface ViewStoreOrm {
  readonly backend: DbBackend
  flush(): Promise<void>
  reset(): Promise<void>
  wimpIds(): Promise<string[]>
  wimp(wimpId: string): Promise<DbWimpRows | null>
  putWimp(rows: DbWimpRows): Promise<void>
  edge(childWimpId: string): Promise<DbWimpEdgeRecord | null>
  putEdge(row: DbWimpEdgeRecord): Promise<void>
  field(wimpFieldId: string): Promise<DbWimpFieldRecord | null>
  value(wimpFieldId: string): Promise<DbFieldValueRecord | null>
  setValue(wimpFieldId: string, value: unknown): Promise<void>
  source(childWimpFieldId: string): Promise<DbFieldSourceRecord | null>
  state(wimpId: string, metaStateId: string): Promise<void>
  entanglement(entanglementId: string): Promise<DbEntanglementFamilyRows | null>
  putEntanglement(rows: DbEntanglementFamilyRows): Promise<void>
  deleteEntanglement(entanglementId: string): Promise<void>
}
