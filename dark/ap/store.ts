import type {
  GlobalTopologyEntanglement,
  GlobalTopologyIngestOptions,
  GlobalTopologyIngestResult,
  GlobalTopologyLink,
  GlobalTopologyMetaIndex,
  GlobalTopologyObject,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
  GlobalTopologySnapshot,
  GlobalTopologyStore,
} from "./store.t"
import type { LocalTopologyFragment, LocalTopologyPlacementRelation } from "../../metafor/dsl/topology.t.ts"

function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

function cloneMapValues<T>(source: ReadonlyMap<string, T>): Map<string, T> {
  return new Map(Array.from(source, ([key, value]) => [key, cloneValue(value)]))
}

function cloneStringArrayMap(source: ReadonlyMap<string, string[]>): Map<string, string[]> {
  return new Map(Array.from(source, ([key, value]) => [key, [...value]]))
}

function cloneMetaIndexMap(source: ReadonlyMap<string, GlobalTopologyMetaIndex>): Map<string, GlobalTopologyMetaIndex> {
  return new Map(
    Array.from(source, ([key, value]) => [
      key,
      {
        objectIds: [...value.objectIds],
        placementIds: [...value.placementIds],
        referenceIds: [...value.referenceIds],
        entanglementIds: [...value.entanglementIds],
      },
    ]),
  )
}

function appendUnique(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value)
}

function ensureMetaIndex(store: GlobalTopologyStore, meta: string): GlobalTopologyMetaIndex {
  const existing = store.sourceMetaIndex.get(meta)
  if (existing) return existing

  const created: GlobalTopologyMetaIndex = {
    objectIds: [],
    placementIds: [],
    referenceIds: [],
    entanglementIds: [],
  }
  store.sourceMetaIndex.set(meta, created)
  return created
}

function makeObjectId(meta: string, localObjectId: string): string {
  return `${meta}#${localObjectId}`
}

function makePlacementId(store: GlobalTopologyStore): string {
  const id = `gp${store.nextPlacementSeq}`
  store.nextPlacementSeq += 1
  return id
}

function makeLinkId(store: GlobalTopologyStore): string {
  const id = `gl${store.nextLinkSeq}`
  store.nextLinkSeq += 1
  return id
}

function makeReferenceId(store: GlobalTopologyStore): string {
  const id = `gr${store.nextReferenceSeq}`
  store.nextReferenceSeq += 1
  return id
}

function sanitizeMetaSegment(meta: string): string {
  return meta.replace(/[^A-Za-z0-9_-]+/g, "-")
}

function ensureRootPrefix(store: GlobalTopologyStore, meta: string): string {
  const prefix = `/w:${sanitizeMetaSegment(meta)}-${store.rootOccurrenceSeq}`
  store.rootOccurrenceSeq += 1
  return prefix
}

function ensureObjectDefinitions(store: GlobalTopologyStore, meta: string, fragment: LocalTopologyFragment): void {
  const metaIndex = ensureMetaIndex(store, meta)
  for (const [localObjectId, definition] of Object.entries(fragment.objects as Record<string, any>)) {
    const objectId = makeObjectId(meta, localObjectId)
    if (store.objects.has(objectId)) continue

    const object: GlobalTopologyObject = {
      id: objectId,
      meta,
      localObjectId,
      kind: definition.kind,
      definition: cloneValue(definition),
    }

    store.objects.set(objectId, object)
    appendUnique(metaIndex.objectIds, objectId)
  }
}

