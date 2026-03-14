/**
 * `@dark/weak` — mutation orchestrator topology-слоя поверх глобального `dark$`.
 */

import type { DarkStore } from "../store.t.ts"
import type { GravityStore } from "../gravity/store.t.ts"
import type { StrongIndexes } from "../strong/store.t.ts"
import type { LocalTopologyFragment } from "../../metafor/dsl/topology.t.ts"
import type {
  InsertFragmentAtPlacementOptions,
  InsertFragmentAtPlacementResult,
  MovePlacementOptions,
  MovePlacementResult,
  RebuildFragmentOptions,
  RebuildFragmentResult,
  RemovePlacementSubtreeOptions,
  RemovePlacementSubtreeResult,
  ReplaceFragmentOptions,
  ReplaceFragmentResult,
} from "./store.t.ts"
import { dark$ } from "../store.ts"
import { gravity$ } from "../gravity/store.ts"
import { strong$ } from "../strong/store.ts"
import { ingestFragment } from "../gravity/gravity.ts"
import {
  getPlacementIdsByMeta,
  removeEntanglementIndexes,
  removePlacementIndexes,
  removeReferenceIndexes,
} from "../strong/strong.ts"

function getDescendantPlacementIds(store: Pick<DarkStore, "placements" | "links">, rootPlacementId: string): string[] {
  const descendants: string[] = []
  const queue = [rootPlacementId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (!store.placements.get(currentId)) continue

    for (const [, link] of store.links.entries()) {
      if (link.from === currentId) {
        descendants.push(link.to)
        queue.push(link.to)
      }
    }
  }

  return descendants
}

function getSubtreePlacementIds(store: Pick<DarkStore, "placements" | "links">, rootPlacementId: string): string[] {
  return [rootPlacementId, ...getDescendantPlacementIds(store, rootPlacementId)]
}

function removePlacement(store$: DarkStore, placementId: string, indexes$: StrongIndexes = strong$): void {
  const placement = store$.getPlacement(placementId)
  if (!placement) return

  removePlacementIndexes(placement, placement.objectId, placement.meta, indexes$)
  store$.deletePlacement(placementId)

  for (const [linkId, link] of store$.links.entries()) {
    if (link.from === placementId || link.to === placementId) {
      store$.deleteLink(linkId)
    }
  }
}

function removeReference(store$: DarkStore, referenceId: string, indexes$: StrongIndexes = strong$): void {
  const reference = store$.getReference(referenceId)
  if (!reference) return

  removeReferenceIndexes(reference, reference.meta, indexes$)
  store$.deleteReference(referenceId)
}

function removeEntanglement(store$: DarkStore, entanglementId: string, indexes$: StrongIndexes = strong$): void {
  const entanglement = store$.getEntanglement(entanglementId)
  if (!entanglement) return

  removeEntanglementIndexes(entanglement, entanglement.meta, indexes$)
  store$.deleteEntanglement(entanglementId)
}

export function replaceFragment(
  meta: string,
  newFragment: LocalTopologyFragment,
  options: ReplaceFragmentOptions = {},
  store$: DarkStore = dark$,
  gravityState$: GravityStore = gravity$,
  indexes$: StrongIndexes = strong$,
): ReplaceFragmentResult {
  const result: ReplaceFragmentResult = {
    meta,
    rootPlacementIds: [],
    placementIds: [],
    referenceIds: [],
    entanglementIds: [],
    removedPlacementIds: [],
    removedReferenceIds: [],
    removedEntanglementIds: [],
  }

  const existingPlacementIds = getPlacementIdsByMeta(meta, indexes$)
  const allToRemove = new Set<string>()

  for (const placementId of existingPlacementIds) {
    const placement = store$.getPlacement(placementId)
    if (placement && !placement.parentId) {
      for (const subtreeId of getSubtreePlacementIds(store$, placementId)) {
        allToRemove.add(subtreeId)
      }
    }
  }

  for (const placementId of allToRemove) {
    if (store$.getPlacement(placementId)) {
      result.removedPlacementIds.push(placementId)
    }
    removePlacement(store$, placementId, indexes$)
  }

  for (const [referenceId, reference] of store$.references.entries()) {
    if (reference.meta === meta) {
      result.removedReferenceIds.push(referenceId)
      removeReference(store$, referenceId, indexes$)
    }
  }

  for (const [entanglementId, entanglement] of store$.entanglements.entries()) {
    if (entanglement.meta === meta) {
      result.removedEntanglementIds.push(entanglementId)
      removeEntanglement(store$, entanglementId, indexes$)
    }
  }

  const ingested = ingestFragment(meta, newFragment, options, store$, gravityState$, indexes$)
  result.rootPlacementIds = ingested.rootPlacementIds
  result.placementIds = ingested.placementIds
  result.referenceIds = ingested.referenceIds
  result.entanglementIds = ingested.entanglementIds

  return result
}

