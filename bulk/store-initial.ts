import type {
  BoundaryInitialProjection,
} from "@metafor/types/boundary/initial"
import type {BulkRootPromotionReceipt} from "@metafor/types/bulk/manifest"
import type {
  BulkStoreApplyControl,
  BulkStoreInitial,
} from "@metafor/types/bulk/store"
import type {ForceMessage} from "shared/protocol/force/message"
import {isBulkBrowserForceMessage} from "./browser-protocol.ts"
import {isBulkStoreInitial} from "./store.ts"
import {
  boundaryRowsRuntimeProjection,
  buildDirectBulkStore,
} from "./store-direct.ts"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const isBoundaryInitialProjection = (
  value: unknown,
): value is BoundaryInitialProjection =>
  isRecord(value) && value.version === 1 && Array.isArray(value.entries)

/**
 * Consumes one serialized Boundary RPC cut and immediately forms the wire
 * foundation of the same Store that will live in the browser.
 */
export const prepareBulkStoreInitial = (
  initial: BoundaryInitialProjection,
  session: string,
  promotion: BulkRootPromotionReceipt | null = null,
): Readonly<{
  initial: BulkStoreInitial
}> | null => {
  const runtime = boundaryRowsRuntimeProjection(initial.entries)
  const roots = runtime.atoms.filter((atom) =>
    atom.parentAtom === null && atom.parentTopology === null)
  const selected = promotion === null
    ? roots
    : roots.filter((atom) => atom.id === promotion.promotedAtomId)
  if (selected.length === 0) return null
  if (selected.length !== 1) {
    throw new Error(`Bulk Store requires one root Atom; received ${selected.length}`)
  }
  const result: BulkStoreInitial = {
    session,
    store: buildDirectBulkStore(runtime, selected[0]!.id),
  }
  if (!isBulkStoreInitial(result)) {
    throw new Error("Bulk initial RPC cut produced an invalid Store")
  }
  return {initial: result}
}

export const bulkStoreApplyControl = (
  message: ForceMessage,
): BulkStoreApplyControl | null => {
  const part = message.parts[0]
  if (part?.part === "graviton" && part.path === "bulk") return null
  return {control: "bulk.store.apply", message}
}

export const isBulkStoreApplyControl = (
  value: unknown,
): value is BulkStoreApplyControl =>
  isRecord(value) &&
  Object.keys(value).length === 2 &&
  value.control === "bulk.store.apply" &&
  isBulkBrowserForceMessage(value.message)
