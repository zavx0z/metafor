import {
  BULK_STORE_FLAG_ACTIVE,
  BULK_STORE_FLAG_CURRENT,
  BULK_STORE_FLAG_REMOVED,
  BULK_STORE_FLAG_RETURNING,
  BULK_STORE_FLAG_TORUS,
  BULK_STORE_LINE_MATERIAL_STRIDE,
  BULK_STORE_LAYOUT_OUTSIDE_IN,
  BULK_STORE_QUANTUM_MATERIAL_STRIDE,
  type BulkStore,
  type BulkStoreNumericArray,
} from "@metafor/types/bulk/store"
import {
  visualCausalMaterial,
  visualConditionFieldMaterial,
  visualCoreFieldMaterial,
  visualContextTorusMaterial,
  visualDarkParticleColor,
  visualFieldProxyMaterial,
  visualFieldParticleColor,
  visualProcessTorusMaterial,
  visualOrbitalParticleColor,
  visualRelationColor,
  visualRelationMaterial,
  visualStateTorusMaterial,
  visualTransitionMaterial,
  type VisualLineMaterial,
  type VisualQuantumMaterial,
} from "@metafor/visual/layout/centered-nested"
import {
  buildStateGraphBranchLayoutFromIndex,
  buildStateGraphFromFacts,
  describeHermiteEdgeCurve,
  describeStateGraphHermiteEdgeCurve,
  indexStateGraphLayout,
  layoutFieldsInPseudoCircle,
  packStateSleeves,
  prepareStateLayout,
  resolveContentTorusForm,
  stateGraphFieldSphereLayout,
  stateGraphNodeFormDimensions,
  stateNodeSurfaceGap,
  STATE_GRAPH_PRODUCTION_SIZING,
  TORUS_LAYOUT_BASELINE,
  torusFieldRadiusAtLevel,
  torusLevelScale,
  type PreparedStateLayout,
  type StateGraphRootLayout,
  type StateSleevePackingEnvelope,
} from "@metafor/visual/layout/centered-nested"
import type {BulkRelationChannel} from "@metafor/types/bulk/manifest"
import type {
  BulkRuntimeCondition,
  BulkRuntimeField,
  BulkRuntimeState,
  BulkRuntimeTransition,
} from "@metafor/types/bulk/runtime"
import {
  resolveCanonicalForceFieldsPayload,
  resolveForceFieldId,
  resolveForceFieldsPayload,
} from "shared/protocol/force/fields"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import {
  BULK_STORE_BATCH_KIND,
  BULK_STORE_DARK_KIND,
  BULK_STORE_ENDPOINT_KIND,
  BULK_STORE_FIELD_KIND,
  BULK_STORE_ORBITAL_KIND,
  BULK_STORE_RELATION_KIND,
} from "./store.ts"
import {
  layoutCenteredNestedStoreFields,
  type BulkStoreFieldPlacement,
} from "./store-field-layout.ts"

export type BulkStoreRenderer = Readonly<{
  darkAdded?(slot: number): void
  darkChanged?(slot: number): void
  darkRemoved?(id: number): void
  orbitalAdded?(slot: number): void
  orbitalRemoved?(id: number): void
  proxyAdded?(slot: number): void
  proxyRemoved?(id: number): void
  fieldAliasesRegrouped(
    aliasSlots: readonly number[],
    fieldSlots: readonly number[],
    removedFieldSlots: readonly number[],
    darkSlots: readonly number[],
    orbitalSlots: readonly number[],
    proxySlots: readonly number[],
  ): void
  orbitalMaterialChanged(slot: number): void
  proxyMaterialChanged(slot: number): void
  transitionBatchChanged(batchId: number): void
  relationBatchChanged(batchId: number): void
  force(part: Particle): void
}>

export const NOOP_BULK_STORE_RENDERER: BulkStoreRenderer = Object.freeze({
  darkAdded() {},
  darkChanged() {},
  darkRemoved() {},
  orbitalAdded() {},
  orbitalRemoved() {},
  proxyAdded() {},
  proxyRemoved() {},
  fieldAliasesRegrouped() {},
  orbitalMaterialChanged() {},
  proxyMaterialChanged() {},
  transitionBatchChanged() {},
  relationBatchChanged() {},
  force() {},
})

type BulkStoreRuntime = {
  aliasHeadByAtom: Int32Array
  aliasNext: Int32Array
  aliasSlotsByField: Map<number, Set<number>>
  aliasSlotsByMarker: Map<number, Set<number>>
  aliasSlotsByValue: Map<number, Set<number>>
  batchHeadByOwner: Int32Array
  batchNext: Int32Array
  darkChildHead: Int32Array
  darkChildNext: Int32Array
  darkDepthById: Int32Array
  darkSlotById: Int32Array
  atomDarkSlotsByWimp: Map<number, Set<number>>
  fieldSlotsByOwner: Map<number, Set<number>>
  orbitalHeadByOwner: Int32Array
  orbitalNext: Int32Array
  orbitalSlotById: Int32Array
  proxyHeadByOwner: Int32Array
  proxyNext: Int32Array
  relationHeadByAlias: Int32Array
  relationHeadByOwner: Int32Array
  relationNextA: Int32Array
  relationNextB: Int32Array
  relationNextOwner: Int32Array
  transitionHeadByOwner: Int32Array
  transitionNext: Int32Array
  transitionSlotsByBatch: Map<number, Set<number>>
  relationSlotsByBatch: Map<number, Set<number>>
  relationSlotsByEndpoint: Array<Map<number, Set<number>>>
  fieldSourceSlotById: Int32Array
  fieldSourceSlotsByWimp: Map<number, Set<number>>
  stateSourceSlotById: Int32Array
  stateSourceSlotsByWimp: Map<number, Set<number>>
  transitionSourceSlotById: Int32Array
  transitionSourceSlotsByWimp: Map<number, Set<number>>
  conditionSourceSlotById: Int32Array
  conditionSourceSlotsByTransition: Map<number, Set<number>>
  processSourceSlotById: Int32Array
  processSourceSlotsByWimp: Map<number, Set<number>>
  reactionSourceSlotById: Int32Array
  reactionSourceSlotsByWimp: Map<number, Set<number>>
  stateOccurrenceIndexedOwners: Set<number>
  stateOrbitalSlotByKey: Map<string, number>
  stateOrbitalKeyById: Map<number, string>
  textSlotByValue: Map<string, number>
  wimpSlotBySrc: Map<string, number>
}

const runtimeSymbol = Symbol("Bulk Store runtime")
type ActiveBulkStore = BulkStore & {[runtimeSymbol]?: BulkStoreRuntime}

const int32 = (length: number): Int32Array => {
  const result = new Int32Array(length)
  result.fill(-1)
  return result
}

const maxId = (values: BulkStoreNumericArray): number =>
  values.length === 0 ? 0 : Math.max(...values)

const directSlots = (ids: BulkStoreNumericArray): Int32Array => {
  const slots = int32(maxId(ids) + 1)
  for (let slot = 0; slot < ids.length; slot++) slots[ids[slot]!] = slot
  return slots
}

const ownerList = (
  owners: BulkStoreNumericArray,
): {head: Int32Array; next: Int32Array} => {
  const head = int32(maxId(owners) + 1)
  const next = int32(owners.length)
  for (let slot = owners.length - 1; slot >= 0; slot--) {
    const owner = owners[slot]!
    next[slot] = head[owner] ?? -1
    head[owner] = slot
  }
  return {head, next}
}

const slotGroups = (
  count: number,
  key: (slot: number) => number,
  include: (slot: number) => boolean = () => true,
): Map<number, Set<number>> => {
  const result = new Map<number, Set<number>>()
  for (let slot = 0; slot < count; slot++) {
    if (!include(slot)) continue
    const id = key(slot)
    const held = result.get(id)
    if (held) held.add(slot)
    else result.set(id, new Set([slot]))
  }
  return result
}

