import type { DbBackend } from "@metafor/db"
import { resolveMaybe } from ".."
import type { ViewStoreOrm } from "./view.t"

export const createViewStoreOrm = (backend: DbBackend): ViewStoreOrm => ({
  backend,
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
