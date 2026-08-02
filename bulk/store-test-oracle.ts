import type {BulkRootPromotionReceipt} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {BulkStore} from "@metafor/types/bulk/store"
import type {MetaAddress} from "@metafor/types/metafor/graph"
import {buildBulkManifestation} from "./manifestation.ts"
import {buildBulkStore} from "./store.ts"
import {
  prepareBulkInitialVisual,
  type BulkReadyScene,
} from "./visual-initial.ts"

const projectionPromotionReceipt = (
  projection: BulkRuntimeProjection,
  receipt: BulkRootPromotionReceipt | null,
): BulkRootPromotionReceipt | null => {
  if (receipt === null) return null
  const target = projection.atoms.find(({wimp}) => wimp === receipt.promotedRootSrc)
  if (!target) return receipt
  let removedRootAtomId = receipt.removedRootAtomId
  const used = new Set(projection.atoms.map(({id}) => id))
  while (used.has(removedRootAtomId) || removedRootAtomId === target.id) removedRootAtomId++
  return {...receipt, removedRootAtomId, promotedAtomId: target.id}
}

/** Legacy manifestation/scene route, loaded only by explicit parity tests. */
export const composeBulkStoreTestOracleScene = (
  projection: BulkRuntimeProjection,
  rootSrc: MetaAddress,
  throughTs: number | null,
  promotionReceipt: BulkRootPromotionReceipt | null,
): BulkReadyScene => {
  const promotion = projectionPromotionReceipt(projection, promotionReceipt)
  const manifest = buildBulkManifestation(
    projection,
    promotion?.removedRootSrc ?? rootSrc,
    promotion,
  )
  return {
    kind: "bulk-ready-scene",
    version: 1,
    throughTs,
    rootSrc,
    visual: prepareBulkInitialVisual(manifest, projection),
  }
}

/** Materializes the former three-stage path for exact direct-writer parity. */
export const buildBulkStoreTestOracle = (
  projection: BulkRuntimeProjection,
  rootSrc: MetaAddress,
  promotionReceipt: BulkRootPromotionReceipt | null = null,
): BulkStore => {
  const promotion = projectionPromotionReceipt(projection, promotionReceipt)
  const manifest = buildBulkManifestation(
    projection,
    promotion?.removedRootSrc ?? rootSrc,
    promotion,
  )
  const visual = prepareBulkInitialVisual(manifest, projection).payload
  return buildBulkStore(manifest, visual)
}