export function removePlacementSubtree(
  rootPlacementId: string,
  options: RemovePlacementSubtreeOptions = {},
  store$: DarkStore = dark$,
  indexes$: StrongIndexes = strong$,
): RemovePlacementSubtreeResult {
  const result: RemovePlacementSubtreeResult = {
    placementIds: [],
    referenceIds: [],
    entanglementIds: [],
    removedPlacementIds: [],
    removedReferenceIds: [],
    removedEntanglementIds: [],
  }

  const { cascadeReferences = true, cascadeEntanglements = true } = options
  const subtreeIds = getSubtreePlacementIds(store$, rootPlacementId)

  const relatedReferenceIds: string[] = []
  if (cascadeReferences) {
    for (const [referenceId, reference] of store$.references.entries()) {
      if (subtreeIds.includes(reference.placementId)) {
        relatedReferenceIds.push(referenceId)
      }
    }
  }

  const relatedEntanglementIds: string[] = []
  if (cascadeEntanglements) {
    for (const [entanglementId, entanglement] of store$.entanglements.entries()) {
      if (subtreeIds.includes(entanglement.placementId)) {
        relatedEntanglementIds.push(entanglementId)
      }
    }
  }

  for (const entanglementId of relatedEntanglementIds) {
    result.removedEntanglementIds.push(entanglementId)
    removeEntanglement(store$, entanglementId, indexes$)
  }

  for (const referenceId of relatedReferenceIds) {
    result.removedReferenceIds.push(referenceId)
    removeReference(store$, referenceId, indexes$)
  }

  for (const placementId of [...subtreeIds].reverse()) {
    result.removedPlacementIds.push(placementId)
    removePlacement(store$, placementId, indexes$)
  }

  return result
}

export function insertFragmentAtPlacement(
  parentPlacementId: string,
  fragment: LocalTopologyFragment,
  fragmentMeta: string,
  options: InsertFragmentAtPlacementOptions = {},
  store$: DarkStore = dark$,
  gravityState$: GravityStore = gravity$,
  indexes$: StrongIndexes = strong$,
): InsertFragmentAtPlacementResult {
  const ingested = ingestFragment(
    fragmentMeta,
    fragment,
    {
      parentPlacementId,
      ...options,
    },
    store$,
    gravityState$,
    indexes$,
  )

  return {
    placementIds: ingested.placementIds,
    referenceIds: ingested.referenceIds,
    entanglementIds: ingested.entanglementIds,
    removedPlacementIds: [],
    removedReferenceIds: [],
    removedEntanglementIds: [],
  }
}