export const topology$: GlobalTopologyStore = {
  fragments: new Map(),
  objects: new Map(),
  placements: new Map(),
  links: new Map(),
  references: new Map(),
  entanglements: new Map(),
  placementAddressIndex: new Map(),
  entanglementAddressIndex: new Map(),
  objectPlacementsIndex: new Map(),
  sourceMetaIndex: new Map(),
  metaSourceLookup: new Map(),
  nextPlacementSeq: 0,
  nextLinkSeq: 0,
  nextReferenceSeq: 0,
  rootOccurrenceSeq: 0,

  reset() {
    this.fragments = new Map()
    this.objects = new Map()
    this.placements = new Map()
    this.links = new Map()
    this.references = new Map()
    this.entanglements = new Map()
    this.placementAddressIndex = new Map()
    this.entanglementAddressIndex = new Map()
    this.objectPlacementsIndex = new Map()
    this.sourceMetaIndex = new Map()
    this.metaSourceLookup = new Map()
    this.nextPlacementSeq = 0
    this.nextLinkSeq = 0
    this.nextReferenceSeq = 0
    this.rootOccurrenceSeq = 0
  },

  restore(snapshot) {
    this.fragments = cloneMapValues(snapshot.fragments)
    this.objects = cloneMapValues(snapshot.objects)
    this.placements = cloneMapValues(snapshot.placements)
    this.links = cloneMapValues(snapshot.links)
    this.references = cloneMapValues(snapshot.references)
    this.entanglements = cloneMapValues(snapshot.entanglements)
    this.placementAddressIndex = new Map(snapshot.placementAddressIndex)
    this.entanglementAddressIndex = new Map(snapshot.entanglementAddressIndex)
    this.objectPlacementsIndex = cloneStringArrayMap(snapshot.objectPlacementsIndex)
    this.sourceMetaIndex = cloneMetaIndexMap(snapshot.sourceMetaIndex)
    this.metaSourceLookup = cloneStringArrayMap(snapshot.metaSourceLookup)
    this.nextPlacementSeq = snapshot.nextPlacementSeq
    this.nextLinkSeq = snapshot.nextLinkSeq
    this.nextReferenceSeq = snapshot.nextReferenceSeq
    this.rootOccurrenceSeq = snapshot.rootOccurrenceSeq
  },

  snapshot(): GlobalTopologySnapshot {
    return {
      fragments: cloneMapValues(this.fragments),
      objects: cloneMapValues(this.objects),
      placements: cloneMapValues(this.placements),
      links: cloneMapValues(this.links),
      references: cloneMapValues(this.references),
      entanglements: cloneMapValues(this.entanglements),
      placementAddressIndex: new Map(this.placementAddressIndex),
      entanglementAddressIndex: new Map(this.entanglementAddressIndex),
      objectPlacementsIndex: cloneStringArrayMap(this.objectPlacementsIndex),
      sourceMetaIndex: cloneMetaIndexMap(this.sourceMetaIndex),
      metaSourceLookup: cloneStringArrayMap(this.metaSourceLookup),
      nextPlacementSeq: this.nextPlacementSeq,
      nextLinkSeq: this.nextLinkSeq,
      nextReferenceSeq: this.nextReferenceSeq,
      rootOccurrenceSeq: this.rootOccurrenceSeq,
    }
  },

  setFragment(meta, fragment) {
    const next = cloneValue(fragment)
    this.fragments.set(meta, next)
    return next
  },

  getFragment(meta) {
    return this.fragments.get(meta)
  },

  ingestFragment(meta, fragment, options = {} as GlobalTopologyIngestOptions): GlobalTopologyIngestResult {
    this.setFragment(meta, fragment)
    ensureObjectDefinitions(this, meta, fragment)

    const metaIndex = ensureMetaIndex(this, meta)
    const localPlacements = Object.values(fragment.placements).sort((left, right) => left.address.length - right.address.length)
    const localToGlobalPlacement = new Map<string, string>()
    const localToGlobalReference = new Map<string, string>()
    const rootPrefix = options.parentPlacementId ? null : ensureRootPrefix(this, meta)
    const rootPlacementIds: string[] = []
    const placementIds: string[] = []
    const referenceIds: string[] = []
    const entanglementIds: string[] = []

    for (const localPlacement of localPlacements) {
      const objectId = makeObjectId(meta, localPlacement.objectId)
      const placementId = makePlacementId(this)

      let address: string
      let parentId: string | undefined
      let relation = localPlacement.relation

      if (localPlacement.parentId) {
        parentId = localToGlobalPlacement.get(localPlacement.parentId)
        if (!parentId) {
          throw new Error(`Не найден global parent placement для ${localPlacement.parentId}.`)
        }
        const parentPlacement = this.placements.get(parentId)
        const localParent = fragment.placements[localPlacement.parentId]
        if (!parentPlacement || !localParent) {
          throw new Error(`Не удалось перевести local topology address ${localPlacement.address}.`)
        }
        const suffix = localPlacement.address.slice(localParent.address.length)
        address = `${parentPlacement.address}${suffix}`
      } else if (options.parentPlacementId) {
        const parentPlacement = this.placements.get(options.parentPlacementId)
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

      this.placements.set(placementId, placement)
      this.placementAddressIndex.set(address, placementId)
      localToGlobalPlacement.set(localPlacement.id, placementId)
      placementIds.push(placementId)
      appendUnique(metaIndex.placementIds, placementId)

      const objectPlacements = this.objectPlacementsIndex.get(objectId) ?? []
      appendUnique(objectPlacements, placementId)
      this.objectPlacementsIndex.set(objectId, objectPlacements)

      if (!parentId) {
        rootPlacementIds.push(placementId)
      } else {
        const linkId = makeLinkId(this)
        const link: GlobalTopologyLink = {
          id: linkId,
          from: parentId,
          to: placementId,
          relation: relation as Exclude<LocalTopologyPlacementRelation, "root">,
        }
        this.links.set(linkId, link)
      }
    }

    for (const localReference of fragment.references) {
      const placementId = localToGlobalPlacement.get(localReference.placementId)
      if (!placementId) {
        throw new Error(`Не найден global placement для reference ${localReference.id}.`)
      }

      const placement = this.placements.get(placementId)!
      const referenceId = makeReferenceId(this)
      const address = `${placement.address}@ref:${localReference.id}`
      const reference: GlobalTopologyReference = {
        id: referenceId,
        meta,
        localReferenceId: localReference.id,
        placementId,
        objectId: makeObjectId(meta, localReference.objectId),
        address,
        src: localReference.src,
        via: localReference.via,
        ...(localReference.field ? { field: localReference.field } : {}),
        ...(localReference.value !== undefined ? { value: localReference.value } : {}),
      }

      this.references.set(referenceId, reference)
      localToGlobalReference.set(localReference.id, referenceId)
      referenceIds.push(referenceId)
      appendUnique(metaIndex.referenceIds, referenceId)

      const bySource = this.metaSourceLookup.get(reference.src) ?? []
      appendUnique(bySource, referenceId)
      this.metaSourceLookup.set(reference.src, bySource)
    }

    for (const seed of fragment.entanglementSeeds) {
      const placementId = localToGlobalPlacement.get(seed.placementId)
      if (!placementId) {
        throw new Error(`Не найден global placement для entanglement seed ${seed.placementId}.`)
      }

      const placement = this.placements.get(placementId)!
      const objectId = makeObjectId(meta, seed.objectId)
      const entanglementAddress = `ent:${objectId}@${placement.address}`
      const entanglementId = entanglementAddress
      const entanglement: GlobalTopologyEntanglement = {
        id: entanglementId,
        meta,
        placementId,
        objectId,
        topologyAddress: placement.address,
        entanglementAddress,
        dataPaths: [...seed.dataPaths],
        referenceIds: seed.referenceIds.map((localReferenceId) => localToGlobalReference.get(localReferenceId)).filter(Boolean) as string[],
        seed: cloneValue(seed),
      }

      this.entanglements.set(entanglementId, entanglement)
      this.entanglementAddressIndex.set(entanglementAddress, entanglementId)
      entanglementIds.push(entanglementId)
      appendUnique(metaIndex.entanglementIds, entanglementId)
    }

    return {
      meta,
      rootPlacementIds,
      placementIds,
      referenceIds,
      entanglementIds,
    }
  },

  getObject(id) {
    return this.objects.get(id)
  },

  getPlacement(id) {
    return this.placements.get(id)
  },

  getPlacementByAddress(address) {
    const placementId = this.placementAddressIndex.get(address)
    return placementId ? this.placements.get(placementId) : undefined
  },

  getPlacementsByObject(objectId) {
    const placementIds = this.objectPlacementsIndex.get(objectId) ?? []
    return placementIds.map((id) => this.placements.get(id)).filter(Boolean) as GlobalTopologyPlacement[]
  },

  getPlacementsByMeta(meta) {
    const placementIds = this.sourceMetaIndex.get(meta)?.placementIds ?? []
    return placementIds.map((id) => this.placements.get(id)).filter(Boolean) as GlobalTopologyPlacement[]
  },

  getChildren(parentPlacementId) {
    return Array.from(this.placements.values()).filter((placement) => placement.parentId === parentPlacementId)
  },

  getReference(id) {
    return this.references.get(id)
  },

  getReferencesBySource(metaSource) {
    const referenceIds = this.metaSourceLookup.get(metaSource) ?? []
    return referenceIds.map((id) => this.references.get(id)).filter(Boolean) as GlobalTopologyReference[]
  },

  getEntanglement(id) {
    return this.entanglements.get(id)
  },

  getEntanglementByAddress(address) {
    const entanglementId = this.entanglementAddressIndex.get(address)
    return entanglementId ? this.entanglements.get(entanglementId) : undefined
  },
}
