/**
 * `@dark/gravity/gravity` — orchestrator hidden world assembly.
 *
 * Канонический graph пишет в `dark$`, промежуточное gravity-состояние
 * держит `gravity$`, индексы пишет `strong$`.
 */

import type {
  GlobalTopologyEntanglement,
  GlobalTopologyIngestOptions,
  GlobalTopologyIngestResult,
  GlobalTopologyLink,
  GlobalTopologyObject,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
} from "./store.t.ts"
import type { DarkStore } from "../store.t.ts"
import type { GravityStore } from "./store.t.ts"
import type { StrongIndexes } from "../strong/store.t.ts"
import type { LocalTopologyFragment, LocalTopologyPlacementRelation } from "../../metafor/dsl/topology.t.ts"
import { dark$ } from "../store.ts"
import { gravity$ } from "./store.ts"
import { strong$ } from "../strong/store.ts"
import { cloneStoredValue } from "../snapshot.ts"
import { indexEntanglement, indexObject, indexPlacement, indexReference } from "../strong/strong.ts"

function makeObjectId(meta: string, localObjectId: string): string {
  return `${meta}#${localObjectId}`
}

function makePlacementId(store$: GravityStore): string {
  const id = `gp${store$.nextPlacementSeq}`
  store$.nextPlacementSeq += 1
  return id
}

function makeLinkId(store$: GravityStore): string {
  const id = `gl${store$.nextLinkSeq}`
  store$.nextLinkSeq += 1
  return id
}

function makeReferenceId(store$: GravityStore): string {
  const id = `gr${store$.nextReferenceSeq}`
  store$.nextReferenceSeq += 1
  return id
}

function sanitizeMetaSegment(meta: string): string {
  return meta.replace(/[^A-Za-z0-9_-]+/g, "-")
}

function ensureRootPrefix(store$: GravityStore, meta: string): string {
  const prefix = `/w:${sanitizeMetaSegment(meta)}-${store$.rootOccurrenceSeq}`
  store$.rootOccurrenceSeq += 1
  return prefix
}

function ensureObjectDefinitions(
  store$: DarkStore,
  indexes$: StrongIndexes,
  meta: string,
  fragment: LocalTopologyFragment,
): void {
  for (const [localObjectId, definition] of Object.entries(fragment.objects as Record<string, any>)) {
    const objectId = makeObjectId(meta, localObjectId)
    if (store$.getObject(objectId)) continue

    const object: GlobalTopologyObject = {
      id: objectId,
      meta,
      localObjectId,
      kind: definition.kind,
      definition: cloneStoredValue(definition),
    }

    store$.setObject(objectId, object)
    indexObject(objectId, meta, indexes$)
  }
}

