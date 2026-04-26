import type { DbBackend, DbData, DbWimpRows, DbWimpEdgeRecord, DbWimpFieldRecord, DbFieldValueRecord, DbFieldSourceRecord, DbEntanglementFamilyRows } from "@metafor/db"
import { resolveMaybe } from ".."

export interface ViewStoreOrm {
    readonly backend: DbBackend
    dump(): DbData
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

export const createViewStoreOrm = (backend: DbBackend): ViewStoreOrm => ({
    backend,
    dump: () => backend.readData(),
    flush: () => backend.flush(),
    reset: async () => {
        await resolveMaybe(backend.reset())
    },
    wimpIds: () => backend.listWimpIds(),
    wimp: (wimpId) => backend.readWimpRows(wimpId),
    putWimp: async (rows) => {
        await resolveMaybe(backend.writeWimpRows(rows))
    },
    edge: (childWimpId) => backend.readWimpEdge(childWimpId),
    putEdge: async (row) => {
        await resolveMaybe(backend.writeWimpEdge(row))
    },
    field: (wimpFieldId) => backend.readWimpField(wimpFieldId),
    value: (wimpFieldId) => backend.readFieldValue(wimpFieldId),
    setValue: async (wimpFieldId, value) => {
        await resolveMaybe(backend.setFieldValue(wimpFieldId, value))
    },
    source: (childWimpFieldId) => backend.readFieldSource(childWimpFieldId),
    state: async (wimpId, metaStateId) => {
        await resolveMaybe(backend.setWimpState(wimpId, metaStateId))
    },
    entanglement: (entanglementId) => backend.readEntanglementFamily(entanglementId),
    putEntanglement: async (rows) => {
        await resolveMaybe(backend.writeEntanglementFamily(rows))
    },
    deleteEntanglement: async (entanglementId) => {
        await resolveMaybe(backend.deleteEntanglementFamily(entanglementId))
    },
})