export function movePlacement(
  placementId: string,
  options: MovePlacementOptions,
  store$: DarkStore = dark$,
  indexes$: StrongIndexes = strong$,
): MovePlacementResult {
  const result: MovePlacementResult = {
    movedPlacementId: placementId,
    newAddresses: new Map(),
    placementIds: [],
    referenceIds: [],
    entanglementIds: [],
    removedPlacementIds: [],
    removedReferenceIds: [],
    removedEntanglementIds: [],
  }

  const placement = store$.getPlacement(placementId)
  if (!placement) {
    throw new Error(`Placement ${placementId} не найден для перемещения.`)
  }

  const newParent = store$.getPlacement(options.newParentPlacementId)
  if (!newParent) {
    throw new Error(`Parent placement ${options.newParentPlacementId} не найден.`)
  }

  placement.parentId = options.newParentPlacementId
  placement.relation = "contains"

  for (const [, link] of store$.links.entries()) {
    if (link.to === placementId) {
      link.from = options.newParentPlacementId
      link.relation = "contains"
      break
    }
  }

  if (options.rebuildAddresses !== false) {
    result.newAddresses = remapPlacementAddresses(placementId, newParent.address, store$, indexes$)
  }

  return result
}

export function rebuildFragment(
  meta: string,
  options: RebuildFragmentOptions = {},
  indexes$: Pick<StrongIndexes, "sourceMetaIndex"> = strong$,
): RebuildFragmentResult {
  void options
  return {
    placementIds: getPlacementIdsByMeta(meta, indexes$),
    referenceIds: [],
    entanglementIds: [],
    removedPlacementIds: [],
    removedReferenceIds: [],
    removedEntanglementIds: [],
  }
}

export function detachSubtree(
  placementId: string,
  store$: DarkStore = dark$,
): string[] {
  const placement = store$.getPlacement(placementId)
  if (!placement) return []

  for (const [linkId, link] of store$.links.entries()) {
    if (link.to === placementId) {
      store$.deleteLink(linkId)
      break
    }
  }

  delete placement.parentId

  return getSubtreePlacementIds(store$, placementId)
}

export function remapPlacementAddresses(
  rootPlacementId: string,
  newAddressPrefix: string,
  store$: DarkStore = dark$,
  indexes$: StrongIndexes = strong$,
): Map<string, string> {
  const addressMap = new Map<string, string>()
  const root = store$.getPlacement(rootPlacementId)
  if (!root) return addressMap

  const oldPrefix = root.address
  root.address = newAddressPrefix
  addressMap.set(oldPrefix, newAddressPrefix)

  indexes$.placementAddressIndex.delete(oldPrefix)
  indexes$.placementAddressIndex.set(newAddressPrefix, root.id)

  const descendants = getDescendantPlacementIds(store$, rootPlacementId)
  for (const descId of descendants) {
    const desc = store$.getPlacement(descId)
    if (!desc) continue

    const oldDescAddress = desc.address
    const newDescAddress = desc.address.replace(oldPrefix, newAddressPrefix)
    desc.address = newDescAddress

    indexes$.placementAddressIndex.delete(oldDescAddress)
    indexes$.placementAddressIndex.set(newDescAddress, desc.id)
    addressMap.set(oldDescAddress, newDescAddress)
  }

  const subtreeIds = [rootPlacementId, ...descendants]
  for (const [, reference] of store$.references.entries()) {
    if (subtreeIds.includes(reference.placementId)) {
      const oldRefAddress = reference.address
      const newRefAddress = reference.address.replace(oldPrefix, newAddressPrefix)
      reference.address = newRefAddress
      addressMap.set(oldRefAddress, newRefAddress)
    }
  }

  for (const [, entanglement] of store$.entanglements.entries()) {
    if (subtreeIds.includes(entanglement.placementId)) {
      const oldEntAddress = entanglement.topologyAddress
      const newEntAddress = entanglement.topologyAddress.replace(oldPrefix, newAddressPrefix)
      entanglement.topologyAddress = newEntAddress

      const oldEntanglementAddress = entanglement.entanglementAddress
      entanglement.entanglementAddress = `ent:${entanglement.objectId}@${newEntAddress}`

      indexes$.entanglementAddressIndex.delete(oldEntanglementAddress)
      indexes$.entanglementAddressIndex.set(entanglement.entanglementAddress, entanglement.id)
      addressMap.set(oldEntAddress, newEntAddress)
    }
  }

  return addressMap
}