export function ingestFragment(
  meta: string,
  fragment: LocalTopologyFragment,
  options: GlobalTopologyIngestOptions = {},
  store$: DarkStore = dark$,
  gravityState$: GravityStore = gravity$,
  indexes$: StrongIndexes = strong$,
): GlobalTopologyIngestResult {
  gravityState$.setFragment(meta, fragment)
  ensureObjectDefinitions(store$, indexes$, meta, fragment)

  const localPlacements = Object.values(fragment.placements).sort(
    (left, right) => left.address.length - right.address.length,
  )
  const localToGlobalPlacement = new Map<string, string>()
  const localToGlobalReference = new Map<string, string>()
  const rootPrefix = options.parentPlacementId ? null : ensureRootPrefix(gravityState$, meta)
  const rootPlacementIds: string[] = []
  const placementIds: string[] = []
  const referenceIds: string[] = []
  const entanglementIds: string[] = []

  for (const localPlacement of localPlacements) {
    const objectId = makeObjectId(meta, localPlacement.objectId)
    const placementId = makePlacementId(gravityState$)

    let address: string
    let parentId: string | undefined
    let relation = localPlacement.relation

    if (localPlacement.parentId) {
      parentId = localToGlobalPlacement.get(localPlacement.parentId)
      if (!parentId) {
        throw new Error(`Не найден global parent placement для ${localPlacement.parentId}.`)
      }
      const parentPlacement = store$.getPlacement(parentId)
      const localParent = fragment.placements[localPlacement.parentId]
      if (!parentPlacement || !localParent) {
        throw new Error(`Не удалось перевести local topology address ${localPlacement.address}.`)
      }
      const suffix = localPlacement.address.slice(localParent.address.length)
      address = `${parentPlacement.address}${suffix}`
    } else if (options.parentPlacementId) {
      const parentPlacement = store$.getPlacement(options.parentPlacementId)
      if (!parentPlacement) {
        throw new Error(`Не найден stitch parent placement ${options.parentPlacementId}.`)
      }
      address = `${parentPlacement.address}${localPlacement.address}`
      parentId = options.parentPlacementId
      relation = "contains"
    } else {
      address = `${rootPrefix}${localPlacement.address}`
    }

    const placement: GlobalTopologyPlacement = {
      id: placementId,
      meta,
      objectId,
      localPlacementId: localPlacement.id,
      localAddress: localPlacement.address,
      address,
      relation,
      ...(parentId ? { parentId } : {}),
      ...(options.viaReferenceId ? { viaReferenceId: options.viaReferenceId } : {}),
    }

    store$.setPlacement(placementId, placement)
    indexPlacement(placement, meta, indexes$)

    localToGlobalPlacement.set(localPlacement.id, placementId)
    placementIds.push(placementId)

    if (!parentId) {
      rootPlacementIds.push(placementId)
    } else {
      const linkId = makeLinkId(gravityState$)
      const link: GlobalTopologyLink = {
        id: linkId,
        from: parentId,
        to: placementId,
        relation: relation as Exclude<LocalTopologyPlacementRelation, "root">,
      }
      store$.setLink(linkId, link)
    }
  }

  for (const localReference of fragment.references) {
    const placementId = localToGlobalPlacement.get(localReference.placementId)
    if (!placementId) {
      throw new Error(`Не найден global placement для reference ${localReference.id}.`)
    }

    const placement = store$.getPlacement(placementId)
    if (!placement) {
      throw new Error(`Placement ${placementId} не найден для reference ${localReference.id}.`)
    }

    const referenceId = makeReferenceId(gravityState$)
    const reference: GlobalTopologyReference = {
      id: referenceId,
      meta,
      localReferenceId: localReference.id,
      placementId,
      objectId: makeObjectId(meta, localReference.objectId),
      address: `${placement.address}@ref:${localReference.id}`,
      src: localReference.src,
      via: localReference.via,
      ...(localReference.field ? { field: localReference.field } : {}),
      ...(localReference.value !== undefined ? { value: localReference.value } : {}),
    }

    store$.setReference(referenceId, reference)
    localToGlobalReference.set(localReference.id, referenceId)
    referenceIds.push(referenceId)
    indexReference(reference, meta, indexes$)
  }

  for (const seed of fragment.entanglementSeeds) {
    const placementId = localToGlobalPlacement.get(seed.placementId)
    if (!placementId) {
      throw new Error(`Не найден global placement для entanglement seed ${seed.placementId}.`)
    }

    const placement = store$.getPlacement(placementId)
    if (!placement) {
      throw new Error(`Placement ${placementId} не найден для entanglement seed ${seed.placementId}.`)
    }

    const objectId = makeObjectId(meta, seed.objectId)
    const entanglementAddress = `ent:${objectId}@${placement.address}`
    const entanglement: GlobalTopologyEntanglement = {
      id: entanglementAddress,
      meta,
      placementId,
      objectId,
      topologyAddress: placement.address,
      entanglementAddress,
      dataPaths: [...seed.dataPaths],
      referenceIds: seed.referenceIds
        .map((localReferenceId) => localToGlobalReference.get(localReferenceId))
        .filter(Boolean) as string[],
      seed: cloneStoredValue(seed),
    }

    store$.setEntanglement(entanglement.id, entanglement)
    indexEntanglement(entanglement, meta, indexes$)
    entanglementIds.push(entanglement.id)
  }

  return {
    meta,
    rootPlacementIds,
    placementIds,
    referenceIds,
    entanglementIds,
  }
}