const indexes = (store: BulkStore): BulkStoreRuntime => {
  const held = (store as ActiveBulkStore)[runtimeSymbol]
  if (held) return held
  const aliasOwners = Array.from(store.fieldAlias.atom)
  const aliasList = ownerList(aliasOwners)
  const orbitalList = ownerList(store.orbital.owner)
  const proxyList = ownerList(store.proxy.owner)
  const transitionList = ownerList(store.transition.owner)
  const batchList = ownerList(store.batch.owner)
  const darkSlotById = directSlots(store.dark.id)
  const darkChildHead = int32(maxId(store.dark.id) + 1)
  const darkChildNext = int32(store.dark.id.length)
  for (let slot = store.dark.id.length - 1; slot >= 0; slot--) {
    const parent = store.dark.parent[slot]!
    if (parent === 0) continue
    darkChildNext[slot] = darkChildHead[parent] ?? -1
    darkChildHead[parent] = slot
  }
  const relationHeadByAlias = int32(store.fieldAlias.id.length + 1)
  const relationOwnerList = ownerList(store.relation.owner)
  const relationNextA = int32(store.relation.id.length)
  const relationNextB = int32(store.relation.id.length)
  for (let slot = store.relation.id.length - 1; slot >= 0; slot--) {
    if (store.relation.aKind[slot] === BULK_STORE_ENDPOINT_KIND.field) {
      const alias = store.relation.a[slot]!
      relationNextA[slot] = relationHeadByAlias[alias] ?? -1
      relationHeadByAlias[alias] = slot
    }
    if (store.relation.bKind[slot] === BULK_STORE_ENDPOINT_KIND.field) {
      const alias = store.relation.b[slot]!
      relationNextB[slot] = relationHeadByAlias[alias] ?? -1
      relationHeadByAlias[alias] = slot
    }
  }
  const transitionSlotsByBatch = new Map<number, Set<number>>()
  for (let slot = 0; slot < store.transition.id.length; slot++) {
    const batch = store.transition.batch[slot]!
    const held = transitionSlotsByBatch.get(batch)
    if (held) held.add(slot)
    else transitionSlotsByBatch.set(batch, new Set([slot]))
  }
  const relationSlotsByBatch = new Map<number, Set<number>>()
  const relationSlotsByEndpoint = [new Map<number, Set<number>>(), new Map(), new Map()]
  const indexEndpoint = (kind: number, id: number, slot: number): void => {
    const byId = relationSlotsByEndpoint[kind]
    if (!byId) return
    const held = byId.get(id)
    if (held) held.add(slot)
    else byId.set(id, new Set([slot]))
  }
  for (let slot = 0; slot < store.relation.id.length; slot++) {
    indexEndpoint(store.relation.aKind[slot]!, store.relation.a[slot]!, slot)
    indexEndpoint(store.relation.bKind[slot]!, store.relation.b[slot]!, slot)
    const batch = store.relation.batch[slot]!
    if (batch === 0) continue
    const held = relationSlotsByBatch.get(batch)
    if (held) held.add(slot)
    else relationSlotsByBatch.set(batch, new Set([slot]))
  }
  const built: BulkStoreRuntime = {
    atomDarkSlotsByWimp: slotGroups(
      store.dark.id.length,
      (slot) => store.dark.wimp[slot]!,
      (slot) => store.dark.wimp[slot]! > 0 &&
        (store.dark.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0,
    ),
    aliasHeadByAtom: aliasList.head,
    aliasNext: aliasList.next,
    aliasSlotsByField: slotGroups(
      store.fieldAlias.id.length,
      (slot) => store.fieldAlias.field[slot]!,
      (slot) => (store.fieldAlias.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0,
    ),
    aliasSlotsByMarker: slotGroups(
      store.fieldAlias.id.length,
      (slot) => store.fieldAlias.marker[slot]!,
    ),
    aliasSlotsByValue: slotGroups(
      store.fieldAlias.id.length,
      (slot) => store.fieldAlias.value[slot]!,
      (slot) => store.fieldAlias.value[slot]! > 0,
    ),
    batchHeadByOwner: batchList.head,
    batchNext: batchList.next,
    darkChildHead,
    darkChildNext,
    darkDepthById: (() => {
      const result = int32(darkSlotById.length)
      const read = (id: number): number => {
        if (id === 0) return -1
        if (result[id]! >= 0) return result[id]!
        const slot = darkSlotById[id] ?? -1
        if (slot < 0) return -1
        const parent = store.dark.parent[slot]!
        const depth = parent === 0 ? 0 : read(parent) + 1
        result[id] = depth
        return depth
      }
      for (const id of store.dark.id) read(id)
      return result
    })(),
    darkSlotById,
    fieldSlotsByOwner: slotGroups(
      store.field.id.length,
      (slot) => store.field.owner[slot]!,
    ),
    orbitalHeadByOwner: orbitalList.head,
    orbitalNext: orbitalList.next,
    orbitalSlotById: directSlots(store.orbital.id),
    proxyHeadByOwner: proxyList.head,
    proxyNext: proxyList.next,
    relationHeadByAlias,
    relationHeadByOwner: relationOwnerList.head,
    relationNextA,
    relationNextB,
    relationNextOwner: relationOwnerList.next,
    relationSlotsByBatch,
    relationSlotsByEndpoint,
    fieldSourceSlotById: directSlots(store.fieldSource.id),
    fieldSourceSlotsByWimp: slotGroups(
      store.fieldSource.id.length,
      (slot) => store.fieldSource.wimp[slot]!,
      (slot) => (store.fieldSource.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0,
    ),
    stateSourceSlotById: directSlots(store.stateSource.id),
    stateSourceSlotsByWimp: slotGroups(
      store.stateSource.id.length,
      (slot) => store.stateSource.wimp[slot]!,
      (slot) => (store.stateSource.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0,
    ),
    transitionSourceSlotById: directSlots(store.transitionSource.id),
    transitionSourceSlotsByWimp: slotGroups(
      store.transitionSource.id.length,
      (slot) => store.transitionSource.wimp[slot]!,
      (slot) => (store.transitionSource.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0,
    ),
    conditionSourceSlotById: directSlots(store.conditionSource.id),
    conditionSourceSlotsByTransition: slotGroups(
      store.conditionSource.id.length,
      (slot) => store.conditionSource.transition[slot]!,
      (slot) => (store.conditionSource.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0,
    ),
    processSourceSlotById: directSlots(store.processSource.id),
    processSourceSlotsByWimp: slotGroups(
      store.processSource.id.length,
      (slot) => store.processSource.wimp[slot]!,
      (slot) => (store.processSource.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0,
    ),
    reactionSourceSlotById: directSlots(store.reactionSource.id),
    reactionSourceSlotsByWimp: slotGroups(
      store.reactionSource.id.length,
      (slot) => store.reactionSource.wimp[slot]!,
      (slot) => (store.reactionSource.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0,
    ),
    stateOccurrenceIndexedOwners: new Set(),
    stateOrbitalSlotByKey: new Map(),
    stateOrbitalKeyById: new Map(),
    transitionHeadByOwner: transitionList.head,
    transitionNext: transitionList.next,
    transitionSlotsByBatch,
    textSlotByValue: new Map(store.text.map((value, slot) => [value, slot] as const)),
    wimpSlotBySrc: new Map(store.wimp.src.map((value, slot) => [value, slot] as const)),
  }
  Object.defineProperty(store, runtimeSymbol, {value: built})
  return built
}

const typed = <T extends Uint8Array | Uint32Array | Int32Array | Float32Array>(
  value: BulkStoreNumericArray,
  Type: {new(values: ArrayLike<number>): T},
): T => value instanceof Type ? value : new Type(value)

/** Replaces wire arrays in-place; the browser keeps no parallel wire copy. */
export const activateBulkStore = (store: BulkStore): BulkStore => {
  const shape = (value: BulkStore["dark"] | BulkStore["field"] | BulkStore["orbital"] | BulkStore["proxy"]): void => {
    value.id = typed(value.id, Uint32Array)
    value.kind = typed(value.kind, Uint8Array)
    value.flags = typed(value.flags, Uint8Array)
    value.label = typed(value.label, Uint32Array)
    value.position = typed(value.position, Float32Array)
    value.form = typed(value.form, Float32Array)
    value.material = typed(value.material, Float32Array)
  }
  shape(store.dark)
  shape(store.field)
  shape(store.orbital)
  shape(store.proxy)
  store.wimp.name = typed(store.wimp.name, Uint32Array)
  store.wimp.flags = typed(store.wimp.flags, Uint8Array)
  for (const key of ["id", "wimp", "localId", "key", "label"] as const) {
    store.fieldSource[key] = typed(store.fieldSource[key], Uint32Array)
  }
  store.fieldSource.kind = typed(store.fieldSource.kind, Uint8Array)
  store.fieldSource.flags = typed(store.fieldSource.flags, Uint8Array)
  for (const key of ["id", "wimp", "position", "name"] as const) {
    store.stateSource[key] = typed(store.stateSource[key], Uint32Array)
  }
  store.stateSource.flags = typed(store.stateSource.flags, Uint8Array)
  for (const key of ["id", "wimp", "fromState", "toState", "position"] as const) {
    store.transitionSource[key] = typed(store.transitionSource[key], Uint32Array)
  }
  store.transitionSource.flags = typed(store.transitionSource.flags, Uint8Array)
  for (const key of ["id", "wimp", "transition", "field", "position"] as const) {
    store.conditionSource[key] = typed(store.conditionSource[key], Uint32Array)
  }
  store.conditionSource.flags = typed(store.conditionSource.flags, Uint8Array)
  for (const key of [
    "id", "wimp", "state", "label", "readStart", "readCount", "writeStart", "writeCount",
  ] as const) store.processSource[key] = typed(store.processSource[key], Uint32Array)
  store.processSource.kind = typed(store.processSource.kind, Uint8Array)
  store.processSource.flags = typed(store.processSource.flags, Uint8Array)
  store.processField = typed(store.processField, Uint32Array)
  for (const key of [
    "id", "wimp", "label", "readStart", "readCount", "writeStart", "writeCount",
    "stateStart", "stateCount",
  ] as const) store.reactionSource[key] = typed(store.reactionSource[key], Uint32Array)
  store.reactionSource.allStates = typed(store.reactionSource.allStates, Uint8Array)
  store.reactionSource.flags = typed(store.reactionSource.flags, Uint8Array)
  store.reactionField = typed(store.reactionField, Uint32Array)
  store.reactionState = typed(store.reactionState, Uint32Array)
  store.dark.parent = typed(store.dark.parent, Uint32Array)
  store.dark.wimp = typed(store.dark.wimp, Uint32Array)
  store.dark.order = typed(store.dark.order, Uint32Array)
  for (const key of ["owner", "field", "key", "value", "valueText"] as const) {
    store.field[key] = typed(store.field[key], Uint32Array)
  }
  for (const key of ["id", "atom", "field", "value", "marker", "order", "orbit", "valueText"] as const) {
    store.fieldAlias[key] = typed(store.fieldAlias[key], Uint32Array)
  }
  store.fieldAlias.flags = typed(store.fieldAlias.flags, Uint8Array)
  for (const key of ["owner", "source", "anchor", "sleeve", "relatedStart", "relatedCount"] as const) {
    store.orbital[key] = typed(store.orbital[key], Uint32Array)
  }
  store.orbitalRelatedState = typed(store.orbitalRelatedState, Uint32Array)
  for (const key of ["owner", "field", "sourceField", "state", "paint"] as const) {
    store.proxy[key] = typed(store.proxy[key], Uint32Array)
  }
  for (const key of ["id", "source", "owner", "from", "to", "batch"] as const) {
    store.transition[key] = typed(store.transition[key], Uint32Array)
  }
  store.transition.flags = typed(store.transition.flags, Uint8Array)
  store.transition.control = typed(store.transition.control, Float32Array)
  for (const key of ["id", "owner", "a", "b", "batch"] as const) {
    store.relation[key] = typed(store.relation[key], Uint32Array)
  }
  for (const key of ["kind", "flags", "aKind", "bKind"] as const) {
    store.relation[key] = typed(store.relation[key], Uint8Array)
  }
  store.relation.controlStart = typed(store.relation.controlStart, Int32Array)
  store.relation.control = typed(store.relation.control, Float32Array)
  for (const key of ["id", "owner"] as const) store.batch[key] = typed(store.batch[key], Uint32Array)
  for (const key of ["kind", "flags"] as const) store.batch[key] = typed(store.batch[key], Uint8Array)
  store.batch.material = typed(store.batch.material, Float32Array)
  indexes(store)
  return store
}

const setFlag = (flags: BulkStoreNumericArray, slot: number, bit: number, on: boolean): boolean => {
  const before = flags[slot]!
  const after = on ? before | bit : before & ~bit
  if (before === after) return false
  flags[slot] = after
  return true
}

const indexRelationEndpoint = (
  store: BulkStore,
  kind: number,
  id: number,
  slot: number,
): void => {
  const byId = indexes(store).relationSlotsByEndpoint[kind]
  if (!byId) return
  const held = byId.get(id)
  if (held) held.add(slot)
  else byId.set(id, new Set([slot]))
}

const unindexRelation = (store: BulkStore, slot: number): void => {
  const state = indexes(store)
  state.relationSlotsByEndpoint[store.relation.aKind[slot]!]
    ?.get(store.relation.a[slot]!)?.delete(slot)
  state.relationSlotsByEndpoint[store.relation.bKind[slot]!]
    ?.get(store.relation.b[slot]!)?.delete(slot)
}

const writeQuantum = (
  target: BulkStoreNumericArray,
  slot: number,
  material: VisualQuantumMaterial,
): boolean => {
  const values = [
    ...material.color,
    material.opacity,
    material.glowIntensity,
    material.highlightSize,
  ]
  const start = slot * BULK_STORE_QUANTUM_MATERIAL_STRIDE
  let changed = false
  values.forEach((value, offset) => {
    if (target[start + offset] === value) return
    target[start + offset] = value
    changed = true
  })
  return changed
}

const lineValues = (material: VisualLineMaterial): number[] => [
  ...material.color,
  ...material.glowColor,
  material.glowIntensity,
  material.opacity,
]

const sameLineMaterial = (
  store: BulkStore,
  slot: number,
  material: VisualLineMaterial,
): boolean => {
  const values = lineValues(material)
  const start = slot * BULK_STORE_LINE_MATERIAL_STRIDE
  return values.every((value, offset) =>
    Math.abs(store.batch.material[start + offset]! - value) <= 1e-6)
}

const lineMaterialFromStore = (
  store: BulkStore,
  slot: number,
): VisualLineMaterial => {
  const start = slot * BULK_STORE_LINE_MATERIAL_STRIDE
  return {
    kind: "line-glow",
    color: [
      store.batch.material[start]!, store.batch.material[start + 1]!,
      store.batch.material[start + 2]!, store.batch.material[start + 3]!,
    ],
    glowColor: [
      store.batch.material[start + 4]!, store.batch.material[start + 5]!,
      store.batch.material[start + 6]!, store.batch.material[start + 7]!,
    ],
    glowIntensity: store.batch.material[start + 8]!,
    opacity: store.batch.material[start + 9]!,
    visibilityMode: (store.batch.flags[slot]! & 16) !== 0 ? "overlay" : "scene",
  }
}

const appendValues = (
  target: BulkStoreNumericArray,
  values: readonly number[],
): BulkStoreNumericArray => {
  if (Array.isArray(target)) {
    target.push(...values)
    return target
  }
  const Type = target.constructor as {
    new(length: number): Uint8Array | Uint32Array | Int32Array | Float32Array
  }
  const result = new Type(target.length + values.length)
  result.set(target)
  result.set(values, target.length)
  return result
}

const growInt32 = (source: Int32Array, length: number): Int32Array => {
  if (source.length >= length) return source
  const result = int32(length)
  result.set(source)
  return result
}

const wimpSlot = (store: BulkStore, src: string): number =>
  indexes(store).wimpSlotBySrc.get(src) ?? -1

const appendWimp = (
  store: BulkStore,
  src: string,
  name: string | null,
): number => {
  const held = wimpSlot(store, src)
  if (held >= 0) {
    store.wimp.flags[held] = store.wimp.flags[held]! & ~BULK_STORE_FLAG_REMOVED
    store.wimp.name[held] = textSlot(store, name)
    return held
  }
  const slot = store.wimp.src.length
  store.wimp.src.push(src)
  store.wimp.name = appendValues(store.wimp.name, [textSlot(store, name)])
  store.wimp.flags = appendValues(store.wimp.flags, [0])
  indexes(store).wimpSlotBySrc.set(src, slot)
  return slot
}

const appendBatch = (
  store: BulkStore,
  owner: number,
  kind: number,
  flags: number,
  material: VisualLineMaterial,
): number => {
  const id = store.batch.id.length + 1
  store.batch.id = appendValues(store.batch.id, [id])
  store.batch.owner = appendValues(store.batch.owner, [owner])
  store.batch.kind = appendValues(store.batch.kind, [kind])
  store.batch.flags = appendValues(store.batch.flags, [flags])
  store.batch.material = appendValues(store.batch.material, lineValues(material))
  const state = indexes(store)
  const next = int32(state.batchNext.length + 1)
  next.set(state.batchNext)
  next[next.length - 1] = state.batchHeadByOwner[owner] ?? -1
  state.batchNext = next
  state.batchHeadByOwner[owner] = id - 1
  return id
}

const findBatch = (
  store: BulkStore,
  owner: number,
  kind: number,
  flags: number,
  material: VisualLineMaterial,
): number => {
  const state = indexes(store)
  for (let slot = state.batchHeadByOwner[owner] ?? -1; slot >= 0; slot = state.batchNext[slot]!) {
    if (
      store.batch.kind[slot] === kind &&
      store.batch.flags[slot] === flags &&
      sameLineMaterial(store, slot, material)
    ) return store.batch.id[slot]!
  }
  return appendBatch(store, owner, kind, flags, material)
}

const textValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.map(String).join(", ")
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const textSlot = (store: BulkStore, value: string | null): number => {
  if (value === null) return 0
  const state = indexes(store)
  const held = state.textSlotByValue.get(value)
  if (held !== undefined) return held
  store.text.push(value)
  const slot = store.text.length - 1
  state.textSlotByValue.set(value, slot)
  return slot
}

const findAliasSlots = (store: BulkStore, atom: number, field: number): number[] => {
  const state = indexes(store)
  const result: number[] = []
  for (let slot = state.aliasHeadByAtom[atom] ?? -1; slot >= 0; slot = state.aliasNext[slot]!) {
    if ((store.fieldAlias.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0 &&
        store.fieldAlias.field[slot] === field) result.push(slot)
  }
  return result
}

const fieldSourceSlot = (store: BulkStore, id: number): number =>
  indexes(store).fieldSourceSlotById[id] ?? -1

const darkParent = (store: BulkStore, darkId: number): number => {
  const slot = indexes(store).darkSlotById[darkId] ?? -1
  return slot < 0 ? 0 : store.dark.parent[slot]!
}

const FIELD_KIND = ["string", "number", "boolean", "enum", "array", "other"] as const

const darkDepth = (store: BulkStore, darkId: number): number =>
  indexes(store).darkDepthById[darkId] ?? -1

const darkSubtree = (store: BulkStore, root: number): Set<number> => {
  const state = indexes(store)
  const result = new Set<number>()
  const pending = [root]
  while (pending.length > 0) {
    const id = pending.pop()!
    if (result.has(id)) continue
    result.add(id)
    for (let child = state.darkChildHead[id] ?? -1; child >= 0; child = state.darkChildNext[child]!) {
      pending.push(store.dark.id[child]!)
    }
  }
  return result
}

const highestCommonDarkOwner = (
  store: BulkStore,
  owners: readonly number[],
): number => {
  if (owners.length === 0) return store.root
  let common = owners[0]!
  let commonDepth = darkDepth(store, common)
  for (const source of owners.slice(1)) {
    let left = common
    let right = source
    let leftDepth = commonDepth
    let rightDepth = darkDepth(store, right)
    while (leftDepth > rightDepth) {
      left = darkParent(store, left)
      leftDepth -= 1
    }
    while (rightDepth > leftDepth) {
      right = darkParent(store, right)
      rightDepth -= 1
    }
    while (left !== right && left !== 0 && right !== 0) {
      left = darkParent(store, left)
      right = darkParent(store, right)
    }
    common = left === right && left !== 0 ? left : store.root
    commonDepth = darkDepth(store, common)
  }
  return common
}

const maximumSubtreeDepth = (
  store: BulkStore,
  root: number,
  cache: Map<number, number>,
): number => {
  const held = cache.get(root)
  if (held !== undefined) return held
  const state = indexes(store)
  let maximum = darkDepth(store, root)
  for (let child = state.darkChildHead[root] ?? -1; child >= 0; child = state.darkChildNext[child]!) {
    maximum = Math.max(maximum, maximumSubtreeDepth(store, store.dark.id[child]!, cache))
  }
  cache.set(root, maximum)
  return maximum
}

const orderedDarkChildren = (store: BulkStore, owner: number): number[] => {
  const state = indexes(store)
  const result: number[] = []
  for (let slot = state.darkChildHead[owner] ?? -1; slot >= 0; slot = state.darkChildNext[slot]!) {
    result.push(store.dark.id[slot]!)
  }
  const maximum = new Map<number, number>()
  return result.sort((left, right) => {
    const leftSlot = state.darkSlotById[left]!
    const rightSlot = state.darkSlotById[right]!
    return maximumSubtreeDepth(store, right, maximum) - maximumSubtreeDepth(store, left, maximum) ||
      darkDepth(store, left) - darkDepth(store, right) ||
      store.dark.order[leftSlot]! - store.dark.order[rightSlot]! ||
      left - right
  })
}

const widenFieldLayoutRoot = (store: BulkStore, source: number): number => {
  let affected = source
  let cursor = source
  while (darkParent(store, cursor) !== 0) {
    const parent = darkParent(store, cursor)
    const siblings = orderedDarkChildren(store, parent)
    if (siblings.indexOf(cursor) < siblings.length - 1) affected = parent
    cursor = parent
  }
  return affected
}

const currentOwnerFieldExtent = (
  store: BulkStore,
  owner: number,
  minimum: number,
): number => {
  let result = minimum
  for (const slot of indexes(store).fieldSlotsByOwner.get(owner) ?? []) {
    if ((store.field.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const position = slot * 3
    result = Math.max(
      result,
      Math.hypot(
        store.field.position[position]!,
        store.field.position[position + 1]!,
        store.field.position[position + 2]!,
      ) + store.field.form[slot * 2]!,
    )
  }
  return result
}

const minimumCoreExtent = (
  store: BulkStore,
  darkId: number,
  cache = new Map<number, number>(),
): number => {
  const held = cache.get(darkId)
  if (held !== undefined) return held
  const parent = darkParent(store, darkId)
  if (parent === 0) {
    cache.set(darkId, 0)
    return 0
  }
  const siblings = orderedDarkChildren(store, parent)
  const index = siblings.indexOf(darkId)
  if (index > 0) {
    const previous = siblings[index - 1]!
    const slot = indexes(store).darkSlotById[previous]!
    const result = store.dark.form[slot * 2]! + store.dark.form[slot * 2 + 1]!
    cache.set(darkId, result)
    return result
  }
  const parentMinimum = minimumCoreExtent(store, parent, cache)
  const depth = darkDepth(store, parent)
  const scale = torusLevelScale(depth)
  const coreExtent = currentOwnerFieldExtent(store, parent, parentMinimum)
  const result = resolveContentTorusForm({
    coreExtent,
    emptyOuterRadius: TORUS_LAYOUT_BASELINE.rootOuterRadius * scale,
    gap: TORUS_LAYOUT_BASELINE.rootFieldRadius *
      TORUS_LAYOUT_BASELINE.contentGapToFieldRadius * scale,
  }).innerRadius
  cache.set(darkId, result)
  return result
}

const ownStateOuterExtents = (
  store: BulkStore,
  darkIds: ReadonlySet<number>,
): Map<number, number> => {
  const state = indexes(store)
  const result = new Map<number, number>()
  for (const owner of darkIds) {
    let extent = 0
    for (let slot = state.orbitalHeadByOwner[owner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
      if ((store.orbital.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0 ||
          store.orbital.kind[slot] !== BULK_STORE_ORBITAL_KIND.state) continue
      const position = slot * 3
      extent = Math.max(
        extent,
        Math.hypot(
          store.orbital.position[position]!,
          store.orbital.position[position + 1]!,
          store.orbital.position[position + 2]!,
        ) + store.orbital.form[slot * 2]! + store.orbital.form[slot * 2 + 1]!,
      )
    }
    result.set(owner, extent)
  }
  return result
}

type CompactStateSleeve = Omit<StateSleevePackingEnvelope, "disks"> & Readonly<{
  disks: readonly Readonly<{radius: number; x: number; y: number; z: number}>[]
  slots: readonly number[]
  rootStateId: number
}>

const stableStatePhase = (
  owner: number,
  firstRootStateId: number,
  count: number,
): number => {
  const identity = `${owner}:${firstRootStateId}:${count}`
  let hash = 2166136261
  for (let index = 0; index < identity.length; index++) {
    hash ^= identity.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2
}

const compactStateSleeves = (
  store: BulkStore,
  owner: number,
  scale: number,
): CompactStateSleeve[] => {
  const state = indexes(store)
  const slotsByRoot = new Map<number, number[]>()
  for (let slot = state.orbitalHeadByOwner[owner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
    if ((store.orbital.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0 ||
        store.orbital.kind[slot] !== BULK_STORE_ORBITAL_KIND.state) continue
    const root = store.orbital.sleeve[slot]!
    const slots = slotsByRoot.get(root)
    if (slots) slots.push(slot)
    else slotsByRoot.set(root, [slot])
  }
  return [...slotsByRoot]
    .map(([rootStateId, slots]) => ({rootStateId, slots: slots.toSorted((a, b) => a - b)}))
    .sort((left, right) => {
      const leftSlot = state.stateSourceSlotById[left.rootStateId] ?? -1
      const rightSlot = state.stateSourceSlotById[right.rootStateId] ?? -1
      return (leftSlot < 0 ? Number.MAX_SAFE_INTEGER : store.stateSource.position[leftSlot]!) -
        (rightSlot < 0 ? Number.MAX_SAFE_INTEGER : store.stateSource.position[rightSlot]!) ||
        left.rootStateId - right.rootStateId
    })
    .map(({rootStateId, slots}) => {
      const rootSlot = slots.find((slot) => store.orbital.source[slot] === rootStateId) ?? slots[0]!
      const rootStart = rootSlot * 3
      const rootX = store.orbital.position[rootStart]!
      const rootY = store.orbital.position[rootStart + 1]!
      const rootZ = store.orbital.position[rootStart + 2]!
      const angle = Math.atan2(rootY, rootX)
      const radialX = Math.cos(angle)
      const radialY = Math.sin(angle)
      const tangentX = -radialY
      const tangentY = radialX
      const disks = slots.map((slot) => {
        const start = slot * 3
        const dx = (store.orbital.position[start]! - rootX) / scale
        const dy = (store.orbital.position[start + 1]! - rootY) / scale
        return {
          radius: (store.orbital.form[slot * 2]! + store.orbital.form[slot * 2 + 1]!) / scale,
          x: dx * radialX + dy * radialY,
          y: dx * tangentX + dy * tangentY,
          z: (store.orbital.position[start + 2]! - rootZ) / scale,
        }
      })
      return {
        rootStateId,
        disks,
        slots,
        inwardExtent: Math.max(
          disks[slots.indexOf(rootSlot)]?.radius ?? 0,
          ...disks.map((disk) => disk.radius - disk.x),
        ),
      }
    })
}

const compactStateOuterExtentResolver = (
  store: BulkStore,
  targets: Map<number, StorePoint>,
) => (
  owner: number,
  childOuterExtent: number,
  scale: number,
): number => {
  const sleeves = compactStateSleeves(store, owner, scale)
  if (sleeves.length === 0) return 0
  const localGap = TORUS_LAYOUT_BASELINE.rootFieldRadius *
    TORUS_LAYOUT_BASELINE.contentGapToFieldRadius
  const innerBoundary = childOuterExtent / scale
  const minimumOrbit = Math.max(
    innerBoundary + localGap,
    ...sleeves.flatMap((sleeve) => sleeve.disks.map((disk) => {
      const requiredInnerEdge = innerBoundary + localGap + disk.radius
      if (Math.abs(disk.y) >= requiredInnerEdge) return 0
      return Math.sqrt(requiredInnerEdge ** 2 - disk.y ** 2) - disk.x
    })),
  )
  const packing = packStateSleeves(
    sleeves,
    minimumOrbit,
    stateNodeSurfaceGap(TORUS_LAYOUT_BASELINE.rootFieldRadius),
    stableStatePhase(owner, sleeves[0]!.rootStateId, sleeves.length),
  )
  let extent = 0
  sleeves.forEach((sleeve, index) => {
    const angle = packing.angles[index]!
    const radialX = Math.cos(angle)
    const radialY = Math.sin(angle)
    const tangentX = -radialY
    const tangentY = radialX
    sleeve.disks.forEach((disk, memberIndex) => {
      const x = radialX * (packing.orbitRadius + disk.x) + tangentX * disk.y
      const y = radialY * (packing.orbitRadius + disk.x) + tangentY * disk.y
      extent = Math.max(extent, (Math.hypot(x, y, disk.z) + disk.radius) * scale)
      targets.set(sleeve.slots[memberIndex]!, {
        x: x * scale,
        y: y * scale,
        z: disk.z * scale,
      })
    })
  })
  return extent
}

const aliasesForFieldScope = (
  store: BulkStore,
  darkIds: ReadonlySet<number>,
  seeds: ReadonlySet<number>,
): Set<number> => {
  const state = indexes(store)
  const result = new Set<number>(seeds)
  const markerIds = new Set<number>()
  for (const darkId of darkIds) {
    if (darkId % 2 !== 0) continue
    for (let slot = state.aliasHeadByAtom[darkId / 2] ?? -1; slot >= 0; slot = state.aliasNext[slot]!) {
      if ((store.fieldAlias.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
      const marker = store.fieldAlias.marker[slot]!
      const markerSlot = marker - 1
      if (
        darkIds.has(store.field.owner[markerSlot]!) &&
        (store.field.flags[markerSlot]! & BULK_STORE_FLAG_REMOVED) === 0
      ) markerIds.add(marker)
    }
  }
  for (const marker of markerIds) {
    for (const slot of state.aliasSlotsByMarker.get(marker) ?? []) result.add(slot)
  }
  return result
}

const appendFieldMarker = (store: BulkStore, owner: number): number => {
  const slot = store.field.id.length
  const id = slot + 1
  store.field.id = appendValues(store.field.id, [id])
  store.field.owner = appendValues(store.field.owner, [owner])
  store.field.field = appendValues(store.field.field, [0])
  store.field.kind = appendValues(store.field.kind, [0])
  store.field.flags = appendValues(store.field.flags, [0])
  store.field.key = appendValues(store.field.key, [0])
  store.field.label = appendValues(store.field.label, [0])
  store.field.value = appendValues(store.field.value, [0])
  store.field.valueText = appendValues(store.field.valueText, [0])
  store.field.position = appendValues(store.field.position, [0, 0, 0])
  store.field.form = appendValues(store.field.form, [0, 0])
  store.field.material = appendValues(
    store.field.material,
    new Array(BULK_STORE_QUANTUM_MATERIAL_STRIDE).fill(0),
  )
  const owners = indexes(store).fieldSlotsByOwner
  const held = owners.get(owner)
  if (held) held.add(slot)
  else owners.set(owner, new Set([slot]))
  return slot
}

const writeFieldMarker = (
  store: BulkStore,
  markerSlot: number,
  placement: BulkStoreFieldPlacement,
  aliasSlots: readonly number[],
): void => {
  const previousOwner = store.field.owner[markerSlot]!
  if (previousOwner !== placement.ownerDarkParticleId) {
    indexes(store).fieldSlotsByOwner.get(previousOwner)?.delete(markerSlot)
    const next = indexes(store).fieldSlotsByOwner.get(placement.ownerDarkParticleId)
    if (next) next.add(markerSlot)
    else indexes(store).fieldSlotsByOwner.set(
      placement.ownerDarkParticleId,
      new Set([markerSlot]),
    )
  }
  const labels = [...new Set(aliasSlots.map((slot) => {
    const source = fieldSourceSlot(store, store.fieldAlias.field[slot]!)
    return source < 0 ? "" : store.text[store.fieldSource.label[source]!]!
  }))]
  store.field.owner[markerSlot] = placement.ownerDarkParticleId
  store.field.field[markerSlot] = Math.min(...placement.fieldIds)
  store.field.kind[markerSlot] = placement.fieldKind
  store.field.flags[markerSlot] =
    (store.field.flags[markerSlot]! | BULK_STORE_FLAG_ACTIVE) & ~BULK_STORE_FLAG_REMOVED
  store.field.key[markerSlot] = textSlot(store, placement.fieldKeys.join(" ∩ "))
  store.field.label[markerSlot] = textSlot(store, labels.join(" · "))
  store.field.value[markerSlot] = placement.valueId
  store.field.valueText[markerSlot] = textSlot(store, placement.valueText)
  const position = markerSlot * 3
  store.field.position[position] = placement.x
  store.field.position[position + 1] = placement.y
  store.field.position[position + 2] = placement.z
  store.field.form[markerSlot * 2] = placement.radius
  store.field.form[markerSlot * 2 + 1] = 0
  writeQuantum(
    store.field.material,
    markerSlot,
    visualCoreFieldMaterial(visualFieldParticleColor({
      fieldParticleKind: FIELD_KIND[placement.fieldKind]!,
    })),
  )
}

type FieldRegroupResult = Readonly<{
  aliasSlots: readonly number[]
  fieldSlots: readonly number[]
  removedFieldSlots: readonly number[]
  darkSlots: readonly number[]
  orbitalSlots: readonly number[]
  proxySlots: readonly number[]
}>

type FieldLayoutPlan = Readonly<{
  aliasSlots: ReadonlySet<number>
  darkIds: ReadonlySet<number>
  darkForms: ReadonlyMap<number, Readonly<{radius: number; tube: number}>>
  darkPositions: ReadonlyMap<number, StorePoint>
  placements: readonly BulkStoreFieldPlacement[]
  stateTargets: ReadonlyMap<number, StorePoint>
}>

const outsideInPhase = (ids: readonly number[]): number => {
  const identity = ids.join(":")
  if (identity.length === 0) return 0
  let hash = 2166136261
  for (let index = 0; index < identity.length; index++) {
    hash ^= identity.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2
}

const outsideInChildren = (store: BulkStore, owner: number): number[] => {
  const state = indexes(store)
  const result: number[] = []
  for (let slot = state.darkChildHead[owner] ?? -1; slot >= 0; slot = state.darkChildNext[slot]!) {
    if ((store.dark.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0) {
      result.push(store.dark.id[slot]!)
    }
  }
  return result.sort((left, right) => {
    const leftSlot = state.darkSlotById[left]!
    const rightSlot = state.darkSlotById[right]!
    return store.dark.order[leftSlot]! - store.dark.order[rightSlot]! || left - right
  })
}

const outsideInOwnerAliases = (store: BulkStore, owner: number): number[] => {
  if (owner % 2 !== 0) return []
  const state = indexes(store)
  const result: number[] = []
  for (let slot = state.aliasHeadByAtom[owner / 2] ?? -1; slot >= 0; slot = state.aliasNext[slot]!) {
    if ((store.fieldAlias.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0) result.push(slot)
  }
  return result.sort((left, right) =>
    store.fieldAlias.field[left]! - store.fieldAlias.field[right]! ||
    store.fieldAlias.order[left]! - store.fieldAlias.order[right]! ||
    store.fieldAlias.id[left]! - store.fieldAlias.id[right]!)
}

const outsideInOwnerFieldPlacements = (
  store: BulkStore,
  owner: number,
  aliases: readonly number[],
): Readonly<{coreExtent: number; placements: readonly BulkStoreFieldPlacement[]}> => {
  const radius = torusFieldRadiusAtLevel(darkDepth(store, owner))
  const layout = layoutFieldsInPseudoCircle(aliases.length, radius)
  const placements = aliases.map((slot, index): BulkStoreFieldPlacement => {
    const source = fieldSourceSlot(store, store.fieldAlias.field[slot]!)
    const point = layout.points[index] ?? {x: 0, y: 0, z: 0}
    return {
      aliasSlots: [slot],
      fieldIds: [store.fieldAlias.field[slot]!],
      fieldKeys: [source < 0 ? "" : store.text[store.fieldSource.key[source]!]!],
      fieldKind: source < 0 ? 0 : store.fieldSource.kind[source]!,
      orbitIndex: 0,
      ownerDarkParticleId: owner,
      radius,
      valueId: store.fieldAlias.value[slot]!,
      valueText: store.text[store.fieldAlias.valueText[slot]!] || null,
      x: point.x,
      y: point.y,
      z: point.z,
    }
  })
  return {coreExtent: layout.radius, placements}
}

const outsideInFieldLayoutPlan = (
  store: BulkStore,
  seeds: ReadonlySet<number>,
  forcedOwner: number,
): FieldLayoutPlan => {
  const fieldOwners = new Set<number>()
  for (const slot of seeds) fieldOwners.add(store.fieldAlias.atom[slot]! * 2)
  const aliasSlots = new Set<number>()
  const coreExtentByOwner = new Map<number, number>()
  const placements: BulkStoreFieldPlacement[] = []
  for (const owner of fieldOwners) {
    const aliases = outsideInOwnerAliases(store, owner)
    aliases.forEach((slot) => aliasSlots.add(slot))
    const layout = outsideInOwnerFieldPlacements(store, owner, aliases)
    coreExtentByOwner.set(owner, layout.coreExtent)
    placements.push(...layout.placements)
  }

  const darkIds = new Set<number>()
  const includeAncestors = (source: number): void => {
    let owner = source
    while (owner > 0) {
      darkIds.add(owner)
      owner = darkParent(store, owner)
    }
  }
  fieldOwners.forEach(includeAncestors)
  if (forcedOwner > 0) includeAncestors(forcedOwner)

  const darkForms = new Map<number, Readonly<{radius: number; tube: number}>>()
  const darkPositions = new Map<number, StorePoint>()
  const stateTargets = new Map<number, StorePoint>()
  const stateExtent = compactStateOuterExtentResolver(store, stateTargets)
  const state = indexes(store)
  const orderedOwners = [...darkIds].sort((left, right) =>
    darkDepth(store, right) - darkDepth(store, left) || right - left)
  for (const owner of orderedOwners) {
    const depth = darkDepth(store, owner)
    const scale = torusLevelScale(depth)
    const radius = TORUS_LAYOUT_BASELINE.rootFieldRadius * scale
    const gap = radius * TORUS_LAYOUT_BASELINE.contentGapToFieldRadius
    const coreExtent = coreExtentByOwner.get(owner) ?? currentOwnerFieldExtent(store, owner, 0)
    const coreForm = resolveContentTorusForm({
      coreExtent,
      emptyOuterRadius: TORUS_LAYOUT_BASELINE.rootOuterRadius * scale,
      gap,
    })
    const children = outsideInChildren(store, owner)
    const maximumChildExtent = Math.max(0, ...children.map((child) => {
      const prepared = darkForms.get(child)
      if (prepared) return prepared.radius + prepared.tube
      const slot = state.darkSlotById[child] ?? -1
      return slot < 0 ? 0 : store.dark.form[slot * 2]! + store.dark.form[slot * 2 + 1]!
    }))
    const siblingOrbit = children.length <= 1
      ? 0
      : (maximumChildExtent + gap * 0.5) / Math.sin(Math.PI / children.length)
    const matterOrbit = children.length === 0
      ? 0
      : Math.max(coreForm.innerRadius + gap + maximumChildExtent, siblingOrbit)
    const phase = outsideInPhase(children)
    children.forEach((child, index) => {
      const angle = phase + index * Math.PI * 2 / children.length
      darkPositions.set(child, {
        x: Math.cos(angle) * matterOrbit,
        y: Math.sin(angle) * matterOrbit,
        z: 0,
      })
    })
    const matterOuter = children.length === 0
      ? coreForm.innerRadius
      : matterOrbit + maximumChildExtent
    const ownStateOuter = stateExtent(owner, matterOuter, scale)
    const form = resolveContentTorusForm({
      coreExtent,
      emptyOuterRadius: TORUS_LAYOUT_BASELINE.rootOuterRadius * scale,
      gap,
      occupiedOuterExtent: Math.max(matterOuter, ownStateOuter),
    })
    darkForms.set(owner, form)
  }
  return {aliasSlots, darkIds, darkForms, darkPositions, placements, stateTargets}
}

const regroupFieldAliases = (
  store: BulkStore,
  seeds: ReadonlySet<number>,
  forcedOwner = 0,
): FieldRegroupResult => {
  if (seeds.size === 0 && forcedOwner === 0) return {
    aliasSlots: [], fieldSlots: [], removedFieldSlots: [], darkSlots: [], orbitalSlots: [], proxySlots: [],
  }
  const plan = (() => {
    if (store.layout === BULK_STORE_LAYOUT_OUTSIDE_IN) {
      return outsideInFieldLayoutPlan(store, seeds, forcedOwner)
    }
    const affectedOwners = [...seeds].map((slot) => store.fieldAlias.atom[slot]! * 2)
    if (forcedOwner > 0) affectedOwners.push(forcedOwner)
    const root = widenFieldLayoutRoot(store, highestCommonDarkOwner(store, affectedOwners))
    const darkIds = darkSubtree(store, root)
    const aliasSlots = aliasesForFieldScope(store, darkIds, seeds)
    let componentRoot = root
    while (darkParent(store, componentRoot) !== 0) componentRoot = darkParent(store, componentRoot)
    const stateTargets = new Map<number, StorePoint>()
    const darkForms = new Map<number, Readonly<{radius: number; tube: number}>>()
    const placements = layoutCenteredNestedStoreFields(
      store,
      root,
      darkIds,
      aliasSlots,
      minimumCoreExtent(store, root),
      {
        componentRootDarkParticleId: componentRoot,
        componentRootDepth: darkDepth(store, componentRoot),
        initialOrbitIndex: aliasSlots.size === 0
          ? 0
          : Math.min(...[...aliasSlots].map((slot) => store.fieldAlias.orbit[slot]!)),
        darkFormSink: (id, form) => darkForms.set(id, form),
        ownStateOuterExtentResolver: compactStateOuterExtentResolver(store, stateTargets),
        rootIsComponentRoot: root === componentRoot,
      },
    )
    return {
      aliasSlots,
      darkIds,
      darkForms,
      darkPositions: new Map<number, StorePoint>(),
      placements,
      stateTargets,
    }
  })()
  const {aliasSlots, darkIds, darkForms, darkPositions, placements, stateTargets} = plan
  const oldMarkers = new Set([...aliasSlots].map((slot) => store.fieldAlias.marker[slot]!))
  const usedMarkers = new Set<number>()
  const changedFields = new Set<number>()
  const changedAliases = new Set<number>()
  const changedDarks = new Set<number>()
  const changedOrbitals = new Set<number>()
  const changedProxies = new Set<number>()
  const state = indexes(store)

  for (const [id, point] of darkPositions) {
    const slot = state.darkSlotById[id] ?? -1
    if (slot < 0) continue
    const start = slot * 3
    if (
      Math.abs(store.dark.position[start]! - point.x) <= 1e-6 &&
      Math.abs(store.dark.position[start + 1]! - point.y) <= 1e-6 &&
      Math.abs(store.dark.position[start + 2]! - point.z) <= 1e-6
    ) continue
    store.dark.position[start] = point.x
    store.dark.position[start + 1] = point.y
    store.dark.position[start + 2] = point.z
    changedDarks.add(slot)
  }

  for (const [id, form] of darkForms) {
    const slot = state.darkSlotById[id] ?? -1
    if (slot < 0) continue
    const start = slot * 2
    if (
      Math.abs(store.dark.form[start]! - form.radius) <= 1e-6 &&
      Math.abs(store.dark.form[start + 1]! - form.tube) <= 1e-6
    ) continue
    store.dark.form[start] = form.radius
    store.dark.form[start + 1] = form.tube
    changedDarks.add(slot)
  }

  const stateDeltaById = new Map<number, StorePoint>()
  for (const [slot, target] of stateTargets) {
    const start = slot * 3
    const delta = {
      x: target.x - store.orbital.position[start]!,
      y: target.y - store.orbital.position[start + 1]!,
      z: target.z - store.orbital.position[start + 2]!,
    }
    if (Math.hypot(delta.x, delta.y, delta.z) <= 1e-6) continue
    store.orbital.position[start] = target.x
    store.orbital.position[start + 1] = target.y
    store.orbital.position[start + 2] = target.z
    stateDeltaById.set(store.orbital.id[slot]!, delta)
    changedOrbitals.add(slot)
  }
  for (const owner of darkIds) {
    for (let slot = state.orbitalHeadByOwner[owner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
      if (store.orbital.kind[slot] === BULK_STORE_ORBITAL_KIND.state) continue
      const delta = stateDeltaById.get(store.orbital.anchor[slot]!)
      if (!delta) continue
      const start = slot * 3
      store.orbital.position[start] = store.orbital.position[start]! + delta.x
      store.orbital.position[start + 1] = store.orbital.position[start + 1]! + delta.y
      store.orbital.position[start + 2] = store.orbital.position[start + 2]! + delta.z
      changedOrbitals.add(slot)
    }
    for (let slot = state.proxyHeadByOwner[owner] ?? -1; slot >= 0; slot = state.proxyNext[slot]!) {
      const delta = stateDeltaById.get(store.proxy.state[slot]!)
      if (!delta) continue
      const start = slot * 3
      store.proxy.position[start] = store.proxy.position[start]! + delta.x
      store.proxy.position[start + 1] = store.proxy.position[start + 1]! + delta.y
      store.proxy.position[start + 2] = store.proxy.position[start + 2]! + delta.z
      changedProxies.add(slot)
    }
  }

  for (const placement of placements) {
    const members = placement.aliasSlots
    const anchor = members.toSorted((left, right) =>
      darkDepth(store, store.fieldAlias.atom[left]! * 2) -
        darkDepth(store, store.fieldAlias.atom[right]! * 2) ||
      store.fieldAlias.order[left]! - store.fieldAlias.order[right]!
    )[0]!
    const preferred = store.fieldAlias.marker[anchor]!
    const markerSlot = usedMarkers.has(preferred)
      ? appendFieldMarker(store, placement.ownerDarkParticleId)
      : preferred - 1
    const marker = markerSlot + 1
    usedMarkers.add(marker)
    writeFieldMarker(store, markerSlot, placement, members)
    changedFields.add(markerSlot)
    for (const aliasSlot of members) {
      const previous = store.fieldAlias.marker[aliasSlot]!
      if (previous !== marker) {
        state.aliasSlotsByMarker.get(previous)?.delete(aliasSlot)
        const next = state.aliasSlotsByMarker.get(marker)
        if (next) next.add(aliasSlot)
        else state.aliasSlotsByMarker.set(marker, new Set([aliasSlot]))
        store.fieldAlias.marker[aliasSlot] = marker
      }
      store.fieldAlias.orbit[aliasSlot] = placement.orbitIndex
      changedAliases.add(aliasSlot)
      const owner = store.fieldAlias.atom[aliasSlot]! * 2
      for (let proxy = state.proxyHeadByOwner[owner] ?? -1; proxy >= 0; proxy = state.proxyNext[proxy]!) {
        if (store.proxy.sourceField[proxy] === store.fieldAlias.field[aliasSlot]) {
          store.proxy.field[proxy] = marker
          changedProxies.add(proxy)
        }
      }
    }
  }

  const removedFields: number[] = []
  for (const marker of oldMarkers) {
    if (usedMarkers.has(marker)) continue
    const slot = marker - 1
    if (setFlag(store.field.flags, slot, BULK_STORE_FLAG_REMOVED, true)) {
      removedFields.push(slot)
      changedFields.delete(slot)
    }
  }
  return {
    aliasSlots: [...changedAliases],
    fieldSlots: [...changedFields],
    removedFieldSlots: removedFields,
    darkSlots: [...changedDarks],
    orbitalSlots: [...changedOrbitals],
    proxySlots: [...changedProxies],
  }
}

const collectAffectedEntanglementAliases = (
  store: BulkStore,
  ownerDarkId: number,
  values: ReadonlySet<number>,
  target: Set<number>,
): void => {
  const state = indexes(store)
  const pending = [ownerDarkId]
  while (pending.length > 0) {
    const darkId = pending.pop()!
    if (darkId % 2 === 0) {
      const atom = darkId / 2
      for (let slot = state.aliasHeadByAtom[atom] ?? -1; slot >= 0; slot = state.aliasNext[slot]!) {
        if ((store.fieldAlias.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
        if (values.has(store.fieldAlias.value[slot]!)) target.add(slot)
      }
    }
    for (let child = state.darkChildHead[darkId] ?? -1; child >= 0; child = state.darkChildNext[child]!) {
      pending.push(store.dark.id[child]!)
    }
  }
}

const removeIncidentEntanglement = (store: BulkStore, aliasId: number): void => {
  const state = indexes(store)
  for (let relationSlot = state.relationHeadByAlias[aliasId] ?? -1; relationSlot >= 0;) {
    const onA = store.relation.aKind[relationSlot] === BULK_STORE_ENDPOINT_KIND.field &&
      store.relation.a[relationSlot] === aliasId
    const next = onA ? state.relationNextA[relationSlot]! : state.relationNextB[relationSlot]!
    if (store.relation.kind[relationSlot] === BULK_STORE_RELATION_KIND["field-entanglement"]) {
      if (setFlag(store.relation.flags, relationSlot, BULK_STORE_FLAG_REMOVED, true)) {
        unindexRelation(store, relationSlot)
      }
    }
    relationSlot = next
  }
}

const nearestAncestorAlias = (store: BulkStore, aliasSlot: number): number => {
  const state = indexes(store)
  const value = store.fieldAlias.value[aliasSlot]!
  if (value === 0) return -1
  let owner = darkParent(store, store.fieldAlias.atom[aliasSlot]! * 2)
  while (owner !== 0) {
    if (owner % 2 === 0) {
      for (let slot = state.aliasHeadByAtom[owner / 2] ?? -1; slot >= 0; slot = state.aliasNext[slot]!) {
        if ((store.fieldAlias.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
        if (store.fieldAlias.value[slot] === value) return slot
      }
    }
    owner = darkParent(store, owner)
  }
  return -1
}

const appendEntanglement = (
  store: BulkStore,
  sourceSlot: number,
  targetSlot: number,
): void => {
  const sourceId = store.fieldAlias.id[sourceSlot]!
  const targetId = store.fieldAlias.id[targetSlot]!
  const a = Math.min(sourceId, targetId)
  const b = Math.max(sourceId, targetId)
  const owner = store.fieldAlias.atom[sourceSlot]! * 2
  const targetDark = store.fieldAlias.atom[targetSlot]! * 2
  const targetDarkSlot = indexes(store).darkSlotById[targetDark] ?? -1
  const active = targetDarkSlot >= 0 &&
    (store.dark.flags[targetDarkSlot]! & BULK_STORE_FLAG_ACTIVE) !== 0
  const relationSlot = store.relation.id.length
  const id = relationSlot + 1
  store.relation.id = appendValues(store.relation.id, [id])
  store.relation.owner = appendValues(store.relation.owner, [owner])
  store.relation.kind = appendValues(store.relation.kind, [BULK_STORE_RELATION_KIND["field-entanglement"]])
  store.relation.flags = appendValues(store.relation.flags, [active ? BULK_STORE_FLAG_ACTIVE : 0])
  store.relation.aKind = appendValues(store.relation.aKind, [BULK_STORE_ENDPOINT_KIND.field])
  store.relation.a = appendValues(store.relation.a, [a])
  store.relation.bKind = appendValues(store.relation.bKind, [BULK_STORE_ENDPOINT_KIND.field])
  store.relation.b = appendValues(store.relation.b, [b])
  store.relation.batch = appendValues(store.relation.batch, [0])
  store.relation.controlStart = appendValues(store.relation.controlStart, [-1])
  const state = indexes(store)
  const nextA = int32(state.relationNextA.length + 1)
  nextA.set(state.relationNextA)
  nextA[relationSlot] = state.relationHeadByAlias[a] ?? -1
  state.relationNextA = nextA
  state.relationHeadByAlias[a] = relationSlot
  const nextB = int32(state.relationNextB.length + 1)
  nextB.set(state.relationNextB)
  nextB[relationSlot] = state.relationHeadByAlias[b] ?? -1
  state.relationNextB = nextB
  state.relationHeadByAlias[b] = relationSlot
  const nextOwner = int32(state.relationNextOwner.length + 1)
  nextOwner.set(state.relationNextOwner)
  nextOwner[relationSlot] = state.relationHeadByOwner[owner] ?? -1
  state.relationNextOwner = nextOwner
  state.relationHeadByOwner[owner] = relationSlot
}

type StorePoint = Readonly<{x: number; y: number; z: number}>

const relationEndpointPoint = (
  store: BulkStore,
  kind: number,
  id: number,
): StorePoint | null => {
  let values: BulkStoreNumericArray
  let slot: number
  if (kind === BULK_STORE_ENDPOINT_KIND.field) {
    const aliasSlot = id - 1
    const marker = store.fieldAlias.marker[aliasSlot]
    if (marker === undefined) return null
    values = store.field.position
    slot = marker - 1
  } else if (kind === BULK_STORE_ENDPOINT_KIND["field-proxy"]) {
    values = store.proxy.position
    slot = id - 1
  } else {
    values = store.orbital.position
    slot = id - 1
  }
  const start = slot * 3
  if (start < 0 || start + 2 >= values.length) return null
  return {x: values[start]!, y: values[start + 1]!, z: values[start + 2]!}
}

const compactCurve = (
  curve: ReturnType<typeof describeHermiteEdgeCurve>,
): number[] => [
  curve.from.x, curve.from.y, curve.from.z,
  curve.to.x, curve.to.y, curve.to.z,
  curve.fromTangent.x, curve.fromTangent.y, curve.fromTangent.z,
  curve.toTangent.x, curve.toTangent.y, curve.toTangent.z,
]

const writeRelationControls = (
  store: BulkStore,
  slot: number,
  values: readonly number[],
): void => {
  let start = store.relation.controlStart[slot]!
  if (start < 0) {
    start = store.relation.control.length
    store.relation.control = appendValues(
      store.relation.control,
      new Array(values.length).fill(0),
    )
    store.relation.controlStart[slot] = start
  }
  values.forEach((value, offset) => {
    store.relation.control[start + offset] = value
  })
}

const relationKindName = (
  store: BulkStore,
  slot: number,
): BulkRelationChannel["relationKind"] =>
  Object.keys(BULK_STORE_RELATION_KIND).find((key) =>
    BULK_STORE_RELATION_KIND[key as keyof typeof BULK_STORE_RELATION_KIND] ===
      store.relation.kind[slot]) as BulkRelationChannel["relationKind"]

const rebuildFieldRelationGeometry = (
  store: BulkStore,
  aliasSlots: readonly number[],
  orbitalSlots: readonly number[] = [],
  proxySlots: readonly number[] = [],
): Set<number> => {
  const state = indexes(store)
  const relationSlots = new Set<number>()
  for (const aliasSlot of aliasSlots) {
    const aliasId = store.fieldAlias.id[aliasSlot]!
    for (let slot = state.relationHeadByAlias[aliasId] ?? -1; slot >= 0;) {
      relationSlots.add(slot)
      const onA = store.relation.aKind[slot] === BULK_STORE_ENDPOINT_KIND.field &&
        store.relation.a[slot] === aliasId
      slot = onA ? state.relationNextA[slot]! : state.relationNextB[slot]!
    }
  }
  const relationOwners = new Set<number>()
  for (const slot of orbitalSlots) relationOwners.add(store.orbital.owner[slot]!)
  for (const slot of proxySlots) relationOwners.add(store.proxy.owner[slot]!)
  for (const source of relationOwners) {
    let owner = source
    while (owner !== 0) {
      for (let slot = state.relationHeadByOwner[owner] ?? -1; slot >= 0; slot = state.relationNextOwner[slot]!) {
        relationSlots.add(slot)
      }
      owner = darkParent(store, owner)
    }
  }
  const touchedBatches = new Set<number>()
  for (const slot of relationSlots) {
    if ((store.relation.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const oldBatch = store.relation.batch[slot]!
    const entanglement = store.relation.kind[slot] ===
      BULK_STORE_RELATION_KIND["field-entanglement"]
    const sameMarker = entanglement &&
      store.relation.aKind[slot] === BULK_STORE_ENDPOINT_KIND.field &&
      store.relation.bKind[slot] === BULK_STORE_ENDPOINT_KIND.field &&
      store.fieldAlias.marker[store.relation.a[slot]! - 1] ===
        store.fieldAlias.marker[store.relation.b[slot]! - 1]
    if (sameMarker || (store.layout === BULK_STORE_LAYOUT_OUTSIDE_IN && entanglement)) {
      if (oldBatch > 0) {
        state.relationSlotsByBatch.get(oldBatch)?.delete(slot)
        touchedBatches.add(oldBatch)
      }
      store.relation.batch[slot] = 0
      store.relation.controlStart[slot] = -1
      continue
    }
    const from = relationEndpointPoint(
      store,
      store.relation.aKind[slot]!,
      store.relation.a[slot]!,
    )
    const to = relationEndpointPoint(
      store,
      store.relation.bKind[slot]!,
      store.relation.b[slot]!,
    )
    if (!from || !to) continue
    const controls = [
      ...compactCurve(describeHermiteEdgeCurve({
        from, leftOuterRadius: 1, rightOuterRadius: 1, side: 1, to,
      })),
      ...compactCurve(describeHermiteEdgeCurve({
        from: to, leftOuterRadius: 1, rightOuterRadius: 1, side: -1, to: from,
      })),
    ]
    writeRelationControls(store, slot, controls)
    let nextBatch = oldBatch
    if (nextBatch === 0) {
      const active = (store.relation.flags[slot]! & BULK_STORE_FLAG_ACTIVE) !== 0
      const material = visualRelationMaterial(
        visualRelationColor({relationKind: relationKindName(store, slot)}),
        active,
        active,
      )
      nextBatch = findBatch(
        store,
        store.relation.owner[slot]!,
        BULK_STORE_BATCH_KIND.relation,
        0,
        material,
      )
      store.relation.batch[slot] = nextBatch
      const members = state.relationSlotsByBatch.get(nextBatch)
      if (members) members.add(slot)
      else state.relationSlotsByBatch.set(nextBatch, new Set([slot]))
    }
    if (oldBatch > 0) touchedBatches.add(oldBatch)
    touchedBatches.add(nextBatch)
  }
  return touchedBatches
}

const rebuildTransitionGeometry = (
  store: BulkStore,
  orbitalSlots: readonly number[],
): Set<number> => {
  const state = indexes(store)
  const owners = new Set(orbitalSlots.map((slot) => store.orbital.owner[slot]!))
  const touched = new Set<number>()
  for (const owner of owners) {
    for (let slot = state.transitionHeadByOwner[owner] ?? -1; slot >= 0; slot = state.transitionNext[slot]!) {
      const from = relationEndpointPoint(
        store,
        BULK_STORE_ENDPOINT_KIND.orbital,
        store.transition.from[slot]!,
      )
      const to = relationEndpointPoint(
        store,
        BULK_STORE_ENDPOINT_KIND.orbital,
        store.transition.to[slot]!,
      )
      if (!from || !to) continue
      const batch = store.transition.batch[slot]!
      const returning = (store.batch.flags[batch - 1]! & BULK_STORE_FLAG_RETURNING) !== 0
      const fromSlot = state.orbitalSlotById[store.transition.from[slot]!] ?? -1
      const toSlot = state.orbitalSlotById[store.transition.to[slot]!] ?? -1
      if (fromSlot < 0 || toSlot < 0) continue
      const outerRadius = Math.max(
        store.orbital.form[fromSlot * 2]! + store.orbital.form[fromSlot * 2 + 1]!,
        store.orbital.form[toSlot * 2]! + store.orbital.form[toSlot * 2 + 1]!,
      )
      const values = compactCurve(describeHermiteEdgeCurve({
        from,
        leftOuterRadius: outerRadius,
        rightOuterRadius: outerRadius,
        side: returning ? -1 : 1,
        to,
      }))
      const start = slot * 12
      values.forEach((value, offset) => {
        store.transition.control[start + offset] = value
      })
      touched.add(batch)
    }
  }
  return touched
}

const rebuildLocalEntanglement = (
  store: BulkStore,
  changed: ReadonlyMap<number, number>,
  candidates: ReadonlySet<number>,
): number[] => {
  const affected = new Set<number>()
  for (const [slot, oldValue] of changed) {
    const newValue = store.fieldAlias.value[slot]!
    if (oldValue === newValue) continue
    affected.add(slot)
  }
  for (const slot of candidates) affected.add(slot)
  for (const slot of affected) removeIncidentEntanglement(store, store.fieldAlias.id[slot]!)
  for (const slot of affected) {
    const source = nearestAncestorAlias(store, slot)
    if (source >= 0) appendEntanglement(store, source, slot)
  }
  return [...affected]
}

const applyCanonicalGluon = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
  operation: "add" | "replace" | "remove",
): void => {
  if (typeof part.path !== "number") return
  const fields = resolveCanonicalForceFieldsPayload(part.value)
  if (fields === null) {
    throw new Error(`Bulk Store ${operation} Gluon has no canonical Value identity`)
  }
  const affected = new Set<number>()
  const previousValues = new Map<number, number>()
  const layoutSeeds = new Set<number>()
  const state = indexes(store)
  for (const [rawField, binding] of Object.entries(fields)) {
    const field = resolveForceFieldId(rawField)
    if (field === null) continue
    for (const aliasSlot of findAliasSlots(store, part.path, field)) {
      const previous = store.fieldAlias.value[aliasSlot]!
      previousValues.set(aliasSlot, previous)
      for (const member of state.aliasSlotsByValue.get(previous) ?? []) layoutSeeds.add(member)
      if (operation !== "remove") {
        for (const member of state.aliasSlotsByValue.get(binding.valueId) ?? []) layoutSeeds.add(member)
      }
      if (operation === "remove" && previous !== binding.valueId) {
        throw new Error(`Bulk Store Gluon remove Value ${binding.valueId} does not match ${previous}`)
      }
      const nextValue = operation === "remove" ? 0 : binding.valueId
      state.aliasSlotsByValue.get(previous)?.delete(aliasSlot)
      if (nextValue > 0) {
        const members = state.aliasSlotsByValue.get(nextValue)
        if (members) members.add(aliasSlot)
        else state.aliasSlotsByValue.set(nextValue, new Set([aliasSlot]))
      }
      store.fieldAlias.value[aliasSlot] = nextValue
      store.fieldAlias.valueText[aliasSlot] = textSlot(store, textValue(binding.value))
      affected.add(aliasSlot)
      layoutSeeds.add(aliasSlot)
      const marker: number = store.fieldAlias.marker[aliasSlot]!
      const markerSlot = marker - 1
      store.field.value[markerSlot] = operation === "remove" ? 0 : binding.valueId
      store.field.valueText[markerSlot] = textSlot(store, textValue(binding.value))
    }
  }
  const regrouped = rebuildLocalEntanglement(store, previousValues, layoutSeeds)
  if (affected.size > 0) {
    for (const slot of regrouped) layoutSeeds.add(slot)
    if (store.layout === BULK_STORE_LAYOUT_OUTSIDE_IN) {
      const fieldSlots = [...new Set([...affected].map((slot) =>
        store.fieldAlias.marker[slot]! - 1))]
      const relationBatches = rebuildFieldRelationGeometry(store, [...layoutSeeds])
      renderer.fieldAliasesRegrouped(
        [...affected],
        fieldSlots,
        [],
        [],
        [],
        [],
      )
      for (const batch of relationBatches) {
        if (batch > 0) renderer.relationBatchChanged(batch)
      }
      return
    }
    const geometry = regroupFieldAliases(store, layoutSeeds)
    const transitionBatches = rebuildTransitionGeometry(
      store,
      geometry.orbitalSlots,
    )
    const relationBatches = rebuildFieldRelationGeometry(
      store,
      geometry.aliasSlots,
      geometry.orbitalSlots,
      geometry.proxySlots,
    )
    for (const batch of transitionBatches) {
      if (batch > 0) renderer.transitionBatchChanged(batch)
    }
    renderer.fieldAliasesRegrouped(
      geometry.aliasSlots,
      geometry.fieldSlots,
      geometry.removedFieldSlots,
      geometry.darkSlots,
      geometry.orbitalSlots,
      geometry.proxySlots,
    )
    for (const batch of relationBatches) {
      if (batch > 0) renderer.relationBatchChanged(batch)
    }
  }
}

export const applyBulkGluonAdd = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => applyCanonicalGluon(store, renderer, part, "add")

export const applyBulkGluonReplace = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => applyCanonicalGluon(store, renderer, part, "replace")

export const applyBulkGluonRemove = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => applyCanonicalGluon(store, renderer, part, "remove")

export const applyBulkGluonTest = (store: BulkStore, part: Particle): void => {
  if (typeof part.path !== "number") return
  const fields = resolveForceFieldsPayload(part.value)
  if (fields === null) return
  for (const [rawField, value] of Object.entries(fields)) {
    const field = resolveForceFieldId(rawField)
    if (field === null) continue
    for (const aliasSlot of findAliasSlots(store, part.path, field)) {
      const markerSlot = store.fieldAlias.marker[aliasSlot]! - 1
      if (store.text[store.field.valueText[markerSlot]!] !== textValue(value)) {
        throw new Error(`Bulk Store Gluon test failed for Atom ${part.path} Field ${field}`)
      }
    }
  }
}

const stateSlotForName = (store: BulkStore, owner: number, name: string): number => {
  const state = indexes(store)
  let match = -1
  for (let slot = state.orbitalHeadByOwner[owner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
    if (
      store.orbital.kind[slot] === BULK_STORE_ORBITAL_KIND.state &&
      store.text[store.orbital.label[slot]!] === name &&
      store.orbital.source[slot] === store.orbital.sleeve[slot]
    ) {
      if (match >= 0 && store.orbital.source[match] !== store.orbital.source[slot]) {
        throw new Error(`Bulk Store State label ${name} is ambiguous for owner ${owner}`)
      }
      match = slot
    }
  }
  return match
}

const relatedTo = (store: BulkStore, slot: number, stateId: number): boolean => {
  const start = store.orbital.relatedStart[slot]!
  const count = store.orbital.relatedCount[slot]!
  for (let offset = 0; offset < count; offset++) {
    if (store.orbitalRelatedState[start + offset] === stateId) return true
  }
  return false
}

const orbitalActive = (store: BulkStore, orbitalId: number): boolean => {
  const slot = indexes(store).orbitalSlotById[orbitalId] ?? -1
  return slot >= 0 && (store.orbital.flags[slot]! & BULK_STORE_FLAG_ACTIVE) !== 0
}

const branchActive = (store: BulkStore, slot: number): boolean => {
  if (store.orbital.kind[slot] === BULK_STORE_ORBITAL_KIND.state) {
    return (store.orbital.flags[slot]! & BULK_STORE_FLAG_ACTIVE) !== 0
  }
  return orbitalActive(store, store.orbital.anchor[slot]!)
}

const repaintOrbital = (store: BulkStore, slot: number): boolean => {
  const color = store.orbital.material.slice(
    slot * BULK_STORE_QUANTUM_MATERIAL_STRIDE,
    slot * BULK_STORE_QUANTUM_MATERIAL_STRIDE + 3,
  ) as unknown as [number, number, number]
  const flags = store.orbital.flags[slot]!
  const current = (flags & BULK_STORE_FLAG_CURRENT) !== 0
  const active = (flags & BULK_STORE_FLAG_ACTIVE) !== 0
  const kind = store.orbital.kind[slot]!
  const material = kind === BULK_STORE_ORBITAL_KIND.state
    ? visualStateTorusMaterial(color, current, active)
    : kind === BULK_STORE_ORBITAL_KIND.process || kind === BULK_STORE_ORBITAL_KIND.finally
      ? visualProcessTorusMaterial(color, current, active, branchActive(store, slot))
      : visualCausalMaterial(color, current, active, branchActive(store, slot))
  return writeQuantum(store.orbital.material, slot, material)
}

const repaintProxy = (store: BulkStore, slot: number): boolean => {
  const color = store.proxy.material.slice(
    slot * BULK_STORE_QUANTUM_MATERIAL_STRIDE,
    slot * BULK_STORE_QUANTUM_MATERIAL_STRIDE + 3,
  ) as unknown as [number, number, number]
  const paint = store.proxy.paint[slot]!
  const active = orbitalActive(store, paint === 0 ? store.proxy.state[slot]! : paint)
  const stateActive = orbitalActive(store, store.proxy.state[slot]!)
  const stateSlot = indexes(store).orbitalSlotById[store.proxy.state[slot]!] ?? -1
  const stateCurrent = stateSlot >= 0 &&
    (store.orbital.flags[stateSlot]! & BULK_STORE_FLAG_CURRENT) !== 0
  const form = (store.proxy.flags[slot]! & BULK_STORE_FLAG_TORUS) !== 0 ? "torus" : "sphere"
  const material = paint === 0 && form === "sphere"
    ? visualConditionFieldMaterial(color, stateCurrent, stateActive)
    : visualFieldProxyMaterial(color, form, active, stateActive)
  return writeQuantum(store.proxy.material, slot, material)
}

const repaintTransition = (
  store: BulkStore,
  slot: number,
  touched: Set<number>,
): void => {
  const active = orbitalActive(store, store.transition.from[slot]!)
  setFlag(store.transition.flags, slot, BULK_STORE_FLAG_ACTIVE, active)
  const oldBatch = store.transition.batch[slot]!
  const oldBatchSlot = oldBatch - 1
  const returning = (store.batch.flags[oldBatchSlot]! & BULK_STORE_FLAG_RETURNING) !== 0
  const material = visualTransitionMaterial(returning, active)
  const nextBatch = findBatch(
    store,
    store.transition.owner[slot]!,
    BULK_STORE_BATCH_KIND.transition,
    store.batch.flags[oldBatchSlot]!,
    material,
  )
  if (oldBatch !== nextBatch) {
    indexes(store).transitionSlotsByBatch.get(oldBatch)?.delete(slot)
    const members = indexes(store).transitionSlotsByBatch.get(nextBatch)
    if (members) members.add(slot)
    else indexes(store).transitionSlotsByBatch.set(nextBatch, new Set([slot]))
    store.transition.batch[slot] = nextBatch
  }
  touched.add(oldBatch)
  touched.add(nextBatch)
}

const endpointBranchActive = (store: BulkStore, kind: number, id: number): boolean | null => {
  if (kind === BULK_STORE_ENDPOINT_KIND.orbital) {
    const slot = indexes(store).orbitalSlotById[id] ?? -1
    return slot < 0 ? false : branchActive(store, slot)
  }
  if (kind === BULK_STORE_ENDPOINT_KIND["field-proxy"]) {
    const slot = id - 1
    return slot < 0 ? false : orbitalActive(store, store.proxy.state[slot]!)
  }
  return null
}

const endpointActive = (store: BulkStore, kind: number, id: number): boolean | null => {
  if (kind === BULK_STORE_ENDPOINT_KIND.orbital) {
    const slot = indexes(store).orbitalSlotById[id] ?? -1
    return slot < 0 ? false : (store.orbital.flags[slot]! & BULK_STORE_FLAG_ACTIVE) !== 0
  }
  if (kind === BULK_STORE_ENDPOINT_KIND["field-proxy"]) {
    const slot = id - 1
    if (slot < 0) return false
    const paint = store.proxy.paint[slot]!
    return orbitalActive(store, paint === 0 ? store.proxy.state[slot]! : paint)
  }
  return null
}

const repaintRelation = (
  store: BulkStore,
  slot: number,
  touched: Set<number>,
): void => {
  if (store.relation.batch[slot] === 0) return
  const aActive = endpointActive(store, store.relation.aKind[slot]!, store.relation.a[slot]!)
  const bActive = endpointActive(store, store.relation.bKind[slot]!, store.relation.b[slot]!)
  const aBranch = endpointBranchActive(store, store.relation.aKind[slot]!, store.relation.a[slot]!)
  const bBranch = endpointBranchActive(store, store.relation.bKind[slot]!, store.relation.b[slot]!)
  const active = store.relation.kind[slot] === BULK_STORE_RELATION_KIND["field-projection"]
    ? aBranch ?? bBranch ?? false
    : bActive ?? aActive ?? (store.relation.flags[slot]! & BULK_STORE_FLAG_ACTIVE) !== 0
  setFlag(store.relation.flags, slot, BULK_STORE_FLAG_ACTIVE, active)
  const branch = aBranch ?? bBranch ?? active
  const relationKind = Object.keys(BULK_STORE_RELATION_KIND).find((key) =>
    BULK_STORE_RELATION_KIND[key as keyof typeof BULK_STORE_RELATION_KIND] === store.relation.kind[slot]) as keyof typeof BULK_STORE_RELATION_KIND
  const color = visualRelationColor({relationKind})
  const material = visualRelationMaterial(color, active, branch)
  const oldBatch = store.relation.batch[slot]!
  const oldBatchSlot = oldBatch - 1
  const nextBatch = findBatch(
    store,
    store.relation.owner[slot]!,
    BULK_STORE_BATCH_KIND.relation,
    store.batch.flags[oldBatchSlot]!,
    material,
  )
  if (oldBatch !== nextBatch) {
    indexes(store).relationSlotsByBatch.get(oldBatch)?.delete(slot)
    const members = indexes(store).relationSlotsByBatch.get(nextBatch)
    if (members) members.add(slot)
    else indexes(store).relationSlotsByBatch.set(nextBatch, new Set([slot]))
    store.relation.batch[slot] = nextBatch
  }
  touched.add(oldBatch)
  touched.add(nextBatch)
}

export const applyBulkPhotonReplace = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  if (typeof part.path !== "number" || typeof part.value !== "string") return
  const owner = part.path * 2
  const selectedSlot = stateSlotForName(store, owner, part.value)
  if (selectedSlot < 0) return
  const selectedState = store.orbital.source[selectedSlot]!
  const state = indexes(store)
  // State flags are the branch source of truth. Update them before repainting
  // causal orbitals so newly appended head rows cannot observe stale anchors.
  for (let slot = state.orbitalHeadByOwner[owner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
    const kind = store.orbital.kind[slot]!
    if (kind !== BULK_STORE_ORBITAL_KIND.state) continue
    const active = store.orbital.sleeve[slot] === selectedState
    const current = active && store.orbital.source[slot] === selectedState
    const activeChanged = setFlag(store.orbital.flags, slot, BULK_STORE_FLAG_ACTIVE, active)
    const currentChanged = setFlag(store.orbital.flags, slot, BULK_STORE_FLAG_CURRENT, current)
    const flagsChanged = activeChanged || currentChanged
    const materialChanged = repaintOrbital(store, slot)
    if (flagsChanged || materialChanged) renderer.orbitalMaterialChanged(slot)
  }
  for (let slot = state.orbitalHeadByOwner[owner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
    const kind = store.orbital.kind[slot]!
    if (kind === BULK_STORE_ORBITAL_KIND.state) continue
    const active = kind === BULK_STORE_ORBITAL_KIND.process || kind === BULK_STORE_ORBITAL_KIND.finally
      ? relatedTo(store, slot, selectedState) && orbitalActive(store, store.orbital.anchor[slot]!)
      : relatedTo(store, slot, selectedState)
    const activeChanged = setFlag(store.orbital.flags, slot, BULK_STORE_FLAG_ACTIVE, active)
    const currentChanged = setFlag(store.orbital.flags, slot, BULK_STORE_FLAG_CURRENT, false)
    const materialChanged = repaintOrbital(store, slot)
    if (activeChanged || currentChanged || materialChanged) renderer.orbitalMaterialChanged(slot)
  }
  for (let slot = state.proxyHeadByOwner[owner] ?? -1; slot >= 0; slot = state.proxyNext[slot]!) {
    if (repaintProxy(store, slot)) renderer.proxyMaterialChanged(slot)
  }
  const transitionBatches = new Set<number>()
  for (let slot = state.transitionHeadByOwner[owner] ?? -1; slot >= 0; slot = state.transitionNext[slot]!) {
    repaintTransition(store, slot, transitionBatches)
  }
  for (const batch of transitionBatches) renderer.transitionBatchChanged(batch)
  const relationBatches = new Set<number>()
  for (let slot = state.relationHeadByOwner[owner] ?? -1; slot >= 0; slot = state.relationNextOwner[slot]!) {
    repaintRelation(store, slot, relationBatches)
  }
  for (const batch of relationBatches) renderer.relationBatchChanged(batch)
}

export const applyBulkPhotonTest = (store: BulkStore, part: Particle): void => {
  if (typeof part.path !== "number" || typeof part.value !== "string") return
  const owner = part.path * 2
  const selected = stateSlotForName(store, owner, part.value)
  if (selected < 0 || (store.orbital.flags[selected]! & BULK_STORE_FLAG_CURRENT) === 0) {
    throw new Error(`Bulk Store Photon test failed for Atom ${part.path}`)
  }
}

export const bulkStoreTransitionSlotsForBatch = (
  store: BulkStore,
  batchId: number,
): readonly number[] => [...(indexes(store).transitionSlotsByBatch.get(batchId) ?? [])]

export const bulkStoreRelationSlotsForBatch = (
  store: BulkStore,
  batchId: number,
): readonly number[] => [...(indexes(store).relationSlotsByBatch.get(batchId) ?? [])]

export const bulkStoreDarkDepth = (store: BulkStore, id: number): number =>
  indexes(store).darkDepthById[id] ?? -1

const declarationPaths = new Set([
  "wimp", "field", "variant", "state", "transition", "condition",
  "process", "reaction", "matter", "bulk",
])

type RuntimeAddress = Readonly<{kind: "atom" | "topology"; id: number}>

const runtimeAddress = (value: unknown): RuntimeAddress | null => {
  if (typeof value !== "string") return null
  const match = /^(atom|topology)\/([1-9]\d*)$/.exec(value)
  return match ? {kind: match[1] as RuntimeAddress["kind"], id: Number(match[2])} : null
}

const darkId = (kind: RuntimeAddress["kind"], id: number): number =>
  id * 2 + (kind === "topology" ? 1 : 0)

const darkKindName = (kind: number): "atom" | "fuzzy" | "macho" | "axion" =>
  kind === BULK_STORE_DARK_KIND.fuzzy
    ? "fuzzy"
    : kind === BULK_STORE_DARK_KIND.macho
      ? "macho"
      : kind === BULK_STORE_DARK_KIND.axion ? "axion" : "atom"

const parentDarkFromEntity = (
  value: Record<string, unknown>,
  allowRoot: boolean,
): number => {
  const parentAtom = value.parentAtom
  const parentTopology = value.parentTopology
  if (typeof parentAtom === "number" && Number.isSafeInteger(parentAtom) && parentAtom > 0) {
    if (parentTopology !== null && parentTopology !== undefined) {
      throw new Error("Bulk Store runtime entity has two parents")
    }
    return darkId("atom", parentAtom)
  }
  if (typeof parentTopology === "number" && Number.isSafeInteger(parentTopology) && parentTopology > 0) {
    return darkId("topology", parentTopology)
  }
  if (allowRoot && parentAtom === null && parentTopology === null) return 0
  throw new Error("Bulk Store runtime entity has no exact parent")
}

const unlinkDarkChild = (store: BulkStore, parent: number, slot: number): void => {
  if (parent === 0) return
  const state = indexes(store)
  let previous = -1
  for (let cursor = state.darkChildHead[parent] ?? -1; cursor >= 0; cursor = state.darkChildNext[cursor]!) {
    if (cursor !== slot) {
      previous = cursor
      continue
    }
    const next = state.darkChildNext[cursor] ?? -1
    if (previous < 0) state.darkChildHead[parent] = next
    else state.darkChildNext[previous] = next
    state.darkChildNext[cursor] = -1
    return
  }
}

const linkDarkChild = (store: BulkStore, parent: number, slot: number): void => {
  if (parent === 0) return
  const state = indexes(store)
  state.darkChildHead = growInt32(state.darkChildHead, parent + 1)
  state.darkChildNext[slot] = state.darkChildHead[parent] ?? -1
  state.darkChildHead[parent] = slot
}

const normalizeDarkChildOrder = (store: BulkStore, parent: number): void => {
  if (parent === 0) return
  const state = indexes(store)
  const children: number[] = []
  for (let slot = state.darkChildHead[parent] ?? -1; slot >= 0; slot = state.darkChildNext[slot]!) {
    if ((store.dark.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0) children.push(slot)
  }
  children.sort((left, right) => {
    const leftAtom = store.dark.kind[left] === BULK_STORE_DARK_KIND.atom ? 1 : 0
    const rightAtom = store.dark.kind[right] === BULK_STORE_DARK_KIND.atom ? 1 : 0
    return leftAtom - rightAtom ||
      store.dark.order[left]! - store.dark.order[right]! ||
      store.dark.id[left]! - store.dark.id[right]!
  })
  children.forEach((slot, order) => { store.dark.order[slot] = order })
}

const updateDarkDepths = (store: BulkStore, root: number): void => {
  const state = indexes(store)
  state.darkDepthById = growInt32(state.darkDepthById, root + 1)
  const slot = state.darkSlotById[root] ?? -1
  if (slot < 0) return
  const parent = store.dark.parent[slot]!
  state.darkDepthById[root] = parent === 0 ? 0 : (state.darkDepthById[parent] ?? -1) + 1
  for (let child = state.darkChildHead[root] ?? -1; child >= 0; child = state.darkChildNext[child]!) {
    updateDarkDepths(store, store.dark.id[child]!)
  }
}

const emptyDarkForm = (depth: number): Readonly<{radius: number; tube: number}> =>
  resolveContentTorusForm({
    coreExtent: 0,
    emptyOuterRadius: TORUS_LAYOUT_BASELINE.rootOuterRadius * torusLevelScale(depth),
    gap: TORUS_LAYOUT_BASELINE.rootFieldRadius *
      TORUS_LAYOUT_BASELINE.contentGapToFieldRadius * torusLevelScale(depth),
  })

const appendDarkRow = (
  store: BulkStore,
  id: number,
  parent: number,
  order: number,
  kind: number,
  wimp: number,
  label: number,
): number => {
  const state = indexes(store)
  state.darkSlotById = growInt32(state.darkSlotById, id + 1)
  if ((state.darkSlotById[id] ?? -1) >= 0) throw new Error(`Bulk Store Dark ${id} already exists`)
  if (parent !== 0 && (state.darkSlotById[parent] ?? -1) < 0) {
    throw new Error(`Bulk Store Dark ${id} has no parent ${parent}`)
  }
  const slot = store.dark.id.length
  store.dark.id = appendValues(store.dark.id, [id])
  store.dark.parent = appendValues(store.dark.parent, [parent])
  store.dark.wimp = appendValues(store.dark.wimp, [wimp])
  store.dark.order = appendValues(store.dark.order, [order])
  store.dark.kind = appendValues(store.dark.kind, [kind])
  store.dark.flags = appendValues(store.dark.flags, [BULK_STORE_FLAG_ACTIVE])
  store.dark.label = appendValues(store.dark.label, [label])
  store.dark.position = appendValues(store.dark.position, [0, 0, 0])
  const depth = parent === 0 ? 0 : (state.darkDepthById[parent] ?? -1) + 1
  const form = emptyDarkForm(depth)
  store.dark.form = appendValues(store.dark.form, [form.radius, form.tube])
  store.dark.material = appendValues(store.dark.material, new Array(6).fill(0))
  writeQuantum(
    store.dark.material,
    slot,
    visualContextTorusMaterial(visualDarkParticleColor({
      activity: "neutral",
      darkParticleKind: darkKindName(kind),
    })),
  )
  state.darkSlotById[id] = slot
  state.darkChildNext = growInt32(state.darkChildNext, slot + 1)
  state.darkDepthById = growInt32(state.darkDepthById, id + 1)
  state.darkDepthById[id] = depth
  state.darkChildHead = growInt32(state.darkChildHead, id + 1)
  linkDarkChild(store, parent, slot)
  if (wimp > 0) {
    const atoms = state.atomDarkSlotsByWimp.get(wimp)
    if (atoms) atoms.add(slot)
    else state.atomDarkSlotsByWimp.set(wimp, new Set([slot]))
  }
  return slot
}

type AtomFieldBinding = Readonly<{value: number; text: string | null}>

const atomFieldBindings = (payload: Record<string, unknown>): Map<number, AtomFieldBinding> => {
  const result = new Map<number, AtomFieldBinding>()
  const records = new Map<number, Record<string, unknown>>()
  for (const value of Array.isArray(payload.valueRecords) ? payload.valueRecords : []) {
    if (!isRecord(value) || !Number.isSafeInteger(value.id)) continue
    records.set(Number(value.id), value)
  }
  const listItems = new Map<number, Array<{position: number; value: unknown}>>()
  for (const value of Array.isArray(payload.valueItems) ? payload.valueItems : []) {
    if (!isRecord(value) || !Number.isSafeInteger(value.value) ||
        !Number.isSafeInteger(value.position)) continue
    const items = listItems.get(Number(value.value)) ?? []
    items.push({position: Number(value.position), value: value.itemValue})
    listItems.set(Number(value.value), items)
  }
  const render = (record: Record<string, unknown> | undefined): string | null => {
    if (!record) return null
    if (record.kind === "boolean") return String(record.boolean === true)
    if (record.kind === "number" && typeof record.number === "number") return String(record.number)
    if (record.kind === "string" && typeof record.text === "string") return record.text
    if (record.kind === "list") {
      return (listItems.get(Number(record.id)) ?? [])
        .toSorted((left, right) => left.position - right.position)
        .map((entry) => String(entry.value))
        .join(", ")
    }
    return null
  }
  for (const value of Array.isArray(payload.values) ? payload.values : []) {
    if (!isRecord(value) || !Number.isSafeInteger(value.field) ||
        !Number.isSafeInteger(value.value)) continue
    const id = Number(value.value)
    result.set(Number(value.field), {value: id, text: render(records.get(id))})
  }
  return result
}

const appendAliasFromTemplate = (
  store: BulkStore,
  template: number,
  atom: number,
  owner: number,
  binding: AtomFieldBinding | undefined,
  preserveTemplateBinding = false,
): number => {
  const state = indexes(store)
  const markerSlot = appendFieldMarker(store, owner)
  const slot = store.fieldAlias.id.length
  const id = slot + 1
  const value = binding?.value ?? (preserveTemplateBinding ? store.fieldAlias.value[template]! : 0)
  store.fieldAlias.id = appendValues(store.fieldAlias.id, [id])
  store.fieldAlias.flags = appendValues(store.fieldAlias.flags, [0])
  store.fieldAlias.atom = appendValues(store.fieldAlias.atom, [atom])
  store.fieldAlias.field = appendValues(store.fieldAlias.field, [store.fieldAlias.field[template]!])
  store.fieldAlias.value = appendValues(store.fieldAlias.value, [value])
  store.fieldAlias.marker = appendValues(store.fieldAlias.marker, [markerSlot + 1])
  store.fieldAlias.order = appendValues(store.fieldAlias.order, [store.fieldAlias.order[template]!])
  store.fieldAlias.orbit = appendValues(store.fieldAlias.orbit, [store.fieldAlias.orbit[template]!])
  store.fieldAlias.valueText = appendValues(
    store.fieldAlias.valueText,
    [binding === undefined && preserveTemplateBinding
      ? store.fieldAlias.valueText[template]!
      : textSlot(store, binding?.text ?? null)],
  )
  state.aliasHeadByAtom = growInt32(state.aliasHeadByAtom, atom + 1)
  state.aliasNext = growInt32(state.aliasNext, slot + 1)
  state.aliasNext[slot] = state.aliasHeadByAtom[atom] ?? -1
  state.aliasHeadByAtom[atom] = slot
  const markerMembers = state.aliasSlotsByMarker.get(markerSlot + 1)
  if (markerMembers) markerMembers.add(slot)
  else state.aliasSlotsByMarker.set(markerSlot + 1, new Set([slot]))
  if (value > 0) {
    const valueMembers = state.aliasSlotsByValue.get(value)
    if (valueMembers) valueMembers.add(slot)
    else state.aliasSlotsByValue.set(value, new Set([slot]))
  }
  const fieldMembers = state.aliasSlotsByField.get(store.fieldAlias.field[slot]!)
  if (fieldMembers) fieldMembers.add(slot)
  else state.aliasSlotsByField.set(store.fieldAlias.field[slot]!, new Set([slot]))
  return slot
}

const activeAliasSlotsForAtom = (store: BulkStore, atom: number): number[] => {
  const state = indexes(store)
  const result: number[] = []
  for (let slot = state.aliasHeadByAtom[atom] ?? -1; slot >= 0; slot = state.aliasNext[slot]!) {
    if ((store.fieldAlias.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0) result.push(slot)
  }
  return result
}

type ClonedAtomRows = Readonly<{
  aliases: number[]
  orbitals: number[]
  proxies: number[]
  transitionBatches: Set<number>
  relationBatches: Set<number>
}>

const appendRelationRow = (
  store: BulkStore,
  input: Readonly<{
    owner: number
    kind: number
    flags: number
    aKind: number
    a: number
    bKind: number
    b: number
    batch: number
    controls: readonly number[]
  }>,
): number => {
  const state = indexes(store)
  const slot = store.relation.id.length
  const id = slot + 1
  const controlStart = input.controls.length === 0 ? -1 : store.relation.control.length
  store.relation.id = appendValues(store.relation.id, [id])
  store.relation.owner = appendValues(store.relation.owner, [input.owner])
  store.relation.kind = appendValues(store.relation.kind, [input.kind])
  store.relation.flags = appendValues(store.relation.flags, [input.flags])
  store.relation.aKind = appendValues(store.relation.aKind, [input.aKind])
  store.relation.a = appendValues(store.relation.a, [input.a])
  store.relation.bKind = appendValues(store.relation.bKind, [input.bKind])
  store.relation.b = appendValues(store.relation.b, [input.b])
  store.relation.batch = appendValues(store.relation.batch, [input.batch])
  store.relation.controlStart = appendValues(store.relation.controlStart, [controlStart])
  if (input.controls.length > 0) {
    store.relation.control = appendValues(store.relation.control, input.controls)
  }
  state.relationHeadByAlias = growInt32(
    state.relationHeadByAlias,
    Math.max(input.aKind === BULK_STORE_ENDPOINT_KIND.field ? input.a : 0,
      input.bKind === BULK_STORE_ENDPOINT_KIND.field ? input.b : 0) + 1,
  )
  state.relationNextA = growInt32(state.relationNextA, slot + 1)
  state.relationNextB = growInt32(state.relationNextB, slot + 1)
  if (input.aKind === BULK_STORE_ENDPOINT_KIND.field) {
    state.relationNextA[slot] = state.relationHeadByAlias[input.a] ?? -1
    state.relationHeadByAlias[input.a] = slot
  }
  if (input.bKind === BULK_STORE_ENDPOINT_KIND.field) {
    state.relationNextB[slot] = state.relationHeadByAlias[input.b] ?? -1
    state.relationHeadByAlias[input.b] = slot
  }
  state.relationHeadByOwner = growInt32(state.relationHeadByOwner, input.owner + 1)
  state.relationNextOwner = growInt32(state.relationNextOwner, slot + 1)
  state.relationNextOwner[slot] = state.relationHeadByOwner[input.owner] ?? -1
  state.relationHeadByOwner[input.owner] = slot
  indexRelationEndpoint(store, input.aKind, input.a, slot)
  indexRelationEndpoint(store, input.bKind, input.b, slot)
  return slot
}

const cloneAtomRows = (
  store: BulkStore,
  templateAtom: number,
  atom: number,
  owner: number,
  payload: Record<string, unknown>,
  preserveTemplateBindings = false,
): ClonedAtomRows => {
  const state = indexes(store)
  const templateOwner = darkId("atom", templateAtom)
  const templateDarkSlot = state.darkSlotById[templateOwner] ?? -1
  const ownerDarkSlot = state.darkSlotById[owner] ?? -1
  if (templateDarkSlot < 0 || ownerDarkSlot < 0) {
    throw new Error(`Bulk Store Atom ${atom} has no semantic template`)
  }
  const scale = torusLevelScale(state.darkDepthById[owner] ?? 0) /
    torusLevelScale(state.darkDepthById[templateOwner] ?? 0)
  const bindings = atomFieldBindings(payload)
  const aliases: number[] = []
  const aliasByTemplateId = new Map<number, number>()
  for (const template of activeAliasSlotsForAtom(store, templateAtom)) {
    const field = store.fieldAlias.field[template]!
    const slot = appendAliasFromTemplate(
      store, template, atom, owner, bindings.get(field), preserveTemplateBindings,
    )
    aliases.push(slot)
    aliasByTemplateId.set(store.fieldAlias.id[template]!, store.fieldAlias.id[slot]!)
  }

  const orbitalByTemplateId = new Map<number, number>()
  const orbitalTemplates: number[] = []
  for (let slot = state.orbitalHeadByOwner[templateOwner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
    if ((store.orbital.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0) orbitalTemplates.push(slot)
  }
  orbitalTemplates.sort((left, right) => store.orbital.id[left]! - store.orbital.id[right]!)
  const orbitals: number[] = []
  for (const template of orbitalTemplates) {
    const slot = store.orbital.id.length
    const id = slot + 1
    const relatedStart = store.orbitalRelatedState.length
    const sourceStart = store.orbital.relatedStart[template]!
    const relatedCount = store.orbital.relatedCount[template]!
    store.orbitalRelatedState = appendValues(
      store.orbitalRelatedState,
      Array.from(store.orbitalRelatedState.slice(sourceStart, sourceStart + relatedCount)),
    )
    store.orbital.id = appendValues(store.orbital.id, [id])
    store.orbital.source = appendValues(store.orbital.source, [store.orbital.source[template]!])
    store.orbital.owner = appendValues(store.orbital.owner, [owner])
    store.orbital.kind = appendValues(store.orbital.kind, [store.orbital.kind[template]!])
    store.orbital.flags = appendValues(
      store.orbital.flags,
      [store.orbital.flags[template]! & ~BULK_STORE_FLAG_REMOVED],
    )
    store.orbital.anchor = appendValues(store.orbital.anchor, [0])
    store.orbital.sleeve = appendValues(store.orbital.sleeve, [store.orbital.sleeve[template]!])
    store.orbital.relatedStart = appendValues(store.orbital.relatedStart, [relatedStart])
    store.orbital.relatedCount = appendValues(store.orbital.relatedCount, [relatedCount])
    store.orbital.label = appendValues(store.orbital.label, [store.orbital.label[template]!])
    store.orbital.position = appendValues(store.orbital.position, Array.from(
      store.orbital.position.slice(template * 3, template * 3 + 3),
      (value) => value * scale,
    ))
    store.orbital.form = appendValues(store.orbital.form, Array.from(
      store.orbital.form.slice(template * 2, template * 2 + 2),
      (value) => value * scale,
    ))
    store.orbital.material = appendValues(
      store.orbital.material,
      Array.from(store.orbital.material.slice(template * 6, template * 6 + 6)),
    )
    orbitalByTemplateId.set(store.orbital.id[template]!, id)
    state.orbitalSlotById = growInt32(state.orbitalSlotById, id + 1)
    state.orbitalSlotById[id] = slot
    state.orbitalHeadByOwner = growInt32(state.orbitalHeadByOwner, owner + 1)
    state.orbitalNext = growInt32(state.orbitalNext, slot + 1)
    state.orbitalNext[slot] = state.orbitalHeadByOwner[owner] ?? -1
    state.orbitalHeadByOwner[owner] = slot
    orbitals.push(slot)
  }
  for (let index = 0; index < orbitalTemplates.length; index++) {
    const template = orbitalTemplates[index]!
    const slot = orbitals[index]!
    const anchor = store.orbital.anchor[template]!
    store.orbital.anchor[slot] = anchor === 0 ? 0 : orbitalByTemplateId.get(anchor) ?? 0
  }

  const proxyByTemplateId = new Map<number, number>()
  const proxies: number[] = []
  const proxyTemplates: number[] = []
  for (let slot = state.proxyHeadByOwner[templateOwner] ?? -1; slot >= 0; slot = state.proxyNext[slot]!) {
    if ((store.proxy.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0) proxyTemplates.push(slot)
  }
  proxyTemplates.sort((left, right) => store.proxy.id[left]! - store.proxy.id[right]!)
  for (const template of proxyTemplates) {
    const slot = store.proxy.id.length
    const id = slot + 1
    const sourceField = store.proxy.sourceField[template]!
    const alias = aliases.find((candidate) => store.fieldAlias.field[candidate] === sourceField)
    const marker = alias === undefined ? 0 : store.fieldAlias.marker[alias]!
    const stateId = orbitalByTemplateId.get(store.proxy.state[template]!) ?? 0
    const paint = store.proxy.paint[template]!
    store.proxy.id = appendValues(store.proxy.id, [id])
    store.proxy.field = appendValues(store.proxy.field, [marker])
    store.proxy.sourceField = appendValues(store.proxy.sourceField, [sourceField])
    store.proxy.owner = appendValues(store.proxy.owner, [owner])
    store.proxy.state = appendValues(store.proxy.state, [stateId])
    store.proxy.paint = appendValues(store.proxy.paint, [paint === 0 ? 0 : orbitalByTemplateId.get(paint) ?? 0])
    store.proxy.kind = appendValues(store.proxy.kind, [store.proxy.kind[template]!])
    store.proxy.flags = appendValues(store.proxy.flags, [store.proxy.flags[template]! & ~BULK_STORE_FLAG_REMOVED])
    store.proxy.label = appendValues(store.proxy.label, [store.proxy.label[template]!])
    store.proxy.position = appendValues(store.proxy.position, Array.from(
      store.proxy.position.slice(template * 3, template * 3 + 3),
      (value) => value * scale,
    ))
    store.proxy.form = appendValues(store.proxy.form, Array.from(
      store.proxy.form.slice(template * 2, template * 2 + 2),
      (value) => value * scale,
    ))
    store.proxy.material = appendValues(
      store.proxy.material,
      Array.from(store.proxy.material.slice(template * 6, template * 6 + 6)),
    )
    proxyByTemplateId.set(store.proxy.id[template]!, id)
    state.proxyHeadByOwner = growInt32(state.proxyHeadByOwner, owner + 1)
    state.proxyNext = growInt32(state.proxyNext, slot + 1)
    state.proxyNext[slot] = state.proxyHeadByOwner[owner] ?? -1
    state.proxyHeadByOwner[owner] = slot
    proxies.push(slot)
  }

  const transitionBatches = new Set<number>()
  for (let template = state.transitionHeadByOwner[templateOwner] ?? -1; template >= 0; template = state.transitionNext[template]!) {
    if ((store.transition.flags[template]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const oldBatch = store.transition.batch[template]!
    const oldBatchSlot = oldBatch - 1
    const flags = store.batch.flags[oldBatchSlot]!
    const material = lineMaterialFromStore(store, oldBatchSlot)
    const batch = findBatch(store, owner, BULK_STORE_BATCH_KIND.transition, flags, material)
    const slot = store.transition.id.length
    const id = slot + 1
    store.transition.id = appendValues(store.transition.id, [id])
    store.transition.source = appendValues(store.transition.source, [store.transition.source[template]!])
    store.transition.owner = appendValues(store.transition.owner, [owner])
    store.transition.from = appendValues(store.transition.from, [orbitalByTemplateId.get(store.transition.from[template]!) ?? 0])
    store.transition.to = appendValues(store.transition.to, [orbitalByTemplateId.get(store.transition.to[template]!) ?? 0])
    store.transition.flags = appendValues(store.transition.flags, [store.transition.flags[template]! & ~BULK_STORE_FLAG_REMOVED])
    store.transition.batch = appendValues(store.transition.batch, [batch])
    store.transition.control = appendValues(store.transition.control, Array.from(
      store.transition.control.slice(template * 12, template * 12 + 12),
      (value) => value * scale,
    ))
    state.transitionHeadByOwner = growInt32(state.transitionHeadByOwner, owner + 1)
    state.transitionNext = growInt32(state.transitionNext, slot + 1)
    state.transitionNext[slot] = state.transitionHeadByOwner[owner] ?? -1
    state.transitionHeadByOwner[owner] = slot
    const members = state.transitionSlotsByBatch.get(batch)
    if (members) members.add(slot)
    else state.transitionSlotsByBatch.set(batch, new Set([slot]))
    transitionBatches.add(batch)
  }

  const relationBatches = new Set<number>()
  for (let template = state.relationHeadByOwner[templateOwner] ?? -1; template >= 0; template = state.relationNextOwner[template]!) {
    if ((store.relation.flags[template]! & BULK_STORE_FLAG_REMOVED) !== 0 ||
        store.relation.kind[template] === BULK_STORE_RELATION_KIND["field-entanglement"]) continue
    const endpoint = (kind: number, id: number): number =>
      kind === BULK_STORE_ENDPOINT_KIND.field
        ? aliasByTemplateId.get(id) ?? 0
        : kind === BULK_STORE_ENDPOINT_KIND["field-proxy"]
          ? proxyByTemplateId.get(id) ?? 0
          : orbitalByTemplateId.get(id) ?? 0
    const a = endpoint(store.relation.aKind[template]!, store.relation.a[template]!)
    const b = endpoint(store.relation.bKind[template]!, store.relation.b[template]!)
    if (a === 0 || b === 0) continue
    const oldBatch = store.relation.batch[template]!
    let batch = 0
    if (oldBatch > 0) {
      const oldBatchSlot = oldBatch - 1
      batch = findBatch(
        store,
        owner,
        BULK_STORE_BATCH_KIND.relation,
        store.batch.flags[oldBatchSlot]!,
        lineMaterialFromStore(store, oldBatchSlot),
      )
    }
    const slot = appendRelationRow(store, {
      owner,
      kind: store.relation.kind[template]!,
      flags: store.relation.flags[template]! & ~BULK_STORE_FLAG_REMOVED,
      aKind: store.relation.aKind[template]!, a,
      bKind: store.relation.bKind[template]!, b,
      batch,
      controls: oldBatch === 0 ? [] : Array.from(
        store.relation.control.slice(
          store.relation.controlStart[template]!,
          store.relation.controlStart[template]! + 24,
        ),
        (value) => value * scale,
      ),
    })
    if (batch > 0) {
      const members = state.relationSlotsByBatch.get(batch)
      if (members) members.add(slot)
      else state.relationSlotsByBatch.set(batch, new Set([slot]))
      relationBatches.add(batch)
    }
  }
  for (const alias of aliases) {
    const source = nearestAncestorAlias(store, alias)
    if (source >= 0) appendEntanglement(store, source, alias)
  }
  return {aliases, orbitals, proxies, transitionBatches, relationBatches}
}

const applyStructuralFieldGeometry = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  seeds: ReadonlySet<number>,
  forcedOwner = 0,
): void => {
  if (seeds.size === 0 && forcedOwner === 0) return
  const geometry = regroupFieldAliases(store, seeds, forcedOwner)
  const transitionBatches = rebuildTransitionGeometry(store, geometry.orbitalSlots)
  const relationBatches = rebuildFieldRelationGeometry(
    store,
    geometry.aliasSlots,
    geometry.orbitalSlots,
    geometry.proxySlots,
  )
  renderer.fieldAliasesRegrouped(
    geometry.aliasSlots,
    geometry.fieldSlots,
    geometry.removedFieldSlots,
    geometry.darkSlots,
    geometry.orbitalSlots,
    geometry.proxySlots,
  )
  for (const batch of transitionBatches) if (batch > 0) renderer.transitionBatchChanged(batch)
  for (const batch of relationBatches) if (batch > 0) renderer.relationBatchChanged(batch)
}

const atomEntityPayload = (
  part: Particle,
  expectedId: number,
): Readonly<{atom: Record<string, unknown>; payload: Record<string, unknown>}> => {
  if (!isRecord(part.value)) throw new Error(`Bulk Store Atom ${expectedId} has no resulting row`)
  const atom = isRecord(part.value.atom) ? part.value.atom : part.value
  if (atom.id !== expectedId || typeof atom.wimp !== "string") {
    throw new Error(`Bulk Store Atom ${expectedId} resulting row is inconsistent`)
  }
  return {atom, payload: part.value}
}

const activeTemplateAtom = (
  store: BulkStore,
  wimp: number,
  excludedAtom: number,
): number | null => {
  let result: number | null = null
  for (const slot of indexes(store).atomDarkSlotsByWimp.get(wimp) ?? []) {
    if ((store.dark.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const atom = store.dark.id[slot]! / 2
    if (atom === excludedAtom || !Number.isInteger(atom)) continue
    if (result === null || atom < result) result = atom
  }
  return result
}

const materializeAtomFromSources = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  atom: number,
  wimp: number,
  payload: Record<string, unknown>,
  extraSeeds: ReadonlySet<number> = new Set(),
  forcedOwner = 0,
): void => {
  const state = indexes(store)
  const owner = darkId("atom", atom)
  const bindings = atomFieldBindings(payload)
  const aliases: number[] = []
  const sourceSlots = [...(state.fieldSourceSlotsByWimp.get(wimp) ?? [])]
    .filter((slot) => (store.fieldSource.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0)
    .sort((left, right) =>
      store.fieldSource.localId[left]! - store.fieldSource.localId[right]! ||
      store.fieldSource.id[left]! - store.fieldSource.id[right]!)
  for (const source of sourceSlots) {
    const kind = FIELD_KIND[store.fieldSource.kind[source]!]
    const field: CanonicalFieldDeclaration = {
      id: store.fieldSource.id[source]!,
      wimp: store.wimp.src[wimp - 1]!,
      localId: store.fieldSource.localId[source]!,
      key: store.text[store.fieldSource.key[source]!]!,
      type: kind === undefined || kind === "other" ? "string" : kind,
      label: store.text[store.fieldSource.label[source]!] || null,
    }
    aliases.push(appendAliasFromFieldDeclaration(
      store, field, atom, owner, bindings.get(field.id),
    ))
  }
  const seeds = new Set(extraSeeds)
  for (const alias of aliases) {
    seeds.add(alias)
    const value = store.fieldAlias.value[alias]!
    for (const member of state.aliasSlotsByValue.get(value) ?? []) seeds.add(member)
    const ancestor = nearestAncestorAlias(store, alias)
    if (ancestor >= 0) appendEntanglement(store, ancestor, alias)
  }
  state.stateOccurrenceIndexedOwners.add(owner)
  reconcileLocalStateOwner(store, renderer, owner, wimp, seeds, forcedOwner || owner)
  applyAtomStateFromPayload(store, renderer, atom, payload)
}

export const applyBulkAtomAdd = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const address = runtimeAddress(part.path)
  if (address?.kind !== "atom") throw new Error("Bulk Store Atom add has no runtime address")
  const {atom, payload} = atomEntityPayload(part, address.id)
  const src = atom.wimp as string
  const source = wimpSlot(store, src)
  if (source < 0 || (store.wimp.flags[source]! & BULK_STORE_FLAG_REMOVED) !== 0) {
    throw new Error(`Bulk Store Atom ${address.id} WIMP ${src} is absent`)
  }
  const parent = parentDarkFromEntity(atom, true)
  const order = Number(atom.position)
  if (!Number.isSafeInteger(order) || order < 0) throw new Error(`Bulk Store Atom ${address.id} position is invalid`)
  const slot = appendDarkRow(
    store,
    darkId("atom", address.id),
    parent,
    order,
    BULK_STORE_DARK_KIND.atom,
    source + 1,
    store.wimp.name[source]!,
  )
  normalizeDarkChildOrder(store, parent)
  renderer.darkAdded?.(slot)
  materializeAtomFromSources(
    store, renderer, address.id, source + 1, payload, new Set(), parent || darkId("atom", address.id),
  )
}

export const applyBulkTopologyAdd = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const address = runtimeAddress(part.path)
  if (address?.kind !== "topology" || !isRecord(part.value) || part.value.id !== address.id) {
    throw new Error("Bulk Store Topology add has no resulting row")
  }
  const kind = part.value.kind
  if (kind !== "fuzzy" && kind !== "macho" && kind !== "axion") {
    throw new Error(`Bulk Store Topology ${address.id} kind is invalid`)
  }
  const order = Number(part.value.position)
  if (!Number.isSafeInteger(order) || order < 0) {
    throw new Error(`Bulk Store Topology ${address.id} position is invalid`)
  }
  const slot = appendDarkRow(
    store,
    darkId("topology", address.id),
    parentDarkFromEntity(part.value, false),
    order,
    BULK_STORE_DARK_KIND[kind],
    0,
    0,
  )
  normalizeDarkChildOrder(store, store.dark.parent[slot]!)
  renderer.darkAdded?.(slot)
  applyStructuralFieldGeometry(
    store, renderer, new Set(), store.dark.parent[slot]! || store.dark.id[slot]!,
  )
}

const activeAliasesInDarkSubtree = (store: BulkStore, root: number): Set<number> => {
  const result = new Set<number>()
  for (const id of darkSubtree(store, root)) {
    if (id % 2 !== 0) continue
    for (const slot of activeAliasSlotsForAtom(store, id / 2)) result.add(slot)
  }
  return result
}

const dropStateOccurrenceOwner = (store: BulkStore, owner: number): void => {
  const state = indexes(store)
  const prefix = `atom/${owner / 2}/`
  for (const [key, slot] of [...state.stateOrbitalSlotByKey]) {
    if (!key.startsWith(prefix)) continue
    state.stateOrbitalSlotByKey.delete(key)
    state.stateOrbitalKeyById.delete(store.orbital.id[slot]!)
  }
  state.stateOccurrenceIndexedOwners.delete(owner)
}

const removeOwnedVisualRows = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  owner: number,
): Set<number> => {
  const state = indexes(store)
  const seeds = new Set<number>()
  if (owner % 2 === 0) dropStateOccurrenceOwner(store, owner)
  if (owner % 2 === 0) {
    for (const alias of activeAliasSlotsForAtom(store, owner / 2)) {
      const value = store.fieldAlias.value[alias]!
      for (const member of state.aliasSlotsByValue.get(value) ?? []) {
        if (member !== alias &&
            (store.fieldAlias.flags[member]! & BULK_STORE_FLAG_REMOVED) === 0) seeds.add(member)
      }
      state.aliasSlotsByValue.get(value)?.delete(alias)
      state.aliasSlotsByMarker.get(store.fieldAlias.marker[alias]!)?.delete(alias)
      removeIncidentEntanglement(store, store.fieldAlias.id[alias]!)
      setFlag(store.fieldAlias.flags, alias, BULK_STORE_FLAG_REMOVED, true)
      setFlag(store.field.flags, store.fieldAlias.marker[alias]! - 1, BULK_STORE_FLAG_REMOVED, true)
    }
  }
  for (let slot = state.orbitalHeadByOwner[owner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
    if (!setFlag(store.orbital.flags, slot, BULK_STORE_FLAG_REMOVED, true)) continue
    state.orbitalSlotById[store.orbital.id[slot]!] = -1
    renderer.orbitalRemoved?.(store.orbital.id[slot]!)
  }
  for (let slot = state.proxyHeadByOwner[owner] ?? -1; slot >= 0; slot = state.proxyNext[slot]!) {
    if (!setFlag(store.proxy.flags, slot, BULK_STORE_FLAG_REMOVED, true)) continue
    renderer.proxyRemoved?.(store.proxy.id[slot]!)
  }
  const transitionBatches = new Set<number>()
  for (let slot = state.transitionHeadByOwner[owner] ?? -1; slot >= 0; slot = state.transitionNext[slot]!) {
    if (!setFlag(store.transition.flags, slot, BULK_STORE_FLAG_REMOVED, true)) continue
    const batch = store.transition.batch[slot]!
    state.transitionSlotsByBatch.get(batch)?.delete(slot)
    transitionBatches.add(batch)
  }
  const relationBatches = new Set<number>()
  for (let slot = state.relationHeadByOwner[owner] ?? -1; slot >= 0; slot = state.relationNextOwner[slot]!) {
    if (!setFlag(store.relation.flags, slot, BULK_STORE_FLAG_REMOVED, true)) continue
    unindexRelation(store, slot)
    const batch = store.relation.batch[slot]!
    if (batch > 0) {
      state.relationSlotsByBatch.get(batch)?.delete(slot)
      relationBatches.add(batch)
    }
  }
  for (const batch of transitionBatches) renderer.transitionBatchChanged(batch)
  for (const batch of relationBatches) renderer.relationBatchChanged(batch)
  return seeds
}

const removeRuntimeDark = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  address: RuntimeAddress,
): void => {
  const state = indexes(store)
  const id = darkId(address.kind, address.id)
  const slot = state.darkSlotById[id] ?? -1
  if (slot < 0 || (store.dark.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) {
    throw new Error(`Bulk Store ${address.kind} ${address.id} is absent`)
  }
  for (let child = state.darkChildHead[id] ?? -1; child >= 0; child = state.darkChildNext[child]!) {
    if ((store.dark.flags[child]! & BULK_STORE_FLAG_REMOVED) === 0) {
      throw new Error(`Bulk Store ${address.kind} ${address.id} still has child ${store.dark.id[child]}`)
    }
  }
  const parent = store.dark.parent[slot]!
  const seeds = removeOwnedVisualRows(store, renderer, id)
  unlinkDarkChild(store, parent, slot)
  setFlag(store.dark.flags, slot, BULK_STORE_FLAG_REMOVED, true)
  normalizeDarkChildOrder(store, parent)
  state.darkSlotById[id] = -1
  if (store.dark.wimp[slot]! > 0) state.atomDarkSlotsByWimp.get(store.dark.wimp[slot]!)?.delete(slot)
  if (parent !== 0) for (const alias of activeAliasesInDarkSubtree(store, parent)) seeds.add(alias)
  applyStructuralFieldGeometry(store, renderer, seeds, parent)
  renderer.darkRemoved?.(id)
}

export const applyBulkAtomRemove = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const address = runtimeAddress(part.path)
  if (address?.kind !== "atom") throw new Error("Bulk Store Atom remove has no runtime address")
  removeRuntimeDark(store, renderer, address)
}

export const applyBulkTopologyRemove = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const address = runtimeAddress(part.path)
  if (address?.kind !== "topology") throw new Error("Bulk Store Topology remove has no runtime address")
  removeRuntimeDark(store, renderer, address)
}

const scaleRange = (
  values: BulkStoreNumericArray,
  start: number,
  count: number,
  scale: number,
): void => {
  for (let offset = 0; offset < count; offset++) values[start + offset] = values[start + offset]! * scale
}

const rescaleDarkSubtree = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  root: number,
  oldDepths: ReadonlyMap<number, number>,
): Set<number> => {
  const state = indexes(store)
  const seeds = new Set<number>()
  const transitionBatches = new Set<number>()
  const relationBatches = new Set<number>()
  for (const owner of darkSubtree(store, root)) {
    const slot = state.darkSlotById[owner] ?? -1
    if (slot < 0 || (store.dark.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const oldDepth = oldDepths.get(owner) ?? state.darkDepthById[owner]!
    const nextDepth = state.darkDepthById[owner]!
    const scale = torusLevelScale(nextDepth) / torusLevelScale(oldDepth)
    if (Math.abs(scale - 1) <= 1e-9) continue
    scaleRange(store.dark.form, slot * 2, 2, scale)
    renderer.darkChanged?.(slot)
    if (owner % 2 === 0) for (const alias of activeAliasSlotsForAtom(store, owner / 2)) seeds.add(alias)
    for (let orbital = state.orbitalHeadByOwner[owner] ?? -1; orbital >= 0; orbital = state.orbitalNext[orbital]!) {
      if ((store.orbital.flags[orbital]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
      scaleRange(store.orbital.position, orbital * 3, 3, scale)
      scaleRange(store.orbital.form, orbital * 2, 2, scale)
      renderer.darkChanged?.(slot)
      renderer.orbitalAdded?.(orbital)
    }
    for (let proxy = state.proxyHeadByOwner[owner] ?? -1; proxy >= 0; proxy = state.proxyNext[proxy]!) {
      if ((store.proxy.flags[proxy]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
      scaleRange(store.proxy.position, proxy * 3, 3, scale)
      scaleRange(store.proxy.form, proxy * 2, 2, scale)
      renderer.proxyAdded?.(proxy)
    }
    for (let transition = state.transitionHeadByOwner[owner] ?? -1; transition >= 0; transition = state.transitionNext[transition]!) {
      if ((store.transition.flags[transition]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
      scaleRange(store.transition.control, transition * 12, 12, scale)
      transitionBatches.add(store.transition.batch[transition]!)
    }
    for (let relation = state.relationHeadByOwner[owner] ?? -1; relation >= 0; relation = state.relationNextOwner[relation]!) {
      if ((store.relation.flags[relation]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
      const start = store.relation.controlStart[relation]!
      if (start >= 0) scaleRange(store.relation.control, start, 24, scale)
      const batch = store.relation.batch[relation]!
      if (batch > 0) relationBatches.add(batch)
    }
  }
  for (const batch of transitionBatches) renderer.transitionBatchChanged(batch)
  for (const batch of relationBatches) renderer.relationBatchChanged(batch)
  return seeds
}

const oldSubtreeDepths = (store: BulkStore, root: number): Map<number, number> =>
  new Map([...darkSubtree(store, root)].map((id) => [id, darkDepth(store, id)] as const))

const updateRuntimeDarkRow = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  address: RuntimeAddress,
  entity: Record<string, unknown>,
): Readonly<{slot: number; seeds: Set<number>; wimpChanged: boolean; layoutOwner: number}> => {
  const state = indexes(store)
  const id = darkId(address.kind, address.id)
  const slot = state.darkSlotById[id] ?? -1
  if (slot < 0) throw new Error(`Bulk Store ${address.kind} ${address.id} is absent`)
  const oldDepth = oldSubtreeDepths(store, id)
  const previousParent = store.dark.parent[slot]!
  const nextParent = parentDarkFromEntity(entity, address.kind === "atom")
  if (nextParent !== previousParent) {
    if (nextParent !== 0 && (state.darkSlotById[nextParent] ?? -1) < 0) {
      throw new Error(`Bulk Store Dark ${id} has no parent ${nextParent}`)
    }
    unlinkDarkChild(store, previousParent, slot)
    store.dark.parent[slot] = nextParent
    linkDarkChild(store, nextParent, slot)
  }
  const order = Number(entity.position)
  if (!Number.isSafeInteger(order) || order < 0) throw new Error(`Bulk Store Dark ${id} position is invalid`)
  store.dark.order[slot] = order
  normalizeDarkChildOrder(store, previousParent)
  if (nextParent !== previousParent) normalizeDarkChildOrder(store, nextParent)
  let wimpChanged = false
  if (address.kind === "atom") {
    if (typeof entity.wimp !== "string") throw new Error(`Bulk Store Atom ${address.id} has no WIMP`)
    const nextWimpSlot = wimpSlot(store, entity.wimp)
    if (nextWimpSlot < 0) throw new Error(`Bulk Store Atom ${address.id} WIMP ${entity.wimp} is absent`)
    const nextWimp = nextWimpSlot + 1
    const previousWimp = store.dark.wimp[slot]!
    wimpChanged = previousWimp !== nextWimp
    if (wimpChanged) {
      state.atomDarkSlotsByWimp.get(previousWimp)?.delete(slot)
      const members = state.atomDarkSlotsByWimp.get(nextWimp)
      if (members) members.add(slot)
      else state.atomDarkSlotsByWimp.set(nextWimp, new Set([slot]))
      store.dark.wimp[slot] = nextWimp
      store.dark.label[slot] = store.wimp.name[nextWimpSlot]!
    }
  } else {
    const kind = entity.kind
    if (kind !== "fuzzy" && kind !== "macho" && kind !== "axion") {
      throw new Error(`Bulk Store Topology ${address.id} kind is invalid`)
    }
    store.dark.kind[slot] = BULK_STORE_DARK_KIND[kind]
    writeQuantum(
      store.dark.material,
      slot,
      visualContextTorusMaterial(visualDarkParticleColor({
        activity: "neutral", darkParticleKind: kind,
      })),
    )
  }
  updateDarkDepths(store, id)
  const seeds = rescaleDarkSubtree(store, renderer, id, oldDepth)
  if (previousParent !== 0) for (const alias of activeAliasesInDarkSubtree(store, previousParent)) seeds.add(alias)
  if (nextParent !== 0) for (const alias of activeAliasesInDarkSubtree(store, nextParent)) seeds.add(alias)
  renderer.darkChanged?.(slot)
  const affectedParents = [previousParent, nextParent].filter((parent) => parent > 0)
  const layoutOwner = affectedParents.length === 0
    ? id
    : highestCommonDarkOwner(store, affectedParents)
  return {slot, seeds, wimpChanged, layoutOwner}
}

const applyAtomBindings = (
  store: BulkStore,
  atom: number,
  payload: Record<string, unknown>,
): Set<number> => {
  const bindings = atomFieldBindings(payload)
  const state = indexes(store)
  const seeds = new Set<number>()
  const changed = new Map<number, number>()
  for (const slot of activeAliasSlotsForAtom(store, atom)) {
    const binding = bindings.get(store.fieldAlias.field[slot]!)
    const previous = store.fieldAlias.value[slot]!
    const next = binding?.value ?? 0
    if (previous === next && store.fieldAlias.valueText[slot] === textSlot(store, binding?.text ?? null)) continue
    changed.set(slot, previous)
    for (const member of state.aliasSlotsByValue.get(previous) ?? []) seeds.add(member)
    for (const member of state.aliasSlotsByValue.get(next) ?? []) seeds.add(member)
    state.aliasSlotsByValue.get(previous)?.delete(slot)
    if (next > 0) {
      const members = state.aliasSlotsByValue.get(next)
      if (members) members.add(slot)
      else state.aliasSlotsByValue.set(next, new Set([slot]))
    }
    store.fieldAlias.value[slot] = next
    store.fieldAlias.valueText[slot] = textSlot(store, binding?.text ?? null)
    seeds.add(slot)
  }
  for (const slot of rebuildLocalEntanglement(store, changed, seeds)) seeds.add(slot)
  return seeds
}

const applyAtomStateFromPayload = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  atom: number,
  payload: Record<string, unknown>,
): void => {
  if (!isRecord(payload.state)) return
  const selected = payload.state.metaState
  if (selected === null) return
  if (!Number.isSafeInteger(selected)) throw new Error(`Bulk Store Atom ${atom} State is invalid`)
  const owner = darkId("atom", atom)
  const state = indexes(store)
  for (let slot = state.orbitalHeadByOwner[owner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
    if ((store.orbital.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0 ||
        store.orbital.kind[slot] !== BULK_STORE_ORBITAL_KIND.state ||
        store.orbital.source[slot] !== selected ||
        store.orbital.sleeve[slot] !== selected) continue
    applyBulkPhotonReplace(store, renderer, {
      part: "photon", op: "replace", path: atom, ts: 0,
      value: store.text[store.orbital.label[slot]!]!,
    })
    return
  }
}

export const applyBulkAtomReplace = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const address = runtimeAddress(part.path)
  if (address?.kind !== "atom") throw new Error("Bulk Store Atom replace has no runtime address")
  const {atom, payload} = atomEntityPayload(part, address.id)
  const updated = updateRuntimeDarkRow(store, renderer, address, atom)
  const seeds = new Set(updated.seeds)
  if (updated.wimpChanged) {
    for (const alias of removeOwnedVisualRows(store, renderer, darkId("atom", address.id))) seeds.add(alias)
    const wimp = store.dark.wimp[updated.slot]!
    materializeAtomFromSources(
      store, renderer, address.id, wimp, payload, seeds, updated.layoutOwner,
    )
    return
  } else {
    for (const alias of applyAtomBindings(store, address.id, payload)) seeds.add(alias)
  }
  applyStructuralFieldGeometry(store, renderer, seeds, updated.layoutOwner)
  applyAtomStateFromPayload(store, renderer, address.id, payload)
}

export const applyBulkTopologyReplace = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const address = runtimeAddress(part.path)
  if (address?.kind !== "topology" || !isRecord(part.value) || part.value.id !== address.id) {
    throw new Error("Bulk Store Topology replace has no resulting row")
  }
  const updated = updateRuntimeDarkRow(store, renderer, address, part.value)
  applyStructuralFieldGeometry(store, renderer, updated.seeds, updated.layoutOwner)
}

const rekeyRuntimeDark = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  source: RuntimeAddress,
  target: RuntimeAddress,
): void => {
  if (source.kind !== target.kind) throw new Error("Bulk Store runtime move changes table kind")
  const state = indexes(store)
  const previous = darkId(source.kind, source.id)
  const next = darkId(target.kind, target.id)
  const slot = state.darkSlotById[previous] ?? -1
  if (slot < 0) throw new Error(`Bulk Store ${source.kind} ${source.id} is absent`)
  if (source.kind === "atom" && store.dark.wimp[slot]! > 0) {
    ensureStateOccurrenceIndex(store, new Set([store.dark.wimp[slot]!]))
  }
  state.darkSlotById = growInt32(state.darkSlotById, next + 1)
  if ((state.darkSlotById[next] ?? -1) >= 0) {
    throw new Error(`Bulk Store ${target.kind} ${target.id} already exists`)
  }
  renderer.darkRemoved?.(previous)
  store.dark.id[slot] = next
  state.darkSlotById[previous] = -1
  state.darkSlotById[next] = slot
  state.darkDepthById = growInt32(state.darkDepthById, next + 1)
  state.darkDepthById[next] = state.darkDepthById[previous]!
  state.darkDepthById[previous] = -1
  state.darkChildHead = growInt32(state.darkChildHead, next + 1)
  state.darkChildHead[next] = state.darkChildHead[previous] ?? -1
  state.darkChildHead[previous] = -1
  for (let child = state.darkChildHead[next] ?? -1; child >= 0; child = state.darkChildNext[child]!) {
    store.dark.parent[child] = next
    renderer.darkChanged?.(child)
  }
  if (store.root === previous) store.root = next
  const seeds = new Set<number>()
  if (source.kind === "atom") {
    const previousPrefix = `atom/${source.id}/`
    for (const [key, orbital] of [...state.stateOrbitalSlotByKey]) {
      if (!key.startsWith(previousPrefix)) continue
      const nextKey = `atom/${target.id}/${key.slice(previousPrefix.length)}`
      state.stateOrbitalSlotByKey.delete(key)
      state.stateOrbitalSlotByKey.set(nextKey, orbital)
      state.stateOrbitalKeyById.set(store.orbital.id[orbital]!, nextKey)
    }
    if (state.stateOccurrenceIndexedOwners.delete(previous)) {
      state.stateOccurrenceIndexedOwners.add(next)
    }
    for (const alias of activeAliasSlotsForAtom(store, source.id)) {
      store.fieldAlias.atom[alias] = target.id
      seeds.add(alias)
    }
    state.aliasHeadByAtom = growInt32(state.aliasHeadByAtom, target.id + 1)
    state.aliasHeadByAtom[target.id] = state.aliasHeadByAtom[source.id] ?? -1
    state.aliasHeadByAtom[source.id] = -1
  }
  for (const fieldSlot of state.fieldSlotsByOwner.get(previous) ?? []) {
    store.field.owner[fieldSlot] = next
    const members = state.fieldSlotsByOwner.get(next)
    if (members) members.add(fieldSlot)
    else state.fieldSlotsByOwner.set(next, new Set([fieldSlot]))
  }
  state.fieldSlotsByOwner.delete(previous)
  for (let orbital = state.orbitalHeadByOwner[previous] ?? -1; orbital >= 0; orbital = state.orbitalNext[orbital]!) {
    store.orbital.owner[orbital] = next
    renderer.orbitalAdded?.(orbital)
  }
  state.orbitalHeadByOwner = growInt32(state.orbitalHeadByOwner, next + 1)
  state.orbitalHeadByOwner[next] = state.orbitalHeadByOwner[previous] ?? -1
  state.orbitalHeadByOwner[previous] = -1
  for (let proxy = state.proxyHeadByOwner[previous] ?? -1; proxy >= 0; proxy = state.proxyNext[proxy]!) {
    store.proxy.owner[proxy] = next
    renderer.proxyAdded?.(proxy)
  }
  state.proxyHeadByOwner = growInt32(state.proxyHeadByOwner, next + 1)
  state.proxyHeadByOwner[next] = state.proxyHeadByOwner[previous] ?? -1
  state.proxyHeadByOwner[previous] = -1
  const transitionBatches = new Set<number>()
  for (let transition = state.transitionHeadByOwner[previous] ?? -1; transition >= 0; transition = state.transitionNext[transition]!) {
    store.transition.owner[transition] = next
    transitionBatches.add(store.transition.batch[transition]!)
  }
  state.transitionHeadByOwner = growInt32(state.transitionHeadByOwner, next + 1)
  state.transitionHeadByOwner[next] = state.transitionHeadByOwner[previous] ?? -1
  state.transitionHeadByOwner[previous] = -1
  const relationBatches = new Set<number>()
  for (let relation = state.relationHeadByOwner[previous] ?? -1; relation >= 0; relation = state.relationNextOwner[relation]!) {
    store.relation.owner[relation] = next
    const batch = store.relation.batch[relation]!
    if (batch > 0) relationBatches.add(batch)
  }
  state.relationHeadByOwner = growInt32(state.relationHeadByOwner, next + 1)
  state.relationHeadByOwner[next] = state.relationHeadByOwner[previous] ?? -1
  state.relationHeadByOwner[previous] = -1
  for (let batch = state.batchHeadByOwner[previous] ?? -1; batch >= 0; batch = state.batchNext[batch]!) {
    store.batch.owner[batch] = next
  }
  state.batchHeadByOwner = growInt32(state.batchHeadByOwner, next + 1)
  state.batchHeadByOwner[next] = state.batchHeadByOwner[previous] ?? -1
  state.batchHeadByOwner[previous] = -1
  renderer.darkAdded?.(slot)
  const layoutOwner = store.dark.parent[slot]! || next
  if (source.kind === "atom") {
    reconcileLocalStateOwner(store, renderer, next, store.dark.wimp[slot]!, seeds, layoutOwner)
  } else {
    applyStructuralFieldGeometry(store, renderer, seeds, layoutOwner)
  }
  for (const batch of transitionBatches) renderer.transitionBatchChanged(batch)
  for (const batch of relationBatches) renderer.relationBatchChanged(batch)
}

const runtimeMove = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
  kind: RuntimeAddress["kind"],
): void => {
  const target = runtimeAddress(part.path)
  const source = runtimeAddress(part.from)
  if (target?.kind !== kind || source?.kind !== kind) {
    throw new Error(`Bulk Store ${kind} move has no exact source/target`)
  }
  rekeyRuntimeDark(store, renderer, source, target)
  if (isRecord(part.value)) {
    if (kind === "atom") applyBulkAtomReplace(store, renderer, {...part, op: "replace"})
    else applyBulkTopologyReplace(store, renderer, {...part, op: "replace"})
  }
}

export const applyBulkAtomMove = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => runtimeMove(store, renderer, part, "atom")

export const applyBulkTopologyMove = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => runtimeMove(store, renderer, part, "topology")

export const applyBulkAtomCopy = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const target = runtimeAddress(part.path)
  const source = runtimeAddress(part.from)
  if (target?.kind !== "atom" || source?.kind !== "atom") {
    throw new Error("Bulk Store Atom copy has no exact source/target")
  }
  if (isRecord(part.value)) {
    applyBulkAtomAdd(store, renderer, {...part, op: "add"})
    return
  }
  const state = indexes(store)
  const sourceOwner = darkId("atom", source.id)
  const sourceSlot = state.darkSlotById[sourceOwner] ?? -1
  if (sourceSlot < 0) throw new Error(`Bulk Store Atom ${source.id} is absent`)
  const owner = darkId("atom", target.id)
  const slot = appendDarkRow(
    store, owner, store.dark.parent[sourceSlot]!, store.dark.order[sourceSlot]!,
    BULK_STORE_DARK_KIND.atom, store.dark.wimp[sourceSlot]!, store.dark.label[sourceSlot]!,
  )
  normalizeDarkChildOrder(store, store.dark.parent[slot]!)
  renderer.darkAdded?.(slot)
  const cloned = cloneAtomRows(store, source.id, target.id, owner, {}, true)
  for (const orbital of cloned.orbitals) renderer.orbitalAdded?.(orbital)
  for (const proxy of cloned.proxies) renderer.proxyAdded?.(proxy)
  applyStructuralFieldGeometry(
    store, renderer, new Set(cloned.aliases), store.dark.parent[slot]!,
  )
  for (const batch of cloned.transitionBatches) renderer.transitionBatchChanged(batch)
  for (const batch of cloned.relationBatches) renderer.relationBatchChanged(batch)
}

export const applyBulkTopologyCopy = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const target = runtimeAddress(part.path)
  const source = runtimeAddress(part.from)
  if (target?.kind !== "topology" || source?.kind !== "topology") {
    throw new Error("Bulk Store Topology copy has no exact source/target")
  }
  if (isRecord(part.value)) {
    applyBulkTopologyAdd(store, renderer, {...part, op: "add"})
    return
  }
  const sourceSlot = indexes(store).darkSlotById[darkId("topology", source.id)] ?? -1
  if (sourceSlot < 0) throw new Error(`Bulk Store Topology ${source.id} is absent`)
  const slot = appendDarkRow(
    store, darkId("topology", target.id), store.dark.parent[sourceSlot]!,
    store.dark.order[sourceSlot]!, store.dark.kind[sourceSlot]!, 0,
    store.dark.label[sourceSlot]!,
  )
  normalizeDarkChildOrder(store, store.dark.parent[slot]!)
  renderer.darkAdded?.(slot)
  applyStructuralFieldGeometry(
    store, renderer, new Set(), store.dark.parent[slot]! || store.dark.id[slot]!,
  )
}

const declarationWimpSrc = (part: Particle): string | null => {
  if (!isRecord(part.value)) return null
  const src = part.path === "wimp" ? part.value.src : part.value.wimp
  return typeof src === "string" && src.length > 0 ? src : null
}

type CanonicalFieldDeclaration = Readonly<{
  id: number
  wimp: string
  localId: number
  key: string
  type: keyof typeof BULK_STORE_FIELD_KIND
  label: string | null
}>

const canonicalFieldDeclaration = (part: Particle): CanonicalFieldDeclaration => {
  if (part.path !== "field" || !isRecord(part.value)) {
    throw new Error("Bulk Store Field operation has no resulting relational row")
  }
  const id = Number(part.value.id)
  const localId = Number(part.value.localId)
  const type = part.value.type
  if (!Number.isSafeInteger(id) || id <= 0 ||
      !Number.isSafeInteger(localId) || localId <= 0 ||
      typeof part.value.wimp !== "string" || part.value.wimp.length === 0 ||
      typeof part.value.key !== "string" || part.value.key.length === 0 ||
      typeof type !== "string" || !(type in BULK_STORE_FIELD_KIND)) {
    throw new Error("Bulk Store Field operation has an invalid relational row")
  }
  return {
    id,
    wimp: part.value.wimp,
    localId,
    key: part.value.key,
    type: type as keyof typeof BULK_STORE_FIELD_KIND,
    label: typeof part.value.label === "string" ? part.value.label : null,
  }
}

const activeAtomSlotsForWimp = (store: BulkStore, src: string): number[] => {
  const slot = wimpSlot(store, src)
  if (slot < 0 || (store.wimp.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) {
    throw new Error(`Bulk Store WIMP ${src} is absent`)
  }
  return [...(indexes(store).atomDarkSlotsByWimp.get(slot + 1) ?? [])]
    .filter((darkSlot) => (store.dark.flags[darkSlot]! & BULK_STORE_FLAG_REMOVED) === 0)
}

const appendAliasFromFieldDeclaration = (
  store: BulkStore,
  field: CanonicalFieldDeclaration,
  atom: number,
  owner: number,
  binding?: AtomFieldBinding,
): number => {
  const state = indexes(store)
  const markerSlot = appendFieldMarker(store, owner)
  store.field.field[markerSlot] = field.id
  store.field.kind[markerSlot] = BULK_STORE_FIELD_KIND[field.type]
  store.field.flags[markerSlot] = BULK_STORE_FLAG_ACTIVE
  store.field.key[markerSlot] = textSlot(store, field.key)
  store.field.label[markerSlot] = textSlot(store, field.label ?? field.key)
  store.field.value[markerSlot] = binding?.value ?? 0
  store.field.valueText[markerSlot] = textSlot(store, binding?.text ?? null)
  const slot = store.fieldAlias.id.length
  const id = slot + 1
  store.fieldAlias.id = appendValues(store.fieldAlias.id, [id])
  store.fieldAlias.flags = appendValues(store.fieldAlias.flags, [0])
  store.fieldAlias.atom = appendValues(store.fieldAlias.atom, [atom])
  store.fieldAlias.field = appendValues(store.fieldAlias.field, [field.id])
  store.fieldAlias.value = appendValues(store.fieldAlias.value, [binding?.value ?? 0])
  store.fieldAlias.marker = appendValues(store.fieldAlias.marker, [markerSlot + 1])
  store.fieldAlias.order = appendValues(store.fieldAlias.order, [field.localId])
  store.fieldAlias.orbit = appendValues(store.fieldAlias.orbit, [0])
  store.fieldAlias.valueText = appendValues(
    store.fieldAlias.valueText,
    [textSlot(store, binding?.text ?? null)],
  )
  state.aliasHeadByAtom = growInt32(state.aliasHeadByAtom, atom + 1)
  state.aliasNext = growInt32(state.aliasNext, slot + 1)
  state.aliasNext[slot] = state.aliasHeadByAtom[atom] ?? -1
  state.aliasHeadByAtom[atom] = slot
  const markers = state.aliasSlotsByMarker.get(markerSlot + 1)
  if (markers) markers.add(slot)
  else state.aliasSlotsByMarker.set(markerSlot + 1, new Set([slot]))
  const fields = state.aliasSlotsByField.get(field.id)
  if (fields) fields.add(slot)
  else state.aliasSlotsByField.set(field.id, new Set([slot]))
  if (binding && binding.value > 0) {
    const values = state.aliasSlotsByValue.get(binding.value)
    if (values) values.add(slot)
    else state.aliasSlotsByValue.set(binding.value, new Set([slot]))
  }
  return slot
}

const removeRelationsForEndpoint = (
  store: BulkStore,
  kind: number,
  id: number,
): Set<number> => {
  const state = indexes(store)
  const batches = new Set<number>()
  for (const slot of [...(state.relationSlotsByEndpoint[kind]?.get(id) ?? [])]) {
    if ((store.relation.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    if (!setFlag(store.relation.flags, slot, BULK_STORE_FLAG_REMOVED, true)) continue
    unindexRelation(store, slot)
    const batch = store.relation.batch[slot]!
    if (batch > 0) {
      state.relationSlotsByBatch.get(batch)?.delete(slot)
      batches.add(batch)
    }
  }
  return batches
}

const removeFieldDeclarationAliases = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  field: number,
  keepAtoms: ReadonlySet<number> = new Set(),
): Set<number> => {
  const state = indexes(store)
  const seeds = new Set<number>()
  const removedMarkers = new Set<number>()
  const touchedRelationBatches = new Set<number>()
  for (const slot of [...(state.aliasSlotsByField.get(field) ?? [])]) {
    if ((store.fieldAlias.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0 ||
        keepAtoms.has(store.fieldAlias.atom[slot]!)) continue
    // The removed occurrence still names the exact owner whose local layout
    // must close the gap after its marker disappears.
    seeds.add(slot)
    const value = store.fieldAlias.value[slot]!
    for (const member of state.aliasSlotsByValue.get(value) ?? []) {
      if (member !== slot && (store.fieldAlias.flags[member]! & BULK_STORE_FLAG_REMOVED) === 0) seeds.add(member)
    }
    const marker = store.fieldAlias.marker[slot]!
    for (const member of state.aliasSlotsByMarker.get(marker) ?? []) {
      if (member !== slot && (store.fieldAlias.flags[member]! & BULK_STORE_FLAG_REMOVED) === 0) seeds.add(member)
    }
    state.aliasSlotsByValue.get(value)?.delete(slot)
    state.aliasSlotsByMarker.get(marker)?.delete(slot)
    state.aliasSlotsByField.get(field)?.delete(slot)
    removeIncidentEntanglement(store, store.fieldAlias.id[slot]!)
    for (const batch of removeRelationsForEndpoint(
      store, BULK_STORE_ENDPOINT_KIND.field, store.fieldAlias.id[slot]!,
    )) touchedRelationBatches.add(batch)
    setFlag(store.fieldAlias.flags, slot, BULK_STORE_FLAG_REMOVED, true)
    if ((state.aliasSlotsByMarker.get(marker)?.size ?? 0) === 0) {
      const markerSlot = marker - 1
      if (setFlag(store.field.flags, markerSlot, BULK_STORE_FLAG_REMOVED, true)) {
        removedMarkers.add(markerSlot)
      }
    }
    const owner = store.fieldAlias.atom[slot]! * 2
    for (let proxy = state.proxyHeadByOwner[owner] ?? -1; proxy >= 0; proxy = state.proxyNext[proxy]!) {
      if (store.proxy.sourceField[proxy] !== field ||
          !setFlag(store.proxy.flags, proxy, BULK_STORE_FLAG_REMOVED, true)) continue
      for (const batch of removeRelationsForEndpoint(
        store, BULK_STORE_ENDPOINT_KIND["field-proxy"], store.proxy.id[proxy]!,
      )) touchedRelationBatches.add(batch)
      renderer.proxyRemoved?.(store.proxy.id[proxy]!)
    }
  }
  applyStructuralFieldGeometry(store, renderer, seeds)
  if (removedMarkers.size > 0) {
    renderer.fieldAliasesRegrouped([], [], [...removedMarkers], [], [], [])
  }
  for (const batch of touchedRelationBatches) renderer.relationBatchChanged(batch)
  return seeds
}

const upsertFieldSource = (
  store: BulkStore,
  part: Particle,
  field: CanonicalFieldDeclaration,
): SourceRowMutation => {
  const state = indexes(store)
  const sourceId = declarationSourceRowId(part, field.id)
  let slot = state.fieldSourceSlotById[field.id] ?? -1
  if (part.op === "move" && sourceId !== field.id) {
    slot = sourceRowSlot(state.fieldSourceSlotById, sourceId, "Field")
    state.fieldSourceSlotById[sourceId] = -1
  }
  const nextWimp = sourceWimp(store, field.wimp, "Field")
  const previousWimp = slot < 0 ? 0 : store.fieldSource.wimp[slot]!
  if (slot < 0) {
    slot = store.fieldSource.id.length
    store.fieldSource.id = appendValues(store.fieldSource.id, [field.id])
    store.fieldSource.wimp = appendValues(store.fieldSource.wimp, [nextWimp])
    store.fieldSource.localId = appendValues(store.fieldSource.localId, [field.localId])
    store.fieldSource.kind = appendValues(store.fieldSource.kind, [BULK_STORE_FIELD_KIND[field.type]])
    store.fieldSource.key = appendValues(store.fieldSource.key, [textSlot(store, field.key)])
    store.fieldSource.label = appendValues(store.fieldSource.label, [textSlot(store, field.label ?? field.key)])
    store.fieldSource.flags = appendValues(store.fieldSource.flags, [0])
  } else {
    store.fieldSource.id[slot] = field.id
    store.fieldSource.wimp[slot] = nextWimp
    store.fieldSource.localId[slot] = field.localId
    store.fieldSource.kind[slot] = BULK_STORE_FIELD_KIND[field.type]
    store.fieldSource.key[slot] = textSlot(store, field.key)
    store.fieldSource.label[slot] = textSlot(store, field.label ?? field.key)
    store.fieldSource.flags[slot] = store.fieldSource.flags[slot]! & ~BULK_STORE_FLAG_REMOVED
    if (previousWimp > 0) state.fieldSourceSlotsByWimp.get(previousWimp)?.delete(slot)
  }
  state.fieldSourceSlotById = growInt32(state.fieldSourceSlotById, field.id + 1)
  state.fieldSourceSlotById[field.id] = slot
  const members = state.fieldSourceSlotsByWimp.get(nextWimp)
  if (members) members.add(slot)
  else state.fieldSourceSlotsByWimp.set(nextWimp, new Set([slot]))
  return {slot, sourceId, previousWimp}
}

const removeFieldSource = (store: BulkStore, id: number): number => {
  const state = indexes(store)
  const slot = sourceRowSlot(state.fieldSourceSlotById, id, "Field")
  setFlag(store.fieldSource.flags, slot, BULK_STORE_FLAG_REMOVED, true)
  state.fieldSourceSlotsByWimp.get(store.fieldSource.wimp[slot]!)?.delete(slot)
  return slot
}

const applyBulkFieldUpsert = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const field = canonicalFieldDeclaration(part)
  upsertFieldSource(store, part, field)
  const targetAtoms = new Set(activeAtomSlotsForWimp(store, field.wimp).map((slot) =>
    store.dark.id[slot]! / 2))
  if ((part.op === "move" || part.op === "copy") &&
      (!Number.isSafeInteger(part.from) || Number(part.from) <= 0)) {
    throw new Error(`Bulk Store Field ${part.op} has no persisted source row id`)
  }
  if (part.op === "move" && Number(part.from) !== field.id) {
    removeFieldDeclarationAliases(store, renderer, Number(part.from))
  }
  removeFieldDeclarationAliases(store, renderer, field.id, targetAtoms)
  const state = indexes(store)
  const seeds = new Set<number>()
  const heldByAtom = new Map<number, number>()
  for (const slot of state.aliasSlotsByField.get(field.id) ?? []) {
    if ((store.fieldAlias.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const atom = store.fieldAlias.atom[slot]!
    if (!targetAtoms.has(atom)) continue
    heldByAtom.set(atom, slot)
    seeds.add(slot)
  }
  for (const atom of targetAtoms) {
    if (heldByAtom.has(atom)) continue
    seeds.add(appendAliasFromFieldDeclaration(store, field, atom, darkId("atom", atom)))
  }
  applyStructuralFieldGeometry(store, renderer, seeds)
}

export const applyBulkFieldAdd = applyBulkFieldUpsert
export const applyBulkFieldReplace = applyBulkFieldUpsert
export const applyBulkFieldMove = applyBulkFieldUpsert
export const applyBulkFieldCopy = applyBulkFieldUpsert

export const applyBulkFieldRemove = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const field = canonicalFieldDeclaration(part)
  removeFieldDeclarationAliases(store, renderer, field.id)
  removeFieldSource(store, field.id)
}

type CanonicalNumericDeclaration = Readonly<{
  id: number
  wimp: string
  localId: number
  value: Record<string, unknown>
}>

const canonicalNumericDeclaration = (
  part: Particle,
  path: string,
): CanonicalNumericDeclaration => {
  if (part.path !== path || !isRecord(part.value)) {
    throw new Error(`Bulk Store ${path} operation has no resulting relational row`)
  }
  const id = Number(part.value.id)
  const localId = Number(part.value.localId)
  if (!Number.isSafeInteger(id) || id <= 0 ||
      !Number.isSafeInteger(localId) || localId <= 0 ||
      typeof part.value.wimp !== "string" || part.value.wimp.length === 0) {
    throw new Error(`Bulk Store ${path} operation has an invalid relational row`)
  }
  return {id, wimp: part.value.wimp, localId, value: part.value}
}

type SourceRowMutation = Readonly<{slot: number; sourceId: number; previousWimp: number}>

const sourceWimp = (store: BulkStore, src: string, label: string): number => {
  const slot = wimpSlot(store, src)
  if (slot < 0 || (store.wimp.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) {
    throw new Error(`Bulk Store ${label} WIMP ${src} is absent`)
  }
  return slot + 1
}

const sourceRowSlot = (
  slots: Int32Array,
  id: number,
  label: string,
): number => {
  const slot = slots[id] ?? -1
  if (slot < 0) throw new Error(`Bulk Store ${label} source row ${id} is absent`)
  return slot
}

const upsertStateSource = (
  store: BulkStore,
  part: Particle,
  row: CanonicalNumericDeclaration,
): SourceRowMutation => {
  const position = Number(row.value.position)
  if (typeof row.value.name !== "string" || row.value.name.length === 0 ||
      !Number.isSafeInteger(position) || position < 0) {
    throw new Error("Bulk Store State has invalid name/position")
  }
  const state = indexes(store)
  const sourceId = declarationSourceRowId(part, row.id)
  let slot = state.stateSourceSlotById[row.id] ?? -1
  if (part.op === "move" && sourceId !== row.id) {
    slot = sourceRowSlot(state.stateSourceSlotById, sourceId, "State")
    state.stateSourceSlotById[sourceId] = -1
  }
  const nextWimp = sourceWimp(store, row.wimp, "State")
  const previousWimp = slot < 0 ? 0 : store.stateSource.wimp[slot]!
  if (slot < 0) {
    slot = store.stateSource.id.length
    store.stateSource.id = appendValues(store.stateSource.id, [row.id])
    store.stateSource.wimp = appendValues(store.stateSource.wimp, [nextWimp])
    store.stateSource.position = appendValues(store.stateSource.position, [position])
    store.stateSource.name = appendValues(store.stateSource.name, [textSlot(store, row.value.name)])
    store.stateSource.flags = appendValues(store.stateSource.flags, [0])
  } else {
    store.stateSource.id[slot] = row.id
    store.stateSource.wimp[slot] = nextWimp
    store.stateSource.position[slot] = position
    store.stateSource.name[slot] = textSlot(store, row.value.name)
    store.stateSource.flags[slot] = store.stateSource.flags[slot]! & ~BULK_STORE_FLAG_REMOVED
    if (previousWimp > 0) state.stateSourceSlotsByWimp.get(previousWimp)?.delete(slot)
  }
  state.stateSourceSlotById = growInt32(state.stateSourceSlotById, row.id + 1)
  state.stateSourceSlotById[row.id] = slot
  const members = state.stateSourceSlotsByWimp.get(nextWimp)
  if (members) members.add(slot)
  else state.stateSourceSlotsByWimp.set(nextWimp, new Set([slot]))
  return {slot, sourceId, previousWimp}
}

const removeStateSource = (
  store: BulkStore,
  row: CanonicalNumericDeclaration,
): number => {
  const state = indexes(store)
  const slot = sourceRowSlot(state.stateSourceSlotById, row.id, "State")
  setFlag(store.stateSource.flags, slot, BULK_STORE_FLAG_REMOVED, true)
  state.stateSourceSlotsByWimp.get(store.stateSource.wimp[slot]!)?.delete(slot)
  return slot
}

const upsertTransitionSource = (
  store: BulkStore,
  part: Particle,
  row: CanonicalNumericDeclaration,
): SourceRowMutation => {
  const fromState = Number(row.value.fromState)
  const toState = Number(row.value.toState)
  const position = Number(row.value.position)
  if (!Number.isSafeInteger(fromState) || fromState <= 0 ||
      !Number.isSafeInteger(toState) || toState <= 0 ||
      !Number.isSafeInteger(position) || position < 0) {
    throw new Error("Bulk Store Transition has invalid relational State ids")
  }
  const state = indexes(store)
  const sourceId = declarationSourceRowId(part, row.id)
  let slot = state.transitionSourceSlotById[row.id] ?? -1
  if (part.op === "move" && sourceId !== row.id) {
    slot = sourceRowSlot(state.transitionSourceSlotById, sourceId, "Transition")
    state.transitionSourceSlotById[sourceId] = -1
  }
  const nextWimp = sourceWimp(store, row.wimp, "Transition")
  const previousWimp = slot < 0 ? 0 : store.transitionSource.wimp[slot]!
  if (slot < 0) {
    slot = store.transitionSource.id.length
    store.transitionSource.id = appendValues(store.transitionSource.id, [row.id])
    store.transitionSource.wimp = appendValues(store.transitionSource.wimp, [nextWimp])
    store.transitionSource.fromState = appendValues(store.transitionSource.fromState, [fromState])
    store.transitionSource.toState = appendValues(store.transitionSource.toState, [toState])
    store.transitionSource.position = appendValues(store.transitionSource.position, [position])
    store.transitionSource.flags = appendValues(store.transitionSource.flags, [0])
  } else {
    store.transitionSource.id[slot] = row.id
    store.transitionSource.wimp[slot] = nextWimp
    store.transitionSource.fromState[slot] = fromState
    store.transitionSource.toState[slot] = toState
    store.transitionSource.position[slot] = position
    store.transitionSource.flags[slot] = store.transitionSource.flags[slot]! & ~BULK_STORE_FLAG_REMOVED
    if (previousWimp > 0) state.transitionSourceSlotsByWimp.get(previousWimp)?.delete(slot)
  }
  state.transitionSourceSlotById = growInt32(state.transitionSourceSlotById, row.id + 1)
  state.transitionSourceSlotById[row.id] = slot
  const members = state.transitionSourceSlotsByWimp.get(nextWimp)
  if (members) members.add(slot)
  else state.transitionSourceSlotsByWimp.set(nextWimp, new Set([slot]))
  return {slot, sourceId, previousWimp}
}

const removeTransitionSource = (
  store: BulkStore,
  row: CanonicalNumericDeclaration,
): number => {
  const state = indexes(store)
  const slot = sourceRowSlot(state.transitionSourceSlotById, row.id, "Transition")
  setFlag(store.transitionSource.flags, slot, BULK_STORE_FLAG_REMOVED, true)
  state.transitionSourceSlotsByWimp.get(store.transitionSource.wimp[slot]!)?.delete(slot)
  return slot
}

const upsertConditionSource = (
  store: BulkStore,
  part: Particle,
  row: CanonicalNumericDeclaration,
): SourceRowMutation => {
  const transition = Number(row.value.transition)
  const field = Number(row.value.field)
  const position = Number(row.value.position)
  if (!Number.isSafeInteger(transition) || transition <= 0 ||
      !Number.isSafeInteger(field) || field <= 0 ||
      !Number.isSafeInteger(position) || position < 0) {
    throw new Error("Bulk Store Condition has invalid relational ids")
  }
  const state = indexes(store)
  const sourceId = declarationSourceRowId(part, row.id)
  let slot = state.conditionSourceSlotById[row.id] ?? -1
  if (part.op === "move" && sourceId !== row.id) {
    slot = sourceRowSlot(state.conditionSourceSlotById, sourceId, "Condition")
    state.conditionSourceSlotById[sourceId] = -1
  }
  const nextWimp = sourceWimp(store, row.wimp, "Condition")
  const previousWimp = slot < 0 ? 0 : store.conditionSource.wimp[slot]!
  const previousTransition = slot < 0 ? 0 : store.conditionSource.transition[slot]!
  if (slot < 0) {
    slot = store.conditionSource.id.length
    store.conditionSource.id = appendValues(store.conditionSource.id, [row.id])
    store.conditionSource.wimp = appendValues(store.conditionSource.wimp, [nextWimp])
    store.conditionSource.transition = appendValues(store.conditionSource.transition, [transition])
    store.conditionSource.field = appendValues(store.conditionSource.field, [field])
    store.conditionSource.position = appendValues(store.conditionSource.position, [position])
    store.conditionSource.flags = appendValues(store.conditionSource.flags, [0])
  } else {
    store.conditionSource.id[slot] = row.id
    store.conditionSource.wimp[slot] = nextWimp
    store.conditionSource.transition[slot] = transition
    store.conditionSource.field[slot] = field
    store.conditionSource.position[slot] = position
    store.conditionSource.flags[slot] = store.conditionSource.flags[slot]! & ~BULK_STORE_FLAG_REMOVED
    if (previousTransition > 0) {
      state.conditionSourceSlotsByTransition.get(previousTransition)?.delete(slot)
    }
  }
  state.conditionSourceSlotById = growInt32(state.conditionSourceSlotById, row.id + 1)
  state.conditionSourceSlotById[row.id] = slot
  const members = state.conditionSourceSlotsByTransition.get(transition)
  if (members) members.add(slot)
  else state.conditionSourceSlotsByTransition.set(transition, new Set([slot]))
  return {slot, sourceId, previousWimp}
}

const removeConditionSource = (
  store: BulkStore,
  row: CanonicalNumericDeclaration,
): number => {
  const state = indexes(store)
  const slot = sourceRowSlot(state.conditionSourceSlotById, row.id, "Condition")
  setFlag(store.conditionSource.flags, slot, BULK_STORE_FLAG_REMOVED, true)
  state.conditionSourceSlotsByTransition.get(store.conditionSource.transition[slot]!)?.delete(slot)
  return slot
}

type LocalStateOccurrence = Readonly<{
  key: string
  layout: StateGraphRootLayout
  node: StateGraphRootLayout["nodes"][number]
  prepared: PreparedStateLayout
  rootStateId: number
}>

type LocalStatePlan = Readonly<{
  atom: number
  currentStateId: number | null
  occurrences: readonly LocalStateOccurrence[]
  owner: number
  prepared: readonly PreparedStateLayout[]
  wimp: number
}>

const stateOccurrenceKey = (
  atom: number,
  rootState: number,
  node: StateGraphRootLayout["nodes"][number],
): string => {
  if (node.end === "missing-state") {
    throw new Error(`Bulk Store State layout ${rootState} has missing State ${node.stateId}`)
  }
  const prefix = `root/${rootState}/path/`
  const suffix = `/state/${node.stateId}`
  if (!node.id.startsWith(prefix) || !node.id.endsWith(suffix)) {
    throw new Error(`Bulk Store State layout node ${node.id} has no occurrence`)
  }
  const path = node.id.slice(prefix.length, node.id.length - suffix.length)
  return `atom/${atom}/sleeve/${rootState}/state/${node.stateId}/path/${path}`
}

const currentStateForOwner = (store: BulkStore, owner: number): number | null => {
  const state = indexes(store)
  for (let slot = state.orbitalHeadByOwner[owner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
    if ((store.orbital.flags[slot]! & (BULK_STORE_FLAG_REMOVED | BULK_STORE_FLAG_CURRENT)) ===
        BULK_STORE_FLAG_CURRENT &&
        store.orbital.kind[slot] === BULK_STORE_ORBITAL_KIND.state &&
        store.orbital.source[slot] === store.orbital.sleeve[slot]) {
      return store.orbital.source[slot]!
    }
  }
  return null
}

const processContentByState = (
  store: BulkStore,
  owner: number,
): ReadonlyMap<number, Readonly<{minimumMajorRadius: number; minimumTubeRadius: number}>> => {
  const state = indexes(store)
  const darkSlot = state.darkSlotById[owner] ?? -1
  const wimp = darkSlot < 0 ? 0 : store.dark.wimp[darkSlot]!
  const scale = torusLevelScale(state.darkDepthById[owner] ?? 0)
  const processKinds = new Set<number>([
    BULK_STORE_ORBITAL_KIND.process,
    BULK_STORE_ORBITAL_KIND.finally,
  ])
  const byAnchor = new Map<number, number[]>()
  for (let slot = state.orbitalHeadByOwner[owner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
    if ((store.orbital.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0 ||
        !processKinds.has(store.orbital.kind[slot]!)) continue
    const anchor = store.orbital.anchor[slot]!
    if (anchor <= 0) continue
    const held = byAnchor.get(anchor)
    if (held) held.push(slot)
    else byAnchor.set(anchor, [slot])
  }
  const processFieldRadius = STATE_GRAPH_PRODUCTION_SIZING.fieldRadius * torusLevelScale(1)
  const contentGap = processFieldRadius * TORUS_LAYOUT_BASELINE.contentGapToFieldRadius
  const result = new Map<number, {minimumMajorRadius: number; minimumTubeRadius: number}>()
  if ((state.processSourceSlotsByWimp.get(wimp)?.size ?? 0) > 0) {
    const stateIdByName = new Map<string, number>()
    for (const slot of state.stateSourceSlotsByWimp.get(wimp) ?? []) {
      if ((store.stateSource.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
      const name = store.text[store.stateSource.name[slot]!] ?? ""
      if (!stateIdByName.has(name)) stateIdByName.set(name, store.stateSource.id[slot]!)
    }
    const outerByState = new Map<number, number[]>()
    for (const slot of state.processSourceSlotsByWimp.get(wimp) ?? []) {
      if ((store.processSource.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
      const source = stateIdByName.get(store.text[store.processSource.state[slot]!] ?? "")
      if (source === undefined) continue
      const readStart = store.processSource.readStart[slot]!
      const writeStart = store.processSource.writeStart[slot]!
      const fields = new Set([
        ...store.processField.slice(readStart, readStart + store.processSource.readCount[slot]!),
        ...store.processField.slice(writeStart, writeStart + store.processSource.writeCount[slot]!),
      ])
      const layout = layoutFieldsInPseudoCircle(fields.size, processFieldRadius)
      const form = resolveContentTorusForm({
        coreExtent: layout.radius,
        emptyOuterRadius: STATE_GRAPH_PRODUCTION_SIZING.emptyOuterRadius * torusLevelScale(1),
        gap: contentGap,
      })
      const held = outerByState.get(source)
      if (held) held.push(form.outerRadius)
      else outerByState.set(source, [form.outerRadius])
    }
    for (const [source, outer] of outerByState) {
      const minimumTubeRadius = Math.max(...outer) + contentGap
      const minimumMajorRadius = outer.length < 2 ? 0 : Math.max(
        ...outer.map((radius, index) => {
          const next = outer[(index + 1) % outer.length]!
          return (radius + next + STATE_GRAPH_PRODUCTION_SIZING.surfaceGap) /
            (2 * Math.sin(Math.PI / outer.length))
        }),
      )
      result.set(source, {minimumMajorRadius, minimumTubeRadius})
    }
    return result
  }
  for (const [anchor, slots] of byAnchor) {
    const anchorSlot = state.orbitalSlotById[anchor] ?? -1
    if (anchorSlot < 0) continue
    const outer = slots.map((slot) =>
      (store.orbital.form[slot * 2]! + store.orbital.form[slot * 2 + 1]!) / scale)
    const minimumTubeRadius = Math.max(...outer) + contentGap
    const minimumMajorRadius = slots.length < 2 ? 0 : Math.max(
      ...outer.map((radius, index) => {
        const next = outer[(index + 1) % outer.length]!
        return (radius + next + STATE_GRAPH_PRODUCTION_SIZING.surfaceGap) /
          (2 * Math.sin(Math.PI / slots.length))
      }),
    )
    const source = store.orbital.source[anchorSlot]!
    const held = result.get(source)
    result.set(source, {
      minimumMajorRadius: Math.max(held?.minimumMajorRadius ?? 0, minimumMajorRadius),
      minimumTubeRadius: Math.max(held?.minimumTubeRadius ?? 0, minimumTubeRadius),
    })
  }
  return result
}

const localStatePlan = (
  store: BulkStore,
  owner: number,
  wimp: number,
): LocalStatePlan => {
  const state = indexes(store)
  const atom = owner / 2
  const fields = new Map<number, BulkRuntimeField>()
  for (let slot = state.aliasHeadByAtom[atom] ?? -1; slot >= 0; slot = state.aliasNext[slot]!) {
    if ((store.fieldAlias.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const id = store.fieldAlias.field[slot]!
    if (fields.has(id)) continue
    const source = fieldSourceSlot(store, id)
    if (source < 0 || (store.fieldSource.flags[source]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const kind = FIELD_KIND[store.fieldSource.kind[source]!]
    fields.set(id, {
      id,
      wimp: store.wimp.src[wimp - 1]!,
      key: store.text[store.fieldSource.key[source]!] ?? `field-${id}`,
      label: store.text[store.fieldSource.label[source]!] ?? null,
      type: kind === "other" || kind === undefined ? "string" : kind,
    })
  }
  const states: BulkRuntimeState[] = [...(state.stateSourceSlotsByWimp.get(wimp) ?? [])]
    .filter((slot) => (store.stateSource.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0)
    .map((slot) => ({
      id: store.stateSource.id[slot]!,
      wimp: store.wimp.src[wimp - 1]!,
      name: store.text[store.stateSource.name[slot]!] ?? `State ${store.stateSource.id[slot]}`,
      position: store.stateSource.position[slot]!,
    }))
  const transitions: BulkRuntimeTransition[] = [
    ...(state.transitionSourceSlotsByWimp.get(wimp) ?? []),
  ]
    .filter((slot) => (store.transitionSource.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0)
    .map((slot) => ({
      id: store.transitionSource.id[slot]!,
      wimp: store.wimp.src[wimp - 1]!,
      fromState: store.transitionSource.fromState[slot]!,
      toState: store.transitionSource.toState[slot]!,
      position: store.transitionSource.position[slot]!,
    }))
  const conditions: BulkRuntimeCondition[] = transitions.flatMap((transition) =>
    [...(state.conditionSourceSlotsByTransition.get(transition.id) ?? [])]
      .filter((slot) => (store.conditionSource.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0 &&
        store.conditionSource.wimp[slot] === wimp)
      .map((slot) => ({
        id: store.conditionSource.id[slot]!,
        wimp: store.wimp.src[wimp - 1]!,
        transition: store.conditionSource.transition[slot]!,
        field: store.conditionSource.field[slot]!,
        position: store.conditionSource.position[slot]!,
        predicate: null,
      })),
  )
  const currentStateId = currentStateForOwner(store, owner)
  const graph = buildStateGraphFromFacts({
    atomId: atom,
    atomLabel: store.text[store.dark.label[state.darkSlotById[owner]!]!] ??
      store.wimp.src[wimp - 1]!,
    currentStateId,
    src: store.wimp.src[wimp - 1]!,
    fields: [...fields.values()],
    states,
    transitions,
    conditions,
  })
  const index = indexStateGraphLayout(graph)
  const content = processContentByState(store, owner)
  const sizing = content.size > 0
    ? {...STATE_GRAPH_PRODUCTION_SIZING, orbitalContentByStateId: content}
    : STATE_GRAPH_PRODUCTION_SIZING
  const prepared = graph.states.flatMap((source) => {
    const value = prepareStateLayout(
      buildStateGraphBranchLayoutFromIndex(index, source.id, sizing),
    )
    return value ? [value] : []
  })
  return {
    atom,
    currentStateId,
    occurrences: prepared.flatMap((entry) => entry.layout.nodes
      .filter((node) => node.end !== "missing-state")
      .map((node) => ({
        key: stateOccurrenceKey(atom, entry.layout.rootStateId, node),
        layout: entry.layout,
        node,
        prepared: entry,
        rootStateId: entry.layout.rootStateId,
      }))),
    owner,
    prepared,
    wimp,
  }
}

const ensureStateOccurrenceIndex = (
  store: BulkStore,
  wimps: ReadonlySet<number>,
): void => {
  const state = indexes(store)
  for (const wimp of wimps) {
    if (wimp <= 0 || (state.stateSourceSlotsByWimp.get(wimp)?.size ?? 0) === 0) continue
    for (const darkSlot of state.atomDarkSlotsByWimp.get(wimp) ?? []) {
      if ((store.dark.flags[darkSlot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
      const owner = store.dark.id[darkSlot]!
      if (state.stateOccurrenceIndexedOwners.has(owner)) continue
      const desired = localStatePlan(store, owner, wimp).occurrences
      const actual: number[] = []
      for (let slot = state.orbitalHeadByOwner[owner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
        if ((store.orbital.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0 &&
            store.orbital.kind[slot] === BULK_STORE_ORBITAL_KIND.state) actual.push(slot)
      }
      actual.sort((left, right) => store.orbital.id[left]! - store.orbital.id[right]!)
      if (actual.length !== desired.length) {
        throw new Error(`Bulk Store owner ${owner} State occurrence count is inconsistent`)
      }
      desired.forEach((entry, index) => {
        const slot = actual[index]!
        if (store.orbital.source[slot] !== entry.node.stateId ||
            store.orbital.sleeve[slot] !== entry.rootStateId) {
          throw new Error(`Bulk Store owner ${owner} State occurrence order is inconsistent`)
        }
        state.stateOrbitalSlotByKey.set(entry.key, slot)
        state.stateOrbitalKeyById.set(store.orbital.id[slot]!, entry.key)
      })
      state.stateOccurrenceIndexedOwners.add(owner)
    }
  }
}

const appendOrbitalClone = (
  store: BulkStore,
  template: number,
  input: Readonly<{
    source: number
    owner?: number
    kind?: number
    flags?: number
    anchor?: number
    sleeve?: number
    related?: readonly number[]
    label?: string
  }>,
): number => {
  const state = indexes(store)
  const slot = store.orbital.id.length
  const id = slot + 1
  const owner = input.owner ?? store.orbital.owner[template]!
  const sourceStart = store.orbital.relatedStart[template]!
  const sourceCount = store.orbital.relatedCount[template]!
  const related = input.related ?? Array.from(
    store.orbitalRelatedState.slice(sourceStart, sourceStart + sourceCount),
  )
  const relatedStart = store.orbitalRelatedState.length
  store.orbitalRelatedState = appendValues(store.orbitalRelatedState, related)
  store.orbital.id = appendValues(store.orbital.id, [id])
  store.orbital.source = appendValues(store.orbital.source, [input.source])
  store.orbital.owner = appendValues(store.orbital.owner, [owner])
  store.orbital.kind = appendValues(store.orbital.kind, [input.kind ?? store.orbital.kind[template]!])
  store.orbital.flags = appendValues(store.orbital.flags, [
    (input.flags ?? store.orbital.flags[template]!) & ~BULK_STORE_FLAG_REMOVED,
  ])
  store.orbital.anchor = appendValues(store.orbital.anchor, [input.anchor ?? store.orbital.anchor[template]!])
  store.orbital.sleeve = appendValues(store.orbital.sleeve, [input.sleeve ?? store.orbital.sleeve[template]!])
  store.orbital.relatedStart = appendValues(store.orbital.relatedStart, [relatedStart])
  store.orbital.relatedCount = appendValues(store.orbital.relatedCount, [related.length])
  store.orbital.label = appendValues(store.orbital.label, [
    input.label === undefined ? store.orbital.label[template]! : textSlot(store, input.label),
  ])
  store.orbital.position = appendValues(
    store.orbital.position,
    Array.from(store.orbital.position.slice(template * 3, template * 3 + 3)),
  )
  store.orbital.form = appendValues(
    store.orbital.form,
    Array.from(store.orbital.form.slice(template * 2, template * 2 + 2)),
  )
  store.orbital.material = appendValues(
    store.orbital.material,
    Array.from(store.orbital.material.slice(
      template * BULK_STORE_QUANTUM_MATERIAL_STRIDE,
      (template + 1) * BULK_STORE_QUANTUM_MATERIAL_STRIDE,
    )),
  )
  state.orbitalSlotById = growInt32(state.orbitalSlotById, id + 1)
  state.orbitalSlotById[id] = slot
  state.orbitalHeadByOwner = growInt32(state.orbitalHeadByOwner, owner + 1)
  state.orbitalNext = growInt32(state.orbitalNext, slot + 1)
  state.orbitalNext[slot] = state.orbitalHeadByOwner[owner] ?? -1
  state.orbitalHeadByOwner[owner] = slot
  return slot
}

const appendStateOccurrence = (
  store: BulkStore,
  owner: number,
  source: number,
  sleeve: number,
  label: string,
): number => {
  const state = indexes(store)
  const slot = store.orbital.id.length
  const id = slot + 1
  const relatedStart = store.orbitalRelatedState.length
  store.orbitalRelatedState = appendValues(store.orbitalRelatedState, [source])
  store.orbital.id = appendValues(store.orbital.id, [id])
  store.orbital.source = appendValues(store.orbital.source, [source])
  store.orbital.owner = appendValues(store.orbital.owner, [owner])
  store.orbital.kind = appendValues(store.orbital.kind, [BULK_STORE_ORBITAL_KIND.state])
  store.orbital.flags = appendValues(store.orbital.flags, [BULK_STORE_FLAG_TORUS])
  store.orbital.anchor = appendValues(store.orbital.anchor, [0])
  store.orbital.sleeve = appendValues(store.orbital.sleeve, [sleeve])
  store.orbital.relatedStart = appendValues(store.orbital.relatedStart, [relatedStart])
  store.orbital.relatedCount = appendValues(store.orbital.relatedCount, [1])
  store.orbital.label = appendValues(store.orbital.label, [textSlot(store, label)])
  store.orbital.position = appendValues(store.orbital.position, [0, 0, 0])
  store.orbital.form = appendValues(store.orbital.form, [0, 0])
  store.orbital.material = appendValues(
    store.orbital.material,
    new Array(BULK_STORE_QUANTUM_MATERIAL_STRIDE).fill(0),
  )
  state.orbitalSlotById = growInt32(state.orbitalSlotById, id + 1)
  state.orbitalSlotById[id] = slot
  state.orbitalHeadByOwner = growInt32(state.orbitalHeadByOwner, owner + 1)
  state.orbitalNext = growInt32(state.orbitalNext, slot + 1)
  state.orbitalNext[slot] = state.orbitalHeadByOwner[owner] ?? -1
  state.orbitalHeadByOwner[owner] = slot
  return slot
}

const shiftStateDependents = (
  store: BulkStore,
  owner: number,
  stateId: number,
  delta: StorePoint,
): void => {
  if (Math.hypot(delta.x, delta.y, delta.z) <= 1e-9) return
  const state = indexes(store)
  for (let slot = state.orbitalHeadByOwner[owner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
    if (store.orbital.kind[slot] === BULK_STORE_ORBITAL_KIND.state ||
        store.orbital.anchor[slot] !== stateId ||
        (store.orbital.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const start = slot * 3
    store.orbital.position[start] = store.orbital.position[start]! + delta.x
    store.orbital.position[start + 1] = store.orbital.position[start + 1]! + delta.y
    store.orbital.position[start + 2] = store.orbital.position[start + 2]! + delta.z
  }
  for (let slot = state.proxyHeadByOwner[owner] ?? -1; slot >= 0; slot = state.proxyNext[slot]!) {
    if (store.proxy.state[slot] !== stateId ||
        (store.proxy.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const start = slot * 3
    store.proxy.position[start] = store.proxy.position[start]! + delta.x
    store.proxy.position[start + 1] = store.proxy.position[start + 1]! + delta.y
    store.proxy.position[start + 2] = store.proxy.position[start + 2]! + delta.z
  }
}

const appendProxyRow = (
  store: BulkStore,
  owner: number,
  field: number,
  marker: number,
  stateId: number,
): number => {
  const runtime = indexes(store)
  const slot = store.proxy.id.length
  const id = slot + 1
  store.proxy.id = appendValues(store.proxy.id, [id])
  store.proxy.field = appendValues(store.proxy.field, [marker])
  store.proxy.sourceField = appendValues(store.proxy.sourceField, [field])
  store.proxy.owner = appendValues(store.proxy.owner, [owner])
  store.proxy.state = appendValues(store.proxy.state, [stateId])
  store.proxy.paint = appendValues(store.proxy.paint, [0])
  store.proxy.kind = appendValues(store.proxy.kind, [0])
  store.proxy.flags = appendValues(store.proxy.flags, [0])
  store.proxy.label = appendValues(store.proxy.label, [0])
  store.proxy.position = appendValues(store.proxy.position, [0, 0, 0])
  store.proxy.form = appendValues(store.proxy.form, [0, 0])
  store.proxy.material = appendValues(
    store.proxy.material,
    new Array(BULK_STORE_QUANTUM_MATERIAL_STRIDE).fill(0),
  )
  runtime.proxyHeadByOwner = growInt32(runtime.proxyHeadByOwner, owner + 1)
  runtime.proxyNext = growInt32(runtime.proxyNext, slot + 1)
  runtime.proxyNext[slot] = runtime.proxyHeadByOwner[owner] ?? -1
  runtime.proxyHeadByOwner[owner] = slot
  return slot
}

const proxyHasCausalRelation = (store: BulkStore, owner: number, proxyId: number): boolean => {
  const state = indexes(store)
  void owner
  for (const slot of state.relationSlotsByEndpoint[BULK_STORE_ENDPOINT_KIND["field-proxy"]]
    ?.get(proxyId) ?? []) {
    if ((store.relation.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0 ||
        store.relation.kind[slot] === BULK_STORE_RELATION_KIND["field-projection"]) continue
    return true
  }
  return false
}

const ensureFieldProjection = (
  store: BulkStore,
  owner: number,
  alias: number,
  proxy: number,
  active: boolean,
): number => {
  const state = indexes(store)
  for (const slot of state.relationSlotsByEndpoint[BULK_STORE_ENDPOINT_KIND.field]
    ?.get(alias) ?? []) {
    if ((store.relation.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0 ||
        store.relation.kind[slot] !== BULK_STORE_RELATION_KIND["field-projection"]) continue
    const matches = store.relation.aKind[slot] === BULK_STORE_ENDPOINT_KIND.field &&
      store.relation.a[slot] === alias &&
      store.relation.bKind[slot] === BULK_STORE_ENDPOINT_KIND["field-proxy"] &&
      store.relation.b[slot] === proxy
    if (!matches) continue
    setFlag(store.relation.flags, slot, BULK_STORE_FLAG_ACTIVE, active)
    return slot
  }
  return appendRelationRow(store, {
    owner,
    kind: BULK_STORE_RELATION_KIND["field-projection"],
    flags: active ? BULK_STORE_FLAG_ACTIVE : 0,
    aKind: BULK_STORE_ENDPOINT_KIND.field,
    a: alias,
    bKind: BULK_STORE_ENDPOINT_KIND["field-proxy"],
    b: proxy,
    batch: 0,
    controls: [],
  })
}

const appendTransitionOccurrence = (
  store: BulkStore,
  owner: number,
  source: number,
  from: number,
  to: number,
  flags: number,
  batch: number,
): number => {
  const state = indexes(store)
  const slot = store.transition.id.length
  const id = slot + 1
  store.transition.id = appendValues(store.transition.id, [id])
  store.transition.source = appendValues(store.transition.source, [source])
  store.transition.owner = appendValues(store.transition.owner, [owner])
  store.transition.from = appendValues(store.transition.from, [from])
  store.transition.to = appendValues(store.transition.to, [to])
  store.transition.flags = appendValues(store.transition.flags, [flags])
  store.transition.batch = appendValues(store.transition.batch, [batch])
  store.transition.control = appendValues(store.transition.control, new Array(12).fill(0))
  state.transitionHeadByOwner = growInt32(state.transitionHeadByOwner, owner + 1)
  state.transitionNext = growInt32(state.transitionNext, slot + 1)
  state.transitionNext[slot] = state.transitionHeadByOwner[owner] ?? -1
  state.transitionHeadByOwner[owner] = slot
  const members = state.transitionSlotsByBatch.get(batch)
  if (members) members.add(slot)
  else state.transitionSlotsByBatch.set(batch, new Set([slot]))
  return slot
}

type CausalRelationTemplate = Readonly<{
  field: number
  kind: number
  orbitalOnA: boolean
}>

type CausalGroup = Readonly<{
  kind: number
  label: string
  related: readonly number[]
  relations: readonly CausalRelationTemplate[]
  slots: readonly number[]
  source: number
  template: number
}>

const stablePhaseValue = (value: string): number => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2
}

const causalGroupsForOwner = (store: BulkStore, owner: number): CausalGroup[] => {
  const state = indexes(store)
  const grouped = new Map<string, number[]>()
  for (let slot = state.orbitalHeadByOwner[owner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
    if ((store.orbital.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0 ||
        store.orbital.kind[slot] === BULK_STORE_ORBITAL_KIND.state) continue
    const key = `${store.orbital.kind[slot]}:${store.orbital.source[slot]}`
    const held = grouped.get(key)
    if (held) held.push(slot)
    else grouped.set(key, [slot])
  }
  const visual = new Map<string, CausalGroup>()
  for (const [key, slots] of grouped) {
    slots.sort((left, right) => store.orbital.id[left]! - store.orbital.id[right]!)
    const template = slots[0]!
    const orbital = store.orbital.id[template]!
    const relations: CausalRelationTemplate[] = []
    for (const relation of state.relationSlotsByEndpoint[BULK_STORE_ENDPOINT_KIND.orbital]
      ?.get(orbital) ?? []) {
      if ((store.relation.flags[relation]! & BULK_STORE_FLAG_REMOVED) !== 0 ||
          store.relation.kind[relation] === BULK_STORE_RELATION_KIND["field-projection"]) continue
      const orbitalOnA = store.relation.aKind[relation] === BULK_STORE_ENDPOINT_KIND.orbital &&
        store.relation.a[relation] === orbital
      const orbitalOnB = store.relation.bKind[relation] === BULK_STORE_ENDPOINT_KIND.orbital &&
        store.relation.b[relation] === orbital
      if (!orbitalOnA && !orbitalOnB) continue
      const proxyKind = orbitalOnA ? store.relation.bKind[relation] : store.relation.aKind[relation]
      const proxy = orbitalOnA ? store.relation.b[relation]! : store.relation.a[relation]!
      if (proxyKind !== BULK_STORE_ENDPOINT_KIND["field-proxy"] || proxy <= 0) continue
      relations.push({
        field: store.proxy.sourceField[proxy - 1]!,
        kind: store.relation.kind[relation]!,
        orbitalOnA,
      })
    }
    visual.set(key, {
      kind: store.orbital.kind[template]!,
      label: store.text[store.orbital.label[template]!] ?? "",
      // Existing orbitals only provide reusable slots/templates. Canonical
      // Process/Reaction source rows below decide whether a group still exists
      // and which States it belongs to. Leaving related empty makes a stale
      // visual group remove itself during the local reconciliation.
      related: [],
      relations,
      slots,
      source: store.orbital.source[template]!,
      template,
    })
  }
  const darkSlot = state.darkSlotById[owner] ?? -1
  const wimp = darkSlot < 0 ? 0 : store.dark.wimp[darkSlot]!
  if (wimp === 0) return [...visual.values()]
  const states = [...(state.stateSourceSlotsByWimp.get(wimp) ?? [])]
    .filter((slot) => (store.stateSource.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0)
    .sort((left, right) => store.stateSource.position[left]! - store.stateSource.position[right]! ||
      store.stateSource.id[left]! - store.stateSource.id[right]!)
  const stateIds = states.map((slot) => store.stateSource.id[slot]!)
  const stateIdByName = new Map<string, number>()
  for (const slot of states) {
    const name = store.text[store.stateSource.name[slot]!] ?? ""
    if (!stateIdByName.has(name)) stateIdByName.set(name, store.stateSource.id[slot]!)
  }
  for (const sourceSlot of state.processSourceSlotsByWimp.get(wimp) ?? []) {
    if ((store.processSource.flags[sourceSlot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const source = store.processSource.id[sourceSlot]!
    const kind = store.processSource.kind[sourceSlot] === 1
      ? BULK_STORE_ORBITAL_KIND.finally
      : BULK_STORE_ORBITAL_KIND.process
    const key = `${kind}:${source}`
    const held = visual.get(key)
    const readStart = store.processSource.readStart[sourceSlot]!
    const writeStart = store.processSource.writeStart[sourceSlot]!
    const relations: CausalRelationTemplate[] = [
      ...Array.from(store.processField.slice(
        readStart, readStart + store.processSource.readCount[sourceSlot]!,
      ), (field) => ({
        field,
        kind: BULK_STORE_RELATION_KIND["process-read"],
        orbitalOnA: false,
      })),
      ...Array.from(store.processField.slice(
        writeStart, writeStart + store.processSource.writeCount[sourceSlot]!,
      ), (field) => ({
        field,
        kind: BULK_STORE_RELATION_KIND["process-write"],
        orbitalOnA: true,
      })),
    ]
    const related = stateIdByName.get(store.text[store.processSource.state[sourceSlot]!] ?? "")
    visual.set(key, {
      kind,
      label: store.text[store.processSource.label[sourceSlot]!] ?? "",
      related: related === undefined ? [] : [related],
      relations,
      slots: held?.slots ?? [],
      source,
      template: held?.template ?? -1,
    })
  }
  for (const sourceSlot of state.reactionSourceSlotsByWimp.get(wimp) ?? []) {
    if ((store.reactionSource.flags[sourceSlot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const source = store.reactionSource.id[sourceSlot]!
    const kind = BULK_STORE_ORBITAL_KIND.reaction
    const key = `${kind}:${source}`
    const held = visual.get(key)
    const readStart = store.reactionSource.readStart[sourceSlot]!
    const writeStart = store.reactionSource.writeStart[sourceSlot]!
    const stateStart = store.reactionSource.stateStart[sourceSlot]!
    const relations: CausalRelationTemplate[] = [
      ...Array.from(store.reactionField.slice(
        readStart, readStart + store.reactionSource.readCount[sourceSlot]!,
      ), (field) => ({
        field,
        kind: BULK_STORE_RELATION_KIND["reaction-read"],
        orbitalOnA: false,
      })),
      ...Array.from(store.reactionField.slice(
        writeStart, writeStart + store.reactionSource.writeCount[sourceSlot]!,
      ), (field) => ({
        field,
        kind: BULK_STORE_RELATION_KIND["reaction-write"],
        orbitalOnA: true,
      })),
    ]
    visual.set(key, {
      kind,
      label: store.text[store.reactionSource.label[sourceSlot]!] ?? "",
      related: store.reactionSource.allStates[sourceSlot] === 1
        ? stateIds
        : Array.from(store.reactionState.slice(
          stateStart, stateStart + store.reactionSource.stateCount[sourceSlot]!,
        )),
      relations,
      slots: held?.slots ?? [],
      source,
      template: held?.template ?? -1,
    })
  }
  return [...visual.values()]
}

const ensureCausalProxy = (
  store: BulkStore,
  owner: number,
  aliasByField: ReadonlyMap<number, number>,
  proxyByKey: Map<string, number>,
  stateSlot: number,
  field: number,
): number | null => {
  const alias = aliasByField.get(field)
  if (alias === undefined) return null
  const stateId = store.orbital.id[stateSlot]!
  const key = `${stateId}:${field}`
  let slot = proxyByKey.get(key) ?? -1
  if (slot < 0 || (store.proxy.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) {
    slot = appendProxyRow(
      store, owner, field, store.fieldAlias.marker[alias - 1]!, stateId,
    )
    proxyByKey.set(key, slot)
  }
  store.proxy.flags[slot] = store.proxy.flags[slot]! & ~BULK_STORE_FLAG_REMOVED
  store.proxy.field[slot] = store.fieldAlias.marker[alias - 1]!
  ensureFieldProjection(
    store,
    owner,
    alias,
    store.proxy.id[slot]!,
    (store.orbital.flags[stateSlot]! & BULK_STORE_FLAG_ACTIVE) !== 0,
  )
  return slot
}

const appendCausalRelations = (
  store: BulkStore,
  owner: number,
  orbitalSlot: number,
  stateSlot: number,
  group: CausalGroup,
  aliasByField: ReadonlyMap<number, number>,
  proxyByKey: Map<string, number>,
): void => {
  const orbital = store.orbital.id[orbitalSlot]!
  const active = (store.orbital.flags[orbitalSlot]! & BULK_STORE_FLAG_ACTIVE) !== 0
  for (const relation of group.relations) {
    const proxySlot = ensureCausalProxy(
      store, owner, aliasByField, proxyByKey, stateSlot, relation.field,
    )
    if (proxySlot === null) continue
    const proxy = store.proxy.id[proxySlot]!
    appendRelationRow(store, {
      owner,
      kind: relation.kind,
      flags: active ? BULK_STORE_FLAG_ACTIVE : 0,
      aKind: relation.orbitalOnA
        ? BULK_STORE_ENDPOINT_KIND.orbital
        : BULK_STORE_ENDPOINT_KIND["field-proxy"],
      a: relation.orbitalOnA ? orbital : proxy,
      bKind: relation.orbitalOnA
        ? BULK_STORE_ENDPOINT_KIND["field-proxy"]
        : BULK_STORE_ENDPOINT_KIND.orbital,
      b: relation.orbitalOnA ? proxy : orbital,
      batch: 0,
      controls: [],
    })
    if (group.kind === BULK_STORE_ORBITAL_KIND.process ||
        group.kind === BULK_STORE_ORBITAL_KIND.finally) {
      store.proxy.paint[proxySlot] = orbital
    }
  }
}

const appendCausalOccurrence = (
  store: BulkStore,
  owner: number,
  stateSlot: number,
  group: CausalGroup,
): number => {
  const state = indexes(store)
  const slot = store.orbital.id.length
  const id = slot + 1
  const relatedStart = store.orbitalRelatedState.length
  store.orbitalRelatedState = appendValues(store.orbitalRelatedState, group.related)
  store.orbital.id = appendValues(store.orbital.id, [id])
  store.orbital.source = appendValues(store.orbital.source, [group.source])
  store.orbital.owner = appendValues(store.orbital.owner, [owner])
  store.orbital.kind = appendValues(store.orbital.kind, [group.kind])
  store.orbital.flags = appendValues(store.orbital.flags, [
    group.kind === BULK_STORE_ORBITAL_KIND.process ||
    group.kind === BULK_STORE_ORBITAL_KIND.finally ? BULK_STORE_FLAG_TORUS : 0,
  ])
  store.orbital.anchor = appendValues(store.orbital.anchor, [store.orbital.id[stateSlot]!])
  store.orbital.sleeve = appendValues(store.orbital.sleeve, [store.orbital.sleeve[stateSlot]!])
  store.orbital.relatedStart = appendValues(store.orbital.relatedStart, [relatedStart])
  store.orbital.relatedCount = appendValues(store.orbital.relatedCount, [group.related.length])
  store.orbital.label = appendValues(store.orbital.label, [textSlot(store, group.label)])
  store.orbital.position = appendValues(store.orbital.position, [0, 0, 0])
  const depthScale = torusLevelScale(state.darkDepthById[owner] ?? 0)
  if (group.kind === BULK_STORE_ORBITAL_KIND.process ||
      group.kind === BULK_STORE_ORBITAL_KIND.finally) {
    const fieldRadius = STATE_GRAPH_PRODUCTION_SIZING.fieldRadius * torusLevelScale(1)
    const fields = new Set(group.relations.map((relation) => relation.field))
    const layout = layoutFieldsInPseudoCircle(fields.size, fieldRadius)
    const form = resolveContentTorusForm({
      coreExtent: layout.radius,
      emptyOuterRadius: STATE_GRAPH_PRODUCTION_SIZING.emptyOuterRadius * torusLevelScale(1),
      gap: fieldRadius * TORUS_LAYOUT_BASELINE.contentGapToFieldRadius,
    })
    store.orbital.form = appendValues(
      store.orbital.form, [form.radius * depthScale, form.tube * depthScale],
    )
  } else {
    store.orbital.form = appendValues(store.orbital.form, [0, 0])
  }
  const kind = group.kind === BULK_STORE_ORBITAL_KIND.process
    ? "process"
    : group.kind === BULK_STORE_ORBITAL_KIND.finally ? "finally" : "reaction"
  const color = visualOrbitalParticleColor({orbitalParticleKind: kind, sourceId: group.source})
  const material = group.kind === BULK_STORE_ORBITAL_KIND.process ||
    group.kind === BULK_STORE_ORBITAL_KIND.finally
    ? visualProcessTorusMaterial(color, false, false, false)
    : visualCausalMaterial(color, false, false, false)
  store.orbital.material = appendValues(store.orbital.material, [
    ...material.color, material.opacity, material.glowIntensity, material.highlightSize,
  ])
  state.orbitalSlotById = growInt32(state.orbitalSlotById, id + 1)
  state.orbitalSlotById[id] = slot
  state.orbitalHeadByOwner = growInt32(state.orbitalHeadByOwner, owner + 1)
  state.orbitalNext = growInt32(state.orbitalNext, slot + 1)
  state.orbitalNext[slot] = state.orbitalHeadByOwner[owner] ?? -1
  state.orbitalHeadByOwner[owner] = slot
  return slot
}

const reconcileCausalGroups = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  plan: LocalStatePlan,
  desiredSlots: ReadonlyMap<string, number>,
  groups: readonly CausalGroup[],
  aliasByField: ReadonlyMap<number, number>,
  proxyByKey: Map<string, number>,
): Set<number> => {
  const state = indexes(store)
  const changed = new Set<number>()
  const occurrencesByState = Map.groupBy(plan.occurrences, (entry) => entry.node.stateId)
  for (const group of groups) {
    const process = group.kind === BULK_STORE_ORBITAL_KIND.process ||
      group.kind === BULK_STORE_ORBITAL_KIND.finally
    let desired = process
      ? group.related.flatMap((source) => occurrencesByState.get(source) ?? [])
      : []
    if (!process) {
      const ordered = plan.currentStateId !== null && group.related.includes(plan.currentStateId)
        ? [plan.currentStateId, ...group.related.filter((id) => id !== plan.currentStateId)]
        : [...group.related]
      for (const source of ordered) {
        const occurrences = occurrencesByState.get(source) ?? []
        const preferred = occurrences.find((entry) => entry.key.endsWith("/root")) ?? occurrences[0]
        if (preferred) {
          desired = [preferred]
          break
        }
      }
    }
    const existingByAnchor = new Map<string, number>()
    for (const slot of group.slots) {
      const key = state.stateOrbitalKeyById.get(store.orbital.anchor[slot]!)
      if (key) existingByAnchor.set(key, slot)
    }
    const retained = new Set<number>()
    for (const entry of desired) {
      const stateSlot = desiredSlots.get(entry.key)
      if (stateSlot === undefined) continue
      let slot = existingByAnchor.get(entry.key) ?? -1
      if (slot < 0 || (store.orbital.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) {
        slot = group.template >= 0
          ? appendOrbitalClone(store, group.template, {
            source: group.source,
            anchor: store.orbital.id[stateSlot]!,
            sleeve: entry.rootStateId,
            related: group.related,
          })
          : appendCausalOccurrence(store, plan.owner, stateSlot, group)
        appendCausalRelations(
          store, plan.owner, slot, stateSlot, group, aliasByField, proxyByKey,
        )
      }
      store.orbital.anchor[slot] = store.orbital.id[stateSlot]!
      store.orbital.sleeve[slot] = entry.rootStateId
      const active = process
        ? plan.currentStateId !== null && group.related.includes(plan.currentStateId) &&
          entry.rootStateId === plan.currentStateId
        : plan.currentStateId === null || group.related.includes(plan.currentStateId)
      store.orbital.flags[slot] = (store.orbital.flags[slot]! &
        ~(BULK_STORE_FLAG_REMOVED | BULK_STORE_FLAG_ACTIVE | BULK_STORE_FLAG_CURRENT)) |
        (active ? BULK_STORE_FLAG_ACTIVE : 0)
      repaintOrbital(store, slot)
      retained.add(slot)
      changed.add(slot)
    }
    for (const slot of group.slots) {
      if (!retained.has(slot)) removeOrbitalSlot(store, renderer, slot)
    }
  }
  return changed
}

const reflowCausalGeometry = (
  store: BulkStore,
  plan: LocalStatePlan,
  proxyByKey: ReadonlyMap<string, number>,
  conditionProxyKeys: ReadonlySet<string>,
): Readonly<{orbitals: Set<number>; proxies: Set<number>}> => {
  const state = indexes(store)
  const orbitals = new Set<number>()
  const proxies = new Set<number>()
  const processKinds = new Set<number>([
    BULK_STORE_ORBITAL_KIND.process,
    BULK_STORE_ORBITAL_KIND.finally,
  ])
  const byAnchor = new Map<number, number[]>()
  const reactionsByAnchor = new Map<number, number[]>()
  for (let slot = state.orbitalHeadByOwner[plan.owner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
    if ((store.orbital.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0 ||
        store.orbital.kind[slot] === BULK_STORE_ORBITAL_KIND.state) continue
    const target = processKinds.has(store.orbital.kind[slot]!) ? byAnchor : reactionsByAnchor
    const anchor = store.orbital.anchor[slot]!
    const held = target.get(anchor)
    if (held) held.push(slot)
    else target.set(anchor, [slot])
  }
  const depth = state.darkDepthById[plan.owner] ?? 0
  const scale = torusLevelScale(depth)
  const processFieldRadius = STATE_GRAPH_PRODUCTION_SIZING.fieldRadius * torusLevelScale(1)
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (const [anchor, slots] of byAnchor) {
    const anchorSlot = state.orbitalSlotById[anchor] ?? -1
    const stateKey = state.stateOrbitalKeyById.get(anchor)
    if (anchorSlot < 0 || !stateKey) continue
    slots.sort((left, right) => {
      const leftKey = `${store.orbital.kind[left]}/${store.orbital.source[left]}`
      const rightKey = `${store.orbital.kind[right]}/${store.orbital.source[right]}`
      return leftKey.localeCompare(rightKey)
    })
    const phase = stablePhaseValue(`${plan.owner}:${stateKey}`)
    const step = Math.PI * 2 / slots.length
    for (const [index, slot] of slots.entries()) {
      const angle = phase + step * index
      const anchorStart = anchorSlot * 3
      const anchorRadius = store.orbital.form[anchorSlot * 2]!
      store.orbital.position[slot * 3] = store.orbital.position[anchorStart]! + Math.cos(angle) * anchorRadius
      store.orbital.position[slot * 3 + 1] = store.orbital.position[anchorStart + 1]! + Math.sin(angle) * anchorRadius
      store.orbital.position[slot * 3 + 2] = store.orbital.position[anchorStart + 2]!
      repaintOrbital(store, slot)
      orbitals.add(slot)
      const relationFields = new Set<number>()
      for (const relation of state.relationSlotsByEndpoint[BULK_STORE_ENDPOINT_KIND.orbital]
        ?.get(store.orbital.id[slot]!) ?? []) {
        if ((store.relation.flags[relation]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
        const orbital = store.orbital.id[slot]!
        const proxy = store.relation.aKind[relation] === BULK_STORE_ENDPOINT_KIND["field-proxy"] &&
          store.relation.bKind[relation] === BULK_STORE_ENDPOINT_KIND.orbital &&
          store.relation.b[relation] === orbital
          ? store.relation.a[relation]!
          : store.relation.bKind[relation] === BULK_STORE_ENDPOINT_KIND["field-proxy"] &&
              store.relation.aKind[relation] === BULK_STORE_ENDPOINT_KIND.orbital &&
              store.relation.a[relation] === orbital
            ? store.relation.b[relation]!
            : 0
        if (proxy > 0) relationFields.add(proxy)
      }
      const ordered = [...relationFields].sort((left, right) =>
        store.proxy.sourceField[left - 1]! - store.proxy.sourceField[right - 1]! || left - right)
      const layout = layoutFieldsInPseudoCircle(ordered.length, processFieldRadius)
      for (const [fieldIndex, proxy] of ordered.entries()) {
        const proxySlot = proxy - 1
        const point = layout.points[fieldIndex] ?? {x: 0, y: 0, z: 0}
        store.proxy.paint[proxySlot] = store.orbital.id[slot]!
        store.proxy.kind[proxySlot] = 0
        store.proxy.flags[proxySlot] = store.proxy.flags[proxySlot]! & ~BULK_STORE_FLAG_TORUS
        store.proxy.position[proxySlot * 3] = store.orbital.position[slot * 3]! + point.x * scale
        store.proxy.position[proxySlot * 3 + 1] = store.orbital.position[slot * 3 + 1]! + point.y * scale
        store.proxy.position[proxySlot * 3 + 2] = store.orbital.position[slot * 3 + 2]! + point.z * scale
        store.proxy.form[proxySlot * 2] = processFieldRadius * scale
        store.proxy.form[proxySlot * 2 + 1] = 0
        const markerSlot = store.proxy.field[proxySlot]! - 1
        const color = visualFieldParticleColor({
          fieldParticleKind: FIELD_KIND[store.field.kind[markerSlot]!]!,
        })
        writeQuantum(store.proxy.material, proxySlot, visualFieldProxyMaterial(
          color,
          "sphere",
          (store.orbital.flags[slot]! & BULK_STORE_FLAG_ACTIVE) !== 0,
          (store.orbital.flags[anchorSlot]! & BULK_STORE_FLAG_ACTIVE) !== 0,
        ))
        proxies.add(proxySlot)
      }
    }
  }
  for (const [anchor, slots] of reactionsByAnchor) {
    const anchorSlot = state.orbitalSlotById[anchor] ?? -1
    const stateKey = state.stateOrbitalKeyById.get(anchor)
    if (anchorSlot < 0 || !stateKey) continue
    slots.sort((left, right) => store.orbital.source[left]! - store.orbital.source[right]!)
    for (const [index, slot] of slots.entries()) {
      const radius = torusFieldRadiusAtLevel(depth) * 0.72
      const angle = stablePhaseValue(stateKey) + index * golden
      const orbitRadius = store.orbital.form[anchorSlot * 2]! +
        store.orbital.form[anchorSlot * 2 + 1]! + radius * 1.8
      const anchorStart = anchorSlot * 3
      const key = `atom/${plan.atom}/reaction/${store.orbital.source[slot]}`
      store.orbital.position[slot * 3] = store.orbital.position[anchorStart]! + Math.cos(angle) * orbitRadius
      store.orbital.position[slot * 3 + 1] = store.orbital.position[anchorStart + 1]! + Math.sin(angle) * orbitRadius
      store.orbital.position[slot * 3 + 2] = store.orbital.position[anchorStart + 2]! +
        Math.sin(stablePhaseValue(`${key}:z`)) * radius * 0.8
      store.orbital.form[slot * 2] = radius
      store.orbital.form[slot * 2 + 1] = 0
      repaintOrbital(store, slot)
      orbitals.add(slot)
    }
  }
  for (const [key, slot] of proxyByKey) {
    if ((store.proxy.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0 ||
        conditionProxyKeys.has(key) || store.proxy.paint[slot] !== 0 || proxyHasCausalRelation(
          store, plan.owner, store.proxy.id[slot]!,
        ) === false) continue
    const separator = key.indexOf(":")
    const stateId = Number(key.slice(0, separator))
    const stateSlot = state.orbitalSlotById[stateId] ?? -1
    const stateKey = state.stateOrbitalKeyById.get(stateId)
    if (stateSlot < 0 || !stateKey) continue
    const outer = store.orbital.form[stateSlot * 2]! + store.orbital.form[stateSlot * 2 + 1]!
    const proxyKey = `${stateKey}/field/${store.proxy.sourceField[slot]}`
    const angle = stablePhaseValue(proxyKey)
    const elevation = Math.sin(stablePhaseValue(`${proxyKey}:z`)) * 0.55
    const radial = Math.sqrt(Math.max(0, 1 - elevation * elevation))
    const radius = Math.max(torusFieldRadiusAtLevel(depth) * 0.42, outer * 0.1)
    const start = stateSlot * 3
    store.proxy.kind[slot] = 1
    store.proxy.flags[slot] = (store.proxy.flags[slot]! & ~BULK_STORE_FLAG_REMOVED) |
      BULK_STORE_FLAG_TORUS
    store.proxy.position[slot * 3] = store.orbital.position[start]! + Math.cos(angle) * radial * outer * 0.78
    store.proxy.position[slot * 3 + 1] = store.orbital.position[start + 1]! + Math.sin(angle) * radial * outer * 0.78
    store.proxy.position[slot * 3 + 2] = store.orbital.position[start + 2]! + elevation * outer * 0.78
    store.proxy.form[slot * 2] = radius
    store.proxy.form[slot * 2 + 1] = radius * 0.16
    const markerSlot = store.proxy.field[slot]! - 1
    const color = visualFieldParticleColor({
      fieldParticleKind: FIELD_KIND[store.field.kind[markerSlot]!]!,
    })
    const active = (store.orbital.flags[stateSlot]! & BULK_STORE_FLAG_ACTIVE) !== 0
    writeQuantum(store.proxy.material, slot, visualFieldProxyMaterial(
      color, "torus", active, active,
    ))
    proxies.add(slot)
  }
  return {orbitals, proxies}
}

const reconcileLocalStateOwner = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  owner: number,
  wimp: number,
  extraAliases: ReadonlySet<number> = new Set(),
  forcedOwner = owner,
): void => {
  const state = indexes(store)
  const plan = localStatePlan(store, owner, wimp)
  const desiredKeys = new Set(plan.occurrences.map((entry) => entry.key))
  const desiredSlots = new Map<string, number>()
  const scale = torusLevelScale(state.darkDepthById[owner] ?? 0)
  const causalGroups = causalGroupsForOwner(store, owner)

  for (const entry of plan.occurrences) {
    let slot = state.stateOrbitalSlotByKey.get(entry.key) ?? -1
    if (slot < 0 || (store.orbital.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) {
      slot = appendStateOccurrence(
        store, owner, entry.node.stateId, entry.rootStateId, entry.node.label,
      )
      state.stateOrbitalSlotByKey.set(entry.key, slot)
      state.stateOrbitalKeyById.set(store.orbital.id[slot]!, entry.key)
    }
    desiredSlots.set(entry.key, slot)
    const offset = entry.prepared.offsets.find((candidate) => candidate.node.id === entry.node.id) ??
      {x: 0, y: 0, z: 0}
    const start = slot * 3
    const next = {x: offset.x * scale, y: offset.y * scale, z: offset.z * scale}
    const delta = {
      x: next.x - store.orbital.position[start]!,
      y: next.y - store.orbital.position[start + 1]!,
      z: next.z - store.orbital.position[start + 2]!,
    }
    shiftStateDependents(store, owner, store.orbital.id[slot]!, delta)
    store.orbital.position[start] = next.x
    store.orbital.position[start + 1] = next.y
    store.orbital.position[start + 2] = next.z
    store.orbital.source[slot] = entry.node.stateId
    store.orbital.sleeve[slot] = entry.rootStateId
    store.orbital.label[slot] = textSlot(store, entry.node.label)
    store.orbital.flags[slot] = BULK_STORE_FLAG_TORUS |
      (entry.rootStateId === plan.currentStateId ? BULK_STORE_FLAG_ACTIVE : 0) |
      (entry.rootStateId === plan.currentStateId && entry.node.stateId === entry.rootStateId
        ? BULK_STORE_FLAG_CURRENT : 0)
    const form = stateGraphNodeFormDimensions(
      entry.node.radius * scale,
      entry.node.innerRadius * scale,
    )
    store.orbital.form[slot * 2] = form.torusRadius
    store.orbital.form[slot * 2 + 1] = form.torusTube
    writeQuantum(store.orbital.material, slot, visualStateTorusMaterial(
      entry.node.color,
      entry.node.current,
      (store.orbital.flags[slot]! & BULK_STORE_FLAG_ACTIVE) !== 0,
    ))
  }

  const aliasByField = new Map<number, number>()
  for (let alias = state.aliasHeadByAtom[plan.atom] ?? -1; alias >= 0; alias = state.aliasNext[alias]!) {
    if ((store.fieldAlias.flags[alias]! & BULK_STORE_FLAG_REMOVED) === 0) {
      aliasByField.set(store.fieldAlias.field[alias]!, store.fieldAlias.id[alias]!)
    }
  }
  const proxyByKey = new Map<string, number>()
  for (let slot = state.proxyHeadByOwner[owner] ?? -1; slot >= 0; slot = state.proxyNext[slot]!) {
    if ((store.proxy.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0) {
      proxyByKey.set(`${store.proxy.state[slot]}:${store.proxy.sourceField[slot]}`, slot)
    }
  }
  const changedCausalSlots = reconcileCausalGroups(
    store, renderer, plan, desiredSlots, causalGroups, aliasByField, proxyByKey,
  )

  for (const [key, slot] of [...state.stateOrbitalSlotByKey]) {
    if (!key.startsWith(`atom/${plan.atom}/`) || desiredKeys.has(key)) continue
    const id = store.orbital.id[slot]!
    for (let child = state.orbitalHeadByOwner[owner] ?? -1; child >= 0; child = state.orbitalNext[child]!) {
      if (store.orbital.kind[child] !== BULK_STORE_ORBITAL_KIND.state &&
          store.orbital.anchor[child] === id) removeOrbitalSlot(store, renderer, child)
    }
    removeOrbitalSlot(store, renderer, slot)
    state.stateOrbitalSlotByKey.delete(key)
    state.stateOrbitalKeyById.delete(id)
  }
  const desiredProxyKeys = new Set<string>()
  const changedProxySlots = new Set<number>()
  const relationSeeds = new Set<number>()
  for (const entry of plan.occurrences) {
    const stateSlot = desiredSlots.get(entry.key)!
    const stateId = store.orbital.id[stateSlot]!
    const fields = stateGraphFieldSphereLayout(entry.node.fields, entry.node.fieldRadius * scale)
    for (const field of fields) {
      const alias = aliasByField.get(field.id)
      if (alias === undefined) continue
      const key = `${stateId}:${field.id}`
      desiredProxyKeys.add(key)
      let slot = proxyByKey.get(key) ?? -1
      if (slot < 0) {
        slot = appendProxyRow(store, owner, field.id, store.fieldAlias.marker[alias - 1]!, stateId)
        proxyByKey.set(key, slot)
      }
      store.proxy.field[slot] = store.fieldAlias.marker[alias - 1]!
      store.proxy.sourceField[slot] = field.id
      store.proxy.owner[slot] = owner
      store.proxy.state[slot] = stateId
      store.proxy.flags[slot] = store.proxy.flags[slot]! & ~BULK_STORE_FLAG_REMOVED
      relationSeeds.add(ensureFieldProjection(
        store, owner, alias, store.proxy.id[slot]!,
        (store.orbital.flags[stateSlot]! & BULK_STORE_FLAG_ACTIVE) !== 0,
      ))
      if (store.proxy.paint[slot] === 0) {
        const nodeStart = stateSlot * 3
        store.proxy.kind[slot] = 0
        store.proxy.flags[slot] = store.proxy.flags[slot]! & ~BULK_STORE_FLAG_TORUS
        store.proxy.position[slot * 3] = store.orbital.position[nodeStart]! + field.x
        store.proxy.position[slot * 3 + 1] = store.orbital.position[nodeStart + 1]! + field.y
        store.proxy.position[slot * 3 + 2] = store.orbital.position[nodeStart + 2]! + field.z
        store.proxy.form[slot * 2] = field.radius
        store.proxy.form[slot * 2 + 1] = 0
        const markerSlot = store.proxy.field[slot]! - 1
        const color = visualFieldParticleColor({
          fieldParticleKind: FIELD_KIND[store.field.kind[markerSlot]!]!,
        })
        writeQuantum(store.proxy.material, slot, visualConditionFieldMaterial(
          color,
          entry.node.current,
          (store.orbital.flags[stateSlot]! & BULK_STORE_FLAG_ACTIVE) !== 0,
        ))
      }
      changedProxySlots.add(slot)
    }
  }
  for (let slot = state.proxyHeadByOwner[owner] ?? -1; slot >= 0; slot = state.proxyNext[slot]!) {
    if ((store.proxy.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const key = `${store.proxy.state[slot]}:${store.proxy.sourceField[slot]}`
    if (desiredProxyKeys.has(key) || proxyHasCausalRelation(store, owner, store.proxy.id[slot]!)) continue
    setFlag(store.proxy.flags, slot, BULK_STORE_FLAG_REMOVED, true)
    for (const batch of removeRelationsForEndpoint(
      store, BULK_STORE_ENDPOINT_KIND["field-proxy"], store.proxy.id[slot]!,
    )) renderer.relationBatchChanged(batch)
    renderer.proxyRemoved?.(store.proxy.id[slot]!)
  }

  const existingTransitions = new Map<string, number[]>()
  for (let slot = state.transitionHeadByOwner[owner] ?? -1; slot >= 0; slot = state.transitionNext[slot]!) {
    if ((store.transition.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const key = `${store.transition.source[slot]}:${store.transition.from[slot]}:${store.transition.to[slot]}`
    const held = existingTransitions.get(key)
    if (held) held.push(slot)
    else existingTransitions.set(key, [slot])
  }
  const retainedTransitions = new Set<number>()
  const touchedTransitionBatches = new Set<number>()
  for (const prepared of plan.prepared) {
    const nodeKey = new Map(prepared.layout.nodes.map((node) => [
      node.id,
      stateOccurrenceKey(plan.atom, prepared.layout.rootStateId, node),
    ] as const))
    const nodeById = new Map(prepared.layout.nodes.map((node) => [node.id, node] as const))
    for (const edge of prepared.layout.edges) {
      const fromKey = nodeKey.get(edge.fromNodeId)
      const toKey = nodeKey.get(edge.toNodeId)
      const fromNode = nodeById.get(edge.fromNodeId)
      const toNode = nodeById.get(edge.toNodeId)
      if (!fromKey || !toKey || !fromNode || !toNode) continue
      const fromSlot = desiredSlots.get(fromKey)
      const toSlot = desiredSlots.get(toKey)
      if (fromSlot === undefined || toSlot === undefined) continue
      const from = store.orbital.id[fromSlot]!
      const to = store.orbital.id[toSlot]!
      const key = `${edge.transitionId}:${from}:${to}`
      let slot = existingTransitions.get(key)?.find((candidate) => !retainedTransitions.has(candidate)) ?? -1
      const active = prepared.layout.rootStateId === plan.currentStateId
      const material = visualTransitionMaterial(edge.returning, active)
      const batch = findBatch(
        store,
        owner,
        BULK_STORE_BATCH_KIND.transition,
        edge.returning ? BULK_STORE_FLAG_RETURNING : 0,
        material,
      )
      if (slot < 0) {
        slot = appendTransitionOccurrence(
          store, owner, edge.transitionId, from, to,
          active ? BULK_STORE_FLAG_ACTIVE : 0, batch,
        )
      } else {
        const oldBatch = store.transition.batch[slot]!
        if (oldBatch !== batch) {
          state.transitionSlotsByBatch.get(oldBatch)?.delete(slot)
          const members = state.transitionSlotsByBatch.get(batch)
          if (members) members.add(slot)
          else state.transitionSlotsByBatch.set(batch, new Set([slot]))
          touchedTransitionBatches.add(oldBatch)
        }
        store.transition.source[slot] = edge.transitionId
        store.transition.from[slot] = from
        store.transition.to[slot] = to
        store.transition.flags[slot] = active ? BULK_STORE_FLAG_ACTIVE : 0
        store.transition.batch[slot] = batch
      }
      const controls = compactCurve(describeStateGraphHermiteEdgeCurve(edge, {
        ...fromNode,
        x: store.orbital.position[fromSlot * 3]!,
        y: store.orbital.position[fromSlot * 3 + 1]!,
        z: store.orbital.position[fromSlot * 3 + 2]!,
        radius: fromNode.radius * scale,
        innerRadius: fromNode.innerRadius * scale,
        fieldRadius: fromNode.fieldRadius * scale,
      }, {
        ...toNode,
        x: store.orbital.position[toSlot * 3]!,
        y: store.orbital.position[toSlot * 3 + 1]!,
        z: store.orbital.position[toSlot * 3 + 2]!,
        radius: toNode.radius * scale,
        innerRadius: toNode.innerRadius * scale,
        fieldRadius: toNode.fieldRadius * scale,
      }))
      controls.forEach((value, offset) => store.transition.control[slot * 12 + offset] = value)
      retainedTransitions.add(slot)
      touchedTransitionBatches.add(batch)
    }
  }
  for (let slot = state.transitionHeadByOwner[owner] ?? -1; slot >= 0; slot = state.transitionNext[slot]!) {
    if ((store.transition.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0 &&
        !retainedTransitions.has(slot)) removeTransitionSlot(store, renderer, slot)
  }

  const aliases = new Set([...activeAliasSlotsForAtom(store, plan.atom), ...extraAliases])
  applyStructuralFieldGeometry(store, renderer, aliases, forcedOwner)
  const causalGeometry = reflowCausalGeometry(store, plan, proxyByKey, desiredProxyKeys)
  for (const slot of desiredSlots.values()) renderer.orbitalAdded?.(slot)
  for (const slot of changedCausalSlots) renderer.orbitalAdded?.(slot)
  for (const slot of causalGeometry.orbitals) renderer.orbitalAdded?.(slot)
  for (const slot of changedProxySlots) renderer.proxyAdded?.(slot)
  for (const slot of causalGeometry.proxies) renderer.proxyAdded?.(slot)
  for (const batch of rebuildTransitionGeometry(store, [...desiredSlots.values()])) {
    touchedTransitionBatches.add(batch)
  }
  const relationBatches = rebuildFieldRelationGeometry(
    store,
    [...aliases],
    [...desiredSlots.values(), ...causalGeometry.orbitals],
    [...changedProxySlots, ...causalGeometry.proxies],
  )
  for (const slot of relationSeeds) {
    const batch = store.relation.batch[slot]!
    if (batch > 0) relationBatches.add(batch)
  }
  for (const batch of touchedTransitionBatches) if (batch > 0) renderer.transitionBatchChanged(batch)
  for (const batch of relationBatches) if (batch > 0) renderer.relationBatchChanged(batch)
}

const reconcileLocalStateWimps = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  wimps: ReadonlySet<number>,
): void => {
  const state = indexes(store)
  for (const wimp of wimps) {
    if (wimp <= 0) continue
    for (const darkSlot of state.atomDarkSlotsByWimp.get(wimp) ?? []) {
      if ((store.dark.flags[darkSlot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
      reconcileLocalStateOwner(store, renderer, store.dark.id[darkSlot]!, wimp)
    }
  }
}

const removeTransitionSlot = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  slot: number,
): void => {
  if (!setFlag(store.transition.flags, slot, BULK_STORE_FLAG_REMOVED, true)) return
  const batch = store.transition.batch[slot]!
  indexes(store).transitionSlotsByBatch.get(batch)?.delete(slot)
  if (batch > 0) renderer.transitionBatchChanged(batch)
}

const removeOrbitalSlot = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  slot: number,
): void => {
  if (!setFlag(store.orbital.flags, slot, BULK_STORE_FLAG_REMOVED, true)) return
  const state = indexes(store)
  const id = store.orbital.id[slot]!
  state.orbitalSlotById[id] = -1
  renderer.orbitalRemoved?.(id)
  for (let transition = state.transitionHeadByOwner[store.orbital.owner[slot]!] ?? -1;
    transition >= 0; transition = state.transitionNext[transition]!) {
    if (store.transition.from[transition] === id || store.transition.to[transition] === id) {
      removeTransitionSlot(store, renderer, transition)
    }
  }
  for (let proxy = state.proxyHeadByOwner[store.orbital.owner[slot]!] ?? -1;
    proxy >= 0; proxy = state.proxyNext[proxy]!) {
    if (store.proxy.paint[proxy] === id) store.proxy.paint[proxy] = 0
    if (store.proxy.state[proxy] !== id ||
        !setFlag(store.proxy.flags, proxy, BULK_STORE_FLAG_REMOVED, true)) continue
    for (const batch of removeRelationsForEndpoint(
      store, BULK_STORE_ENDPOINT_KIND["field-proxy"], store.proxy.id[proxy]!,
    )) renderer.relationBatchChanged(batch)
    renderer.proxyRemoved?.(store.proxy.id[proxy]!)
  }
  for (const batch of removeRelationsForEndpoint(
    store, BULK_STORE_ENDPOINT_KIND.orbital, id,
  )) renderer.relationBatchChanged(batch)
}

const reflowOrbitalOwners = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  owners: ReadonlySet<number>,
): void => {
  const seeds = new Set<number>()
  for (const owner of owners) {
    if (owner % 2 !== 0) continue
    for (const alias of activeAliasSlotsForAtom(store, owner / 2)) seeds.add(alias)
  }
  applyStructuralFieldGeometry(store, renderer, seeds)
}

const declarationSourceRowId = (part: Particle, fallback: number): number => {
  if (part.op !== "move" && part.op !== "copy") return fallback
  if (!Number.isSafeInteger(part.from) || Number(part.from) <= 0) {
    throw new Error(`Bulk Store ${String(part.path)} ${part.op} has no persisted source row id`)
  }
  return Number(part.from)
}

const declarationMutationWimps = (
  store: BulkStore,
  part: Particle,
  row: CanonicalNumericDeclaration,
  slots: Int32Array,
  sourceWimps: BulkStoreNumericArray,
  label: string,
): Set<number> => {
  const result = new Set<number>([sourceWimp(store, row.wimp, label)])
  const sourceSlot = slots[declarationSourceRowId(part, row.id)] ?? -1
  if (sourceSlot >= 0) result.add(sourceWimps[sourceSlot]!)
  return result
}

const applyBulkStateUpsert = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const row = canonicalNumericDeclaration(part, "state")
  const state = indexes(store)
  ensureStateOccurrenceIndex(store, declarationMutationWimps(
    store, part, row, state.stateSourceSlotById, store.stateSource.wimp, "State",
  ))
  const mutation = upsertStateSource(store, part, row)
  reconcileLocalStateWimps(store, renderer, new Set([
    mutation.previousWimp,
    store.stateSource.wimp[mutation.slot]!,
  ]))
}

export const applyBulkStateAdd = applyBulkStateUpsert
export const applyBulkStateReplace = applyBulkStateUpsert
export const applyBulkStateMove = applyBulkStateUpsert
export const applyBulkStateCopy = applyBulkStateUpsert

export const applyBulkStateRemove = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const row = canonicalNumericDeclaration(part, "state")
  const state = indexes(store)
  ensureStateOccurrenceIndex(store, declarationMutationWimps(
    store, part, row, state.stateSourceSlotById, store.stateSource.wimp, "State",
  ))
  const slot = removeStateSource(store, row)
  reconcileLocalStateWimps(store, renderer, new Set([store.stateSource.wimp[slot]!]))
}

const orbitalForState = (
  store: BulkStore,
  owner: number,
  source: number,
  preferredSleeve: number,
): number => {
  const state = indexes(store)
  let fallback = 0
  for (let slot = state.orbitalHeadByOwner[owner] ?? -1; slot >= 0; slot = state.orbitalNext[slot]!) {
    if ((store.orbital.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0 ||
        store.orbital.kind[slot] !== BULK_STORE_ORBITAL_KIND.state ||
        store.orbital.source[slot] !== source) continue
    if (store.orbital.sleeve[slot] === preferredSleeve) return store.orbital.id[slot]!
    if (fallback === 0) fallback = store.orbital.id[slot]!
  }
  return fallback
}

const appendTransitionClone = (
  store: BulkStore,
  template: number,
  source: number,
  owner: number,
  from: number,
  to: number,
): number => {
  const state = indexes(store)
  const oldBatch = store.transition.batch[template]!
  const oldBatchSlot = oldBatch - 1
  const batch = findBatch(
    store,
    owner,
    BULK_STORE_BATCH_KIND.transition,
    store.batch.flags[oldBatchSlot]!,
    lineMaterialFromStore(store, oldBatchSlot),
  )
  const slot = store.transition.id.length
  const id = slot + 1
  store.transition.id = appendValues(store.transition.id, [id])
  store.transition.source = appendValues(store.transition.source, [source])
  store.transition.owner = appendValues(store.transition.owner, [owner])
  store.transition.from = appendValues(store.transition.from, [from])
  store.transition.to = appendValues(store.transition.to, [to])
  store.transition.flags = appendValues(
    store.transition.flags,
    [store.transition.flags[template]! & ~BULK_STORE_FLAG_REMOVED],
  )
  store.transition.batch = appendValues(store.transition.batch, [batch])
  store.transition.control = appendValues(
    store.transition.control,
    Array.from(store.transition.control.slice(template * 12, template * 12 + 12)),
  )
  state.transitionHeadByOwner = growInt32(state.transitionHeadByOwner, owner + 1)
  state.transitionNext = growInt32(state.transitionNext, slot + 1)
  state.transitionNext[slot] = state.transitionHeadByOwner[owner] ?? -1
  state.transitionHeadByOwner[owner] = slot
  const members = state.transitionSlotsByBatch.get(batch)
  if (members) members.add(slot)
  else state.transitionSlotsByBatch.set(batch, new Set([slot]))
  return slot
}

const applyBulkTransitionUpsert = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const row = canonicalNumericDeclaration(part, "transition")
  const state = indexes(store)
  ensureStateOccurrenceIndex(store, declarationMutationWimps(
    store, part, row, state.transitionSourceSlotById, store.transitionSource.wimp, "Transition",
  ))
  const mutation = upsertTransitionSource(store, part, row)
  reconcileLocalStateWimps(store, renderer, new Set([
    mutation.previousWimp,
    store.transitionSource.wimp[mutation.slot]!,
  ]))
}

export const applyBulkTransitionAdd = applyBulkTransitionUpsert
export const applyBulkTransitionReplace = applyBulkTransitionUpsert
export const applyBulkTransitionMove = applyBulkTransitionUpsert
export const applyBulkTransitionCopy = applyBulkTransitionUpsert

export const applyBulkTransitionRemove = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const row = canonicalNumericDeclaration(part, "transition")
  const state = indexes(store)
  ensureStateOccurrenceIndex(store, declarationMutationWimps(
    store, part, row, state.transitionSourceSlotById, store.transitionSource.wimp, "Transition",
  ))
  const slot = removeTransitionSource(store, row)
  reconcileLocalStateWimps(store, renderer, new Set([store.transitionSource.wimp[slot]!]))
}

const processDependencies = (
  descriptor: Record<string, unknown>,
): Readonly<{read: number[]; write: number[]}> => {
  const read = new Set<number>()
  const write = new Set<number>()
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!isRecord(value)) return
    for (const [key, child] of Object.entries(value)) {
      if ((key === "readFields" || key === "writeFields") && Array.isArray(child)) {
        const target = key === "readFields" ? read : write
        for (const item of child) {
          const id = Array.isArray(item) ? item[0] : item
          if (Number.isSafeInteger(id) && Number(id) > 0) target.add(Number(id))
        }
      } else visit(child)
    }
  }
  visit(descriptor)
  return {read: [...read], write: [...write]}
}

const numericIds = (value: unknown, label: string): number[] => {
  if (!Array.isArray(value) || !value.every((id) => Number.isSafeInteger(id) && Number(id) > 0)) {
    throw new Error(`Bulk Store ${label} has invalid relational ids`)
  }
  return [...new Set(value.map(Number))]
}

const writeSourceSlice = (
  target: BulkStoreNumericArray,
  start: number,
  capacity: number,
  values: readonly number[],
): Readonly<{target: BulkStoreNumericArray; start: number}> => {
  if (start >= 0 && values.length <= capacity) {
    values.forEach((value, offset) => target[start + offset] = value)
    return {target, start}
  }
  const nextStart = target.length
  return {target: appendValues(target, values), start: nextStart}
}

const upsertProcessSource = (
  store: BulkStore,
  part: Particle,
  row: CanonicalNumericDeclaration,
): SourceRowMutation => {
  if (typeof row.value.state !== "string" || !isRecord(row.value.descriptor) ||
      (row.value.descriptor.type !== "action" && row.value.descriptor.type !== "finally")) {
    throw new Error("Bulk Store Process has invalid state/descriptor")
  }
  const state = indexes(store)
  const sourceId = declarationSourceRowId(part, row.id)
  let slot = state.processSourceSlotById[row.id] ?? -1
  if (part.op === "move" && sourceId !== row.id) {
    slot = sourceRowSlot(state.processSourceSlotById, sourceId, "Process")
    state.processSourceSlotById[sourceId] = -1
  }
  const nextWimp = sourceWimp(store, row.wimp, "Process")
  const previousWimp = slot < 0 ? 0 : store.processSource.wimp[slot]!
  const dependencies = processDependencies(row.value.descriptor)
  const read = writeSourceSlice(
    store.processField,
    slot < 0 ? -1 : store.processSource.readStart[slot]!,
    slot < 0 ? 0 : store.processSource.readCount[slot]!,
    dependencies.read,
  )
  store.processField = read.target
  const write = writeSourceSlice(
    store.processField,
    slot < 0 ? -1 : store.processSource.writeStart[slot]!,
    slot < 0 ? 0 : store.processSource.writeCount[slot]!,
    dependencies.write,
  )
  store.processField = write.target
  const values = {
    state: textSlot(store, row.value.state),
    kind: row.value.descriptor.type === "finally" ? 1 : 0,
    label: textSlot(store, String(
      row.value.descriptor.label ?? row.value.descriptor.key ?? row.value.state,
    )),
  }
  if (slot < 0) {
    slot = store.processSource.id.length
    store.processSource.id = appendValues(store.processSource.id, [row.id])
    store.processSource.wimp = appendValues(store.processSource.wimp, [nextWimp])
    store.processSource.state = appendValues(store.processSource.state, [values.state])
    store.processSource.kind = appendValues(store.processSource.kind, [values.kind])
    store.processSource.label = appendValues(store.processSource.label, [values.label])
    store.processSource.readStart = appendValues(store.processSource.readStart, [read.start])
    store.processSource.readCount = appendValues(store.processSource.readCount, [dependencies.read.length])
    store.processSource.writeStart = appendValues(store.processSource.writeStart, [write.start])
    store.processSource.writeCount = appendValues(store.processSource.writeCount, [dependencies.write.length])
    store.processSource.flags = appendValues(store.processSource.flags, [0])
  } else {
    store.processSource.id[slot] = row.id
    store.processSource.wimp[slot] = nextWimp
    store.processSource.state[slot] = values.state
    store.processSource.kind[slot] = values.kind
    store.processSource.label[slot] = values.label
    store.processSource.readStart[slot] = read.start
    store.processSource.readCount[slot] = dependencies.read.length
    store.processSource.writeStart[slot] = write.start
    store.processSource.writeCount[slot] = dependencies.write.length
    store.processSource.flags[slot] = store.processSource.flags[slot]! & ~BULK_STORE_FLAG_REMOVED
    if (previousWimp > 0) state.processSourceSlotsByWimp.get(previousWimp)?.delete(slot)
  }
  state.processSourceSlotById = growInt32(state.processSourceSlotById, row.id + 1)
  state.processSourceSlotById[row.id] = slot
  const members = state.processSourceSlotsByWimp.get(nextWimp)
  if (members) members.add(slot)
  else state.processSourceSlotsByWimp.set(nextWimp, new Set([slot]))
  return {slot, sourceId, previousWimp}
}

const upsertReactionSource = (
  store: BulkStore,
  part: Particle,
  row: CanonicalNumericDeclaration,
): SourceRowMutation => {
  const read = numericIds(row.value.read, "Reaction read")
  const write = numericIds(row.value.write, "Reaction write")
  const states = numericIds(row.value.states, "Reaction states")
  const label = String(row.value.label ?? row.value.key ?? "")
  const state = indexes(store)
  const sourceId = declarationSourceRowId(part, row.id)
  let slot = state.reactionSourceSlotById[row.id] ?? -1
  if (part.op === "move" && sourceId !== row.id) {
    slot = sourceRowSlot(state.reactionSourceSlotById, sourceId, "Reaction")
    state.reactionSourceSlotById[sourceId] = -1
  }
  const nextWimp = sourceWimp(store, row.wimp, "Reaction")
  const previousWimp = slot < 0 ? 0 : store.reactionSource.wimp[slot]!
  const readSlice = writeSourceSlice(
    store.reactionField,
    slot < 0 ? -1 : store.reactionSource.readStart[slot]!,
    slot < 0 ? 0 : store.reactionSource.readCount[slot]!,
    read,
  )
  store.reactionField = readSlice.target
  const writeSlice = writeSourceSlice(
    store.reactionField,
    slot < 0 ? -1 : store.reactionSource.writeStart[slot]!,
    slot < 0 ? 0 : store.reactionSource.writeCount[slot]!,
    write,
  )
  store.reactionField = writeSlice.target
  const stateSlice = writeSourceSlice(
    store.reactionState,
    slot < 0 ? -1 : store.reactionSource.stateStart[slot]!,
    slot < 0 ? 0 : store.reactionSource.stateCount[slot]!,
    states,
  )
  store.reactionState = stateSlice.target
  if (slot < 0) {
    slot = store.reactionSource.id.length
    store.reactionSource.id = appendValues(store.reactionSource.id, [row.id])
    store.reactionSource.wimp = appendValues(store.reactionSource.wimp, [nextWimp])
    store.reactionSource.label = appendValues(store.reactionSource.label, [textSlot(store, label)])
    store.reactionSource.readStart = appendValues(store.reactionSource.readStart, [readSlice.start])
    store.reactionSource.readCount = appendValues(store.reactionSource.readCount, [read.length])
    store.reactionSource.writeStart = appendValues(store.reactionSource.writeStart, [writeSlice.start])
    store.reactionSource.writeCount = appendValues(store.reactionSource.writeCount, [write.length])
    store.reactionSource.stateStart = appendValues(store.reactionSource.stateStart, [stateSlice.start])
    store.reactionSource.stateCount = appendValues(store.reactionSource.stateCount, [states.length])
    store.reactionSource.allStates = appendValues(store.reactionSource.allStates, [states.length === 0 ? 1 : 0])
    store.reactionSource.flags = appendValues(store.reactionSource.flags, [0])
  } else {
    store.reactionSource.id[slot] = row.id
    store.reactionSource.wimp[slot] = nextWimp
    store.reactionSource.label[slot] = textSlot(store, label)
    store.reactionSource.readStart[slot] = readSlice.start
    store.reactionSource.readCount[slot] = read.length
    store.reactionSource.writeStart[slot] = writeSlice.start
    store.reactionSource.writeCount[slot] = write.length
    store.reactionSource.stateStart[slot] = stateSlice.start
    store.reactionSource.stateCount[slot] = states.length
    store.reactionSource.allStates[slot] = states.length === 0 ? 1 : 0
    store.reactionSource.flags[slot] = store.reactionSource.flags[slot]! & ~BULK_STORE_FLAG_REMOVED
    if (previousWimp > 0) state.reactionSourceSlotsByWimp.get(previousWimp)?.delete(slot)
  }
  state.reactionSourceSlotById = growInt32(state.reactionSourceSlotById, row.id + 1)
  state.reactionSourceSlotById[row.id] = slot
  const members = state.reactionSourceSlotsByWimp.get(nextWimp)
  if (members) members.add(slot)
  else state.reactionSourceSlotsByWimp.set(nextWimp, new Set([slot]))
  return {slot, sourceId, previousWimp}
}

const applyBulkCausalUpsert = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
  path: "process" | "reaction",
): void => {
  const row = canonicalNumericDeclaration(part, path)
  const state = indexes(store)
  const slots = path === "process" ? state.processSourceSlotById : state.reactionSourceSlotById
  const wimps = path === "process" ? store.processSource.wimp : store.reactionSource.wimp
  ensureStateOccurrenceIndex(store, declarationMutationWimps(
    store, part, row, slots, wimps, path === "process" ? "Process" : "Reaction",
  ))
  const mutation = path === "process"
    ? upsertProcessSource(store, part, row)
    : upsertReactionSource(store, part, row)
  const target = path === "process"
    ? store.processSource.wimp[mutation.slot]!
    : store.reactionSource.wimp[mutation.slot]!
  reconcileLocalStateWimps(store, renderer, new Set([mutation.previousWimp, target]))
}

export const applyBulkProcessAdd = (store: BulkStore, renderer: BulkStoreRenderer, part: Particle): void =>
  applyBulkCausalUpsert(store, renderer, part, "process")
export const applyBulkProcessReplace = applyBulkProcessAdd
export const applyBulkProcessMove = applyBulkProcessAdd
export const applyBulkProcessCopy = applyBulkProcessAdd
export const applyBulkReactionAdd = (store: BulkStore, renderer: BulkStoreRenderer, part: Particle): void =>
  applyBulkCausalUpsert(store, renderer, part, "reaction")
export const applyBulkReactionReplace = applyBulkReactionAdd
export const applyBulkReactionMove = applyBulkReactionAdd
export const applyBulkReactionCopy = applyBulkReactionAdd

const applyBulkCausalRemove = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
  path: "process" | "reaction",
): void => {
  const row = canonicalNumericDeclaration(part, path)
  const state = indexes(store)
  const slots = path === "process" ? state.processSourceSlotById : state.reactionSourceSlotById
  const wimps = path === "process" ? store.processSource.wimp : store.reactionSource.wimp
  ensureStateOccurrenceIndex(store, declarationMutationWimps(
    store, part, row, slots, wimps, path === "process" ? "Process" : "Reaction",
  ))
  const slot = sourceRowSlot(slots, row.id, path === "process" ? "Process" : "Reaction")
  const wimp = wimps[slot]!
  if (path === "process") {
    setFlag(store.processSource.flags, slot, BULK_STORE_FLAG_REMOVED, true)
    state.processSourceSlotsByWimp.get(wimp)?.delete(slot)
  } else {
    setFlag(store.reactionSource.flags, slot, BULK_STORE_FLAG_REMOVED, true)
    state.reactionSourceSlotsByWimp.get(wimp)?.delete(slot)
  }
  reconcileLocalStateWimps(store, renderer, new Set([wimp]))
}

export const applyBulkProcessRemove = (store: BulkStore, renderer: BulkStoreRenderer, part: Particle): void =>
  applyBulkCausalRemove(store, renderer, part, "process")
export const applyBulkReactionRemove = (store: BulkStore, renderer: BulkStoreRenderer, part: Particle): void =>
  applyBulkCausalRemove(store, renderer, part, "reaction")

const validateNonVisualDeclaration = (
  part: Particle,
  path: "variant" | "condition" | "matter",
): void => {
  canonicalNumericDeclaration(part, path)
  declarationSourceRowId(part, Number((part.value as Record<string, unknown>).id))
}

export const applyBulkVariantAdd = (store: BulkStore, part: Particle): void => {
  void store
  validateNonVisualDeclaration(part, "variant")
}
export const applyBulkVariantReplace = applyBulkVariantAdd
export const applyBulkVariantRemove = applyBulkVariantAdd
export const applyBulkVariantMove = applyBulkVariantAdd
export const applyBulkVariantCopy = applyBulkVariantAdd
export const applyBulkConditionAdd = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const row = canonicalNumericDeclaration(part, "condition")
  const state = indexes(store)
  ensureStateOccurrenceIndex(store, declarationMutationWimps(
    store, part, row, state.conditionSourceSlotById, store.conditionSource.wimp, "Condition",
  ))
  const mutation = upsertConditionSource(store, part, row)
  reconcileLocalStateWimps(store, renderer, new Set([
    mutation.previousWimp,
    store.conditionSource.wimp[mutation.slot]!,
  ]))
}
export const applyBulkConditionReplace = applyBulkConditionAdd
export const applyBulkConditionMove = applyBulkConditionAdd
export const applyBulkConditionCopy = applyBulkConditionAdd
export const applyBulkConditionRemove = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  const row = canonicalNumericDeclaration(part, "condition")
  const state = indexes(store)
  ensureStateOccurrenceIndex(store, declarationMutationWimps(
    store, part, row, state.conditionSourceSlotById, store.conditionSource.wimp, "Condition",
  ))
  const slot = removeConditionSource(store, row)
  reconcileLocalStateWimps(store, renderer, new Set([store.conditionSource.wimp[slot]!]))
}
export const applyBulkMatterAdd = (store: BulkStore, part: Particle): void => {
  void store
  validateNonVisualDeclaration(part, "matter")
}
export const applyBulkMatterReplace = applyBulkMatterAdd
export const applyBulkMatterRemove = applyBulkMatterAdd
export const applyBulkMatterMove = applyBulkMatterAdd
export const applyBulkMatterCopy = applyBulkMatterAdd

export const applyBulkWimpAdd = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  if (part.path !== "wimp" || !isRecord(part.value) ||
      typeof part.value.src !== "string" || part.value.src.length === 0) {
    throw new Error("Bulk Store WIMP add has no canonical src")
  }
  const slot = appendWimp(
    store,
    part.value.src,
    typeof part.value.name === "string" ? part.value.name : null,
  )
  const name = store.wimp.name[slot]!
  for (const darkSlot of indexes(store).atomDarkSlotsByWimp.get(slot + 1) ?? []) {
    if (store.dark.label[darkSlot] === name) continue
    store.dark.label[darkSlot] = name
    renderer.darkChanged?.(darkSlot)
  }
}

export const applyBulkWimpReplace = applyBulkWimpAdd

export const applyBulkWimpCopy = applyBulkWimpAdd

export const applyBulkWimpMove = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  part: Particle,
): void => {
  if (part.path !== "wimp" || typeof part.from !== "string" || part.from.length === 0 ||
      !isRecord(part.value) || typeof part.value.src !== "string" || part.value.src.length === 0) {
    throw new Error("Bulk Store WIMP move has no canonical source/target src")
  }
  const state = indexes(store)
  const source = state.wimpSlotBySrc.get(part.from) ?? -1
  if (source < 0 || (store.wimp.flags[source]! & BULK_STORE_FLAG_REMOVED) !== 0) {
    throw new Error(`Bulk Store WIMP ${part.from} is absent`)
  }
  const occupied = state.wimpSlotBySrc.get(part.value.src)
  if (occupied !== undefined && occupied !== source &&
      (store.wimp.flags[occupied]! & BULK_STORE_FLAG_REMOVED) === 0) {
    throw new Error(`Bulk Store WIMP ${part.value.src} already exists`)
  }
  state.wimpSlotBySrc.delete(part.from)
  store.wimp.src[source] = part.value.src
  store.wimp.name[source] = textSlot(
    store,
    typeof part.value.name === "string" ? part.value.name : null,
  )
  store.wimp.flags[source] = store.wimp.flags[source]! & ~BULK_STORE_FLAG_REMOVED
  state.wimpSlotBySrc.set(part.value.src, source)
  for (const darkSlot of state.atomDarkSlotsByWimp.get(source + 1) ?? []) {
    store.dark.label[darkSlot] = store.wimp.name[source]!
    renderer.darkChanged?.(darkSlot)
  }
}

export const applyBulkWimpRemove = (
  store: BulkStore,
  part: Particle,
): void => {
  const src = declarationWimpSrc(part)
  if (part.path !== "wimp" || src === null) {
    throw new Error("Bulk Store WIMP remove has no canonical src")
  }
  const slot = wimpSlot(store, src)
  if (slot < 0) throw new Error(`Bulk Store WIMP ${src} is absent`)
  setFlag(store.wimp.flags, slot, BULK_STORE_FLAG_REMOVED, true)
}

const assertRelationalDeclarationIdentity = (part: Particle): void => {
  if (typeof part.path !== "string" || !declarationPaths.has(part.path)) return
  if (part.path === "bulk") {
    throw new Error("Bulk Store excludes bulk/view_css declarations")
  }
  if (part.path === "wimp") return
  if (!isRecord(part.value) || !Number.isSafeInteger(part.value.id) || Number(part.value.id) <= 0 ||
      !Number.isSafeInteger(part.value.localId) || Number(part.value.localId) <= 0 ||
      typeof part.value.wimp !== "string" || part.value.wimp.length === 0) {
    throw new Error(`Bulk Store ${part.path} operation has no resulting relational row`)
  }
  if ((part.op === "move" || part.op === "copy") &&
      (!Number.isSafeInteger(part.from) || Number(part.from) <= 0)) {
    throw new Error(`Bulk Store ${part.path} ${part.op} has no persisted source row id`)
  }
}

/** Fixed dispatch only; it does not create a generic diff or consequence format. */
export const applyBulkStoreMessage = (
  store: BulkStore,
  renderer: BulkStoreRenderer,
  message: ForceMessage,
): void => {
  const part = message.parts[0]
  assertRelationalDeclarationIdentity(part)
  if (part.part === "gluon") {
    if (part.op === "add") applyBulkGluonAdd(store, renderer, part)
    else if (part.op === "replace") applyBulkGluonReplace(store, renderer, part)
    else if (part.op === "remove") applyBulkGluonRemove(store, renderer, part)
    else if (part.op === "test") applyBulkGluonTest(store, part)
  } else if (part.part === "photon") {
    if (part.op === "replace") applyBulkPhotonReplace(store, renderer, part)
    else if (part.op === "test") applyBulkPhotonTest(store, part)
  } else if (part.part === "graviton" && part.path === "wimp") {
    if (part.op === "add") applyBulkWimpAdd(store, renderer, part)
    else if (part.op === "replace") applyBulkWimpReplace(store, renderer, part)
    else if (part.op === "remove") applyBulkWimpRemove(store, part)
    else if (part.op === "move") applyBulkWimpMove(store, renderer, part)
    else if (part.op === "copy") applyBulkWimpCopy(store, renderer, part)
  } else if (part.part === "graviton" && part.path === "field") {
    if (part.op === "add") applyBulkFieldAdd(store, renderer, part)
    else if (part.op === "replace") applyBulkFieldReplace(store, renderer, part)
    else if (part.op === "remove") applyBulkFieldRemove(store, renderer, part)
    else if (part.op === "move") applyBulkFieldMove(store, renderer, part)
    else if (part.op === "copy") applyBulkFieldCopy(store, renderer, part)
  } else if (part.part === "graviton" && part.path === "variant") {
    if (part.op === "add") applyBulkVariantAdd(store, part)
    else if (part.op === "replace") applyBulkVariantReplace(store, part)
    else if (part.op === "remove") applyBulkVariantRemove(store, part)
    else if (part.op === "move") applyBulkVariantMove(store, part)
    else if (part.op === "copy") applyBulkVariantCopy(store, part)
  } else if (part.part === "graviton" && part.path === "state") {
    if (part.op === "add") applyBulkStateAdd(store, renderer, part)
    else if (part.op === "replace") applyBulkStateReplace(store, renderer, part)
    else if (part.op === "remove") applyBulkStateRemove(store, renderer, part)
    else if (part.op === "move") applyBulkStateMove(store, renderer, part)
    else if (part.op === "copy") applyBulkStateCopy(store, renderer, part)
  } else if (part.part === "graviton" && part.path === "transition") {
    if (part.op === "add") applyBulkTransitionAdd(store, renderer, part)
    else if (part.op === "replace") applyBulkTransitionReplace(store, renderer, part)
    else if (part.op === "remove") applyBulkTransitionRemove(store, renderer, part)
    else if (part.op === "move") applyBulkTransitionMove(store, renderer, part)
    else if (part.op === "copy") applyBulkTransitionCopy(store, renderer, part)
  } else if (part.part === "graviton" && part.path === "condition") {
    if (part.op === "add") applyBulkConditionAdd(store, renderer, part)
    else if (part.op === "replace") applyBulkConditionReplace(store, renderer, part)
    else if (part.op === "remove") applyBulkConditionRemove(store, renderer, part)
    else if (part.op === "move") applyBulkConditionMove(store, renderer, part)
    else if (part.op === "copy") applyBulkConditionCopy(store, renderer, part)
  } else if (part.part === "graviton" && part.path === "process") {
    if (part.op === "add") applyBulkProcessAdd(store, renderer, part)
    else if (part.op === "replace") applyBulkProcessReplace(store, renderer, part)
    else if (part.op === "remove") applyBulkProcessRemove(store, renderer, part)
    else if (part.op === "move") applyBulkProcessMove(store, renderer, part)
    else if (part.op === "copy") applyBulkProcessCopy(store, renderer, part)
  } else if (part.part === "graviton" && part.path === "reaction") {
    if (part.op === "add") applyBulkReactionAdd(store, renderer, part)
    else if (part.op === "replace") applyBulkReactionReplace(store, renderer, part)
    else if (part.op === "remove") applyBulkReactionRemove(store, renderer, part)
    else if (part.op === "move") applyBulkReactionMove(store, renderer, part)
    else if (part.op === "copy") applyBulkReactionCopy(store, renderer, part)
  } else if (part.part === "graviton" && part.path === "matter") {
    if (part.op === "add") applyBulkMatterAdd(store, part)
    else if (part.op === "replace") applyBulkMatterReplace(store, part)
    else if (part.op === "remove") applyBulkMatterRemove(store, part)
    else if (part.op === "move") applyBulkMatterMove(store, part)
    else if (part.op === "copy") applyBulkMatterCopy(store, part)
  } else if (part.part === "graviton") {
    const address = runtimeAddress(part.path)
    if (address?.kind === "atom") {
      if (part.op === "add") applyBulkAtomAdd(store, renderer, part)
      else if (part.op === "replace") applyBulkAtomReplace(store, renderer, part)
      else if (part.op === "remove") applyBulkAtomRemove(store, renderer, part)
      else if (part.op === "move") applyBulkAtomMove(store, renderer, part)
      else if (part.op === "copy") applyBulkAtomCopy(store, renderer, part)
    } else if (address?.kind === "topology") {
      if (part.op === "add") applyBulkTopologyAdd(store, renderer, part)
      else if (part.op === "replace") applyBulkTopologyReplace(store, renderer, part)
      else if (part.op === "remove") applyBulkTopologyRemove(store, renderer, part)
      else if (part.op === "move") applyBulkTopologyMove(store, renderer, part)
      else if (part.op === "copy") applyBulkTopologyCopy(store, renderer, part)
    }
  }
  renderer.force(part)
}
