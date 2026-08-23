import {
  BULK_STORE_FLAG_ACTIVE,
  BULK_STORE_FLAG_OVERLAY,
  BULK_STORE_FLAG_RETURNING,
  BULK_STORE_FLAG_TORUS,
  BULK_STORE_LAYOUT_OUTSIDE_IN,
  type BulkStore,
} from "@metafor/types/bulk/store"
import {
  buildStateGraph,
  buildStateGraphBranchLayoutFromIndex,
  describeHermiteEdgeCurve,
  describeStateGraphHermiteEdgeCurve,
  indexStateGraphLayout,
  layoutFieldsInPseudoCircle,
  packStateSleeves,
  placeStateLayout,
  prepareStateLayout,
  resolveContentTorusForm,
  stateGraphFieldSphereLayout,
  stateGraphNodeFormDimensions,
  stateInnerOrbitRadius,
  stateNodeSurfaceGap,
  STATE_GRAPH_PRODUCTION_SIZING,
  TORUS_LAYOUT_BASELINE,
  torusFieldRadiusAtLevel,
  torusLevelScale,
  visualCausalMaterial,
  visualConditionFieldMaterial,
  visualContextTorusMaterial,
  visualCoreFieldMaterial,
  visualDarkParticleColor,
  visualFieldParticleColor,
  visualFieldProxyMaterial,
  visualOrbitalParticleColor,
  visualProcessTorusMaterial,
  visualRelationColor,
  visualRelationHasSceneGeometry,
  visualRelationMaterial,
  visualStateTorusMaterial,
  visualTransitionMaterial,
  type HermiteEdgeCurve,
  type PreparedStateLayout,
  type StateGraphRootLayout,
  type StatePlacement,
  type VisualLineMaterial,
  type VisualQuantumMaterial,
} from "@metafor/visual/layout/centered-nested"
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
  layoutOutsideInStoreFields,
  type BulkStoreFieldPlacement,
} from "./store-field-layout.ts"
import type {DirectStoreBuild} from "./store-direct.ts"

type Point = Readonly<{x: number; y: number; z: number}>
type OwnedPoint = Point & Readonly<{owner: number}>
type ProcessProxyLayout = Readonly<{
  proxy: number
  radius: number
  x: number
  y: number
  z: number
}>
type ProcessLayout = Readonly<{
  fieldProxies: readonly ProcessProxyLayout[]
  form: Readonly<{outerRadius: number; radius: number; tube: number}>
  orbitAngle: number
  orbital: number
}>

const numeric = (value: BulkStore["dark"]["id"]): number[] => value as number[]

const textInterner = (store: BulkStore): ((value: string | null) => number) => {
  const slots = new Map(store.text.map((value, slot) => [value, slot] as const))
  return (value) => {
    if (value === null || value.length === 0) return 0
    const held = slots.get(value)
    if (held !== undefined) return held
    const slot = store.text.length
    store.text.push(value)
    slots.set(value, slot)
    return slot
  }
}

const quantumValues = (material: VisualQuantumMaterial): number[] => [
  ...material.color,
  material.opacity,
  material.glowIntensity,
  material.highlightSize,
]

const lineValues = (material: VisualLineMaterial): number[] => [
  ...material.color,
  ...material.glowColor,
  material.glowIntensity,
  material.opacity,
]

const writeQuantum = (
  target: BulkStore["dark"]["material"],
  slot: number,
  material: VisualQuantumMaterial,
): void => {
  const values = quantumValues(material)
  const start = slot * values.length
  values.forEach((value, offset) => target[start + offset] = value)
}

const compactCurve = (curve: HermiteEdgeCurve): number[] => [
  curve.from.x, curve.from.y, curve.from.z,
  curve.to.x, curve.to.y, curve.to.z,
  curve.fromTangent.x, curve.fromTangent.y, curve.fromTangent.z,
  curve.toTangent.x, curve.toTangent.y, curve.toTangent.z,
]

const stablePhase = (value: string): number => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2
}

const depthIndex = (store: BulkStore): ReadonlyMap<number, number> => {
  const parent = new Map<number, number>()
  for (let slot = 0; slot < store.dark.id.length; slot++) {
    parent.set(store.dark.id[slot]!, store.dark.parent[slot]!)
  }
  const depths = new Map<number, number>()
  const read = (id: number): number => {
    const held = depths.get(id)
    if (held !== undefined) return held
    const owner = parent.get(id) ?? 0
    const depth = owner === 0 ? 0 : read(owner) + 1
    depths.set(id, depth)
    return depth
  }
  for (const id of store.dark.id) read(id)
  return depths
}

const reverseKinds = <Key extends string>(value: Readonly<Record<Key, number>>): Key[] => {
  const result: Key[] = []
  for (const [key, id] of Object.entries(value) as Array<[Key, number]>) result[id] = key
  return result
}

const darkKinds = reverseKinds(BULK_STORE_DARK_KIND)
const fieldKinds = reverseKinds(BULK_STORE_FIELD_KIND)
const orbitalKinds = reverseKinds(BULK_STORE_ORBITAL_KIND)
const relationKinds = reverseKinds(BULK_STORE_RELATION_KIND)

const buildProcessLayouts = (
  input: DirectStoreBuild,
): Readonly<{
  byOrbital: ReadonlyMap<number, ProcessLayout>
  contentByOwner: ReadonlyMap<number, ReadonlyMap<number, Readonly<{
    minimumMajorRadius: number
    minimumTubeRadius: number
  }>>>
}> => {
  const {store, orbitalKey, proxyKey} = input
  const processFieldRadius = STATE_GRAPH_PRODUCTION_SIZING.fieldRadius * torusLevelScale(1)
  const emptyOuterRadius = STATE_GRAPH_PRODUCTION_SIZING.emptyOuterRadius * torusLevelScale(1)
  const contentGap = processFieldRadius * TORUS_LAYOUT_BASELINE.contentGapToFieldRadius
  const groups = new Map<string, Array<Omit<ProcessLayout, "orbitAngle"> & {owner: number; state: number}>>()
  const processKinds = new Set<number>([
    BULK_STORE_ORBITAL_KIND.process,
    BULK_STORE_ORBITAL_KIND.finally,
  ])
  const processSlots = Array.from({length: store.orbital.id.length}, (_, slot) => slot)
    .filter((slot) => processKinds.has(store.orbital.kind[slot]!))
    .sort((left, right) => orbitalKey[left]!.localeCompare(orbitalKey[right]!))
  for (const slot of processSlots) {
    const orbital = store.orbital.id[slot]!
    const owner = store.orbital.owner[slot]!
    const anchor = store.orbital.anchor[slot]!
    const anchorSlot = anchor - 1
    if (
      anchor <= 0 ||
      store.orbital.kind[anchorSlot] !== BULK_STORE_ORBITAL_KIND.state ||
      store.orbital.owner[anchorSlot] !== owner
    ) throw new Error(`Bulk Store Process orbital ${orbital} has no State anchor`)
    const proxyIds = new Set<number>()
    for (let relation = 0; relation < store.relation.id.length; relation++) {
      const kind = store.relation.kind[relation]!
      if (kind !== BULK_STORE_RELATION_KIND["process-read"] &&
          kind !== BULK_STORE_RELATION_KIND["process-write"]) continue
      if (
        store.relation.aKind[relation] === BULK_STORE_ENDPOINT_KIND["field-proxy"] &&
        store.relation.bKind[relation] === BULK_STORE_ENDPOINT_KIND.orbital &&
        store.relation.b[relation] === orbital
      ) proxyIds.add(store.relation.a[relation]!)
      if (
        store.relation.aKind[relation] === BULK_STORE_ENDPOINT_KIND.orbital &&
        store.relation.a[relation] === orbital &&
        store.relation.bKind[relation] === BULK_STORE_ENDPOINT_KIND["field-proxy"]
      ) proxyIds.add(store.relation.b[relation]!)
    }
    const proxies = [...proxyIds].sort((left, right) =>
      store.proxy.sourceField[left - 1]! - store.proxy.sourceField[right - 1]! ||
      proxyKey[left - 1]!.localeCompare(proxyKey[right - 1]!))
    const fields = layoutFieldsInPseudoCircle(proxies.length, processFieldRadius)
    const form = resolveContentTorusForm({
      coreExtent: fields.radius,
      emptyOuterRadius,
      gap: contentGap,
    })
    const layout = {
      fieldProxies: proxies.map((proxy, index) => ({
        proxy,
        radius: processFieldRadius,
        ...(fields.points[index] ?? {x: 0, y: 0, z: 0}),
      })),
      form,
      orbital,
      owner,
      state: store.orbital.source[anchorSlot]!,
    }
    const key = `${owner}:${orbitalKey[anchorSlot]}`
    const held = groups.get(key)
    if (held) held.push(layout)
    else groups.set(key, [layout])
  }
  const byOrbital = new Map<number, ProcessLayout>()
  const contentByOwner = new Map<number, Map<number, {
    minimumMajorRadius: number
    minimumTubeRadius: number
  }>>()
  for (const [key, layouts] of groups) {
    const phase = stablePhase(key)
    const step = Math.PI * 2 / layouts.length
    const minimumTubeRadius = Math.max(...layouts.map((layout) => layout.form.outerRadius)) + contentGap
    const minimumMajorRadius = layouts.length < 2 ? 0 : Math.max(
      ...layouts.map((layout, index) => {
        const next = layouts[(index + 1) % layouts.length]!
        return (layout.form.outerRadius + next.form.outerRadius +
          STATE_GRAPH_PRODUCTION_SIZING.surfaceGap) /
          (2 * Math.sin(Math.PI / layouts.length))
      }),
    )
    for (const [index, layout] of layouts.entries()) {
      byOrbital.set(layout.orbital, {
        fieldProxies: layout.fieldProxies,
        form: layout.form,
        orbitAngle: phase + step * index,
        orbital: layout.orbital,
      })
      const owner = contentByOwner.get(layout.owner) ?? new Map()
      const held = owner.get(layout.state)
      owner.set(layout.state, {
        minimumMajorRadius: Math.max(held?.minimumMajorRadius ?? 0, minimumMajorRadius),
        minimumTubeRadius: Math.max(held?.minimumTubeRadius ?? 0, minimumTubeRadius),
      })
      contentByOwner.set(layout.owner, owner)
    }
  }
  return {byOrbital, contentByOwner}
}

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

const appendBatch = (
  store: BulkStore,
  owner: number,
  kind: number,
  returning: boolean,
  material: VisualLineMaterial,
): number => {
  const id = store.batch.id.length + 1
  numeric(store.batch.id).push(id)
  numeric(store.batch.owner).push(owner)
  numeric(store.batch.kind).push(kind)
  numeric(store.batch.flags).push(
    (returning ? BULK_STORE_FLAG_RETURNING : 0) |
    (material.visibilityMode === "overlay" ? BULK_STORE_FLAG_OVERLAY : 0),
  )
  numeric(store.batch.material).push(...lineValues(material))
  return id
}

const materialKey = (material: VisualLineMaterial): string =>
  [...lineValues(material), material.visibilityMode].join(":")

const batchFor = (
  store: BulkStore,
  batches: Map<string, number>,
  owner: number,
  kind: number,
  returning: boolean,
  material: VisualLineMaterial,
): number => {
  const key = `${owner}:${returning ? 1 : 0}:${materialKey(material)}`
  const held = batches.get(key)
  if (held !== undefined) return held
  const batch = appendBatch(store, owner, kind, returning, material)
  batches.set(key, batch)
  return batch
}

const fillField = (
  store: BulkStore,
  fieldSourceById: ReadonlyMap<number, number>,
  placement: BulkStoreFieldPlacement,
  intern: (value: string | null) => number,
): void => {
  const id = store.field.id.length + 1
  const labels = [...new Set(placement.aliasSlots.map((slot) => {
    const source = fieldSourceById.get(store.fieldAlias.field[slot]!)
    return source === undefined ? "" : store.text[store.fieldSource.label[source]!]!
  }))]
  numeric(store.field.id).push(id)
  numeric(store.field.field).push(Math.min(...placement.fieldIds))
  numeric(store.field.owner).push(placement.ownerDarkParticleId)
  numeric(store.field.kind).push(placement.fieldKind)
  numeric(store.field.flags).push(BULK_STORE_FLAG_ACTIVE)
  numeric(store.field.key).push(intern(placement.fieldKeys.join(" ∩ ")))
  numeric(store.field.label).push(intern(labels.join(" · ")))
  numeric(store.field.value).push(placement.valueId)
  numeric(store.field.valueText).push(intern(placement.valueText))
  numeric(store.field.position).push(placement.x, placement.y, placement.z)
  numeric(store.field.form).push(placement.radius, 0)
  numeric(store.field.material).push(...quantumValues(visualCoreFieldMaterial(
    visualFieldParticleColor({fieldParticleKind: fieldKinds[placement.fieldKind]!}),
  )))
  for (const alias of placement.aliasSlots) {
    store.fieldAlias.marker[alias] = id
    store.fieldAlias.orbit[alias] = placement.orbitIndex
  }
}

const reorderAliases = (
  store: BulkStore,
  placements: readonly BulkStoreFieldPlacement[],
): void => {
  const slots = placements.flatMap((placement) => placement.aliasSlots)
  if (slots.length !== store.fieldAlias.id.length || new Set(slots).size !== slots.length) {
    throw new Error("Bulk Store direct Field placements do not cover aliases exactly")
  }
  const oldToNew = new Map<number, number>()
  slots.forEach((slot, index) => oldToNew.set(slot + 1, index + 1))
  for (const key of Object.keys(store.fieldAlias) as Array<keyof BulkStore["fieldAlias"]>) {
    const source = Array.from(store.fieldAlias[key])
    const target = numeric(store.fieldAlias[key])
    target.length = 0
    if (key === "id") target.push(...slots.map((_, index) => index + 1))
    else target.push(...slots.map((slot) => source[slot]!))
  }
  for (let slot = 0; slot < store.relation.id.length; slot++) {
    if (store.relation.aKind[slot] === BULK_STORE_ENDPOINT_KIND.field) {
      store.relation.a[slot] = oldToNew.get(store.relation.a[slot]!)!
    }
    if (store.relation.bKind[slot] === BULK_STORE_ENDPOINT_KIND.field) {
      store.relation.b[slot] = oldToNew.get(store.relation.b[slot]!)!
    }
    if (
      store.relation.kind[slot] === BULK_STORE_RELATION_KIND["field-entanglement"] &&
      store.relation.aKind[slot] === store.relation.bKind[slot] &&
      store.relation.a[slot]! > store.relation.b[slot]!
    ) {
      const held = store.relation.a[slot]!
      store.relation.a[slot] = store.relation.b[slot]!
      store.relation.b[slot] = held
    }
  }
}

const pointAt = (
  values: BulkStore["dark"]["position"],
  slot: number,
): Point => ({
  x: values[slot * 3]!,
  y: values[slot * 3 + 1]!,
  z: values[slot * 3 + 2]!,
})

/** Fills final Store geometry/material/control columns without a semantic scene. */
export const fillDirectBulkStoreGeometry = (input: DirectStoreBuild): BulkStore => {
  const {store, projection, darkActivity, orbitalKey, proxyKey} = input
  const intern = textInterner(store)
  const depths = depthIndex(store)
  const darkSlotById = new Map(Array.from({length: store.dark.id.length}, (_, slot) =>
    [store.dark.id[slot]!, slot] as const))
  const fieldSourceById = new Map(Array.from({length: store.fieldSource.id.length}, (_, slot) =>
    [store.fieldSource.id[slot]!, slot] as const))
  const atomById = new Map(projection.atoms.map((atom) => [atom.id, atom] as const))
  const atomsInDarkOrder = Array.from(store.dark.id)
    .filter((id) => id % 2 === 0)
    .flatMap((id) => {
      const atom = atomById.get(id / 2)
      return atom ? [atom] : []
    })
  const childrenByOwner = new Map<number, number[]>()
  for (let slot = 0; slot < store.dark.id.length; slot++) {
    const parent = store.dark.parent[slot]!
    if (parent === 0) continue
    const held = childrenByOwner.get(parent)
    if (held) held.push(store.dark.id[slot]!)
    else childrenByOwner.set(parent, [store.dark.id[slot]!])
  }
  const maximumDepth = new Map<number, number>()
  const subtreeDepth = (id: number): number => {
    const held = maximumDepth.get(id)
    if (held !== undefined) return held
    const depth = Math.max(
      depths.get(id) ?? 0,
      ...(childrenByOwner.get(id) ?? []).map(subtreeDepth),
    )
    maximumDepth.set(id, depth)
    return depth
  }
  const visualDarkOrder: number[] = []
  const visitVisualDark = (id: number): void => {
    visualDarkOrder.push(id)
    const children = [...(childrenByOwner.get(id) ?? [])].sort((left, right) => {
      const leftSlot = darkSlotById.get(left)!
      const rightSlot = darkSlotById.get(right)!
      return subtreeDepth(right) - subtreeDepth(left) ||
        (depths.get(left) ?? 0) - (depths.get(right) ?? 0) ||
        store.dark.order[leftSlot]! - store.dark.order[rightSlot]! ||
        left - right
    })
    children.forEach(visitVisualDark)
  }
  visitVisualDark(store.root)
  const atomsInVisualOrder = visualDarkOrder
    .filter((id) => id % 2 === 0)
    .flatMap((id) => {
      const atom = atomById.get(id / 2)
      return atom ? [atom] : []
    })
  const atomsInLayoutOrder = store.layout === BULK_STORE_LAYOUT_OUTSIDE_IN
    ? atomsInDarkOrder
    : atomsInVisualOrder
  const orbitalIdByKey = new Map(orbitalKey.map((key, slot) => [key, slot + 1] as const))
  const proxyByStateField = new Map<string, number>()
  for (let slot = 0; slot < store.proxy.id.length; slot++) {
    proxyByStateField.set(`${store.proxy.state[slot]}:${store.proxy.sourceField[slot]}`, slot + 1)
  }
  const process = buildProcessLayouts(input)
  const statePreparedByOwner = new Map<number, PreparedStateLayout[]>()
  for (const atom of atomsInLayoutOrder) {
    const owner = atom.id * 2
    if (!darkSlotById.has(owner)) continue
    const graph = buildStateGraph(projection, atom.id)
    const index = indexStateGraphLayout(graph)
    const orbitalContentByStateId = process.contentByOwner.get(owner)
    const sizing = orbitalContentByStateId
      ? {...STATE_GRAPH_PRODUCTION_SIZING, orbitalContentByStateId}
      : STATE_GRAPH_PRODUCTION_SIZING
    const prepared: PreparedStateLayout[] = []
    for (const state of graph.states) {
      const layout = buildStateGraphBranchLayoutFromIndex(index, state.id, sizing)
      const value = prepareStateLayout(layout)
      if (value) prepared.push(value)
    }
    statePreparedByOwner.set(owner, prepared)
  }

  const statePlacementsByOwner = new Map<number, StatePlacement[]>()
  const allDarkIds = new Set(Array.from(store.dark.id))
  const allAliases = new Set(Array.from({length: store.fieldAlias.id.length}, (_, slot) => slot))
  const layoutContext = {
    componentRootDarkParticleId: store.root,
    componentRootDepth: 0,
    darkFormSink: (id: number, form: Readonly<{radius: number; tube: number}>) => {
      const slot = darkSlotById.get(id)!
      store.dark.form[slot * 2] = form.radius
      store.dark.form[slot * 2 + 1] = form.tube
    },
    darkPositionSink: (id: number, point: Point) => {
      const slot = darkSlotById.get(id)!
      store.dark.position[slot * 3] = point.x
      store.dark.position[slot * 3 + 1] = point.y
      store.dark.position[slot * 3 + 2] = point.z
    },
    ownStateOuterExtentResolver: (owner: number, childOuterExtent: number, scale: number) => {
      const prepared = statePreparedByOwner.get(owner) ?? []
      const firstRootState = prepared[0]?.layout.rootStateId
      const phase = firstRootState === undefined
        ? 0
        : stablePhase(`${owner}:${firstRootState}:${prepared.length}`)
      const localGap = TORUS_LAYOUT_BASELINE.rootFieldRadius *
        TORUS_LAYOUT_BASELINE.contentGapToFieldRadius
      const packing = packStateSleeves(
        prepared,
        prepared.length === 0 ? 0 : stateInnerOrbitRadius(
          prepared,
          childOuterExtent / scale,
          localGap,
        ),
        stateNodeSurfaceGap(TORUS_LAYOUT_BASELINE.rootFieldRadius),
        phase,
      )
      const statePlacements = prepared.map((entry, index) => ({
        angle: packing.angles[index] ?? phase,
        orbitRadius: packing.orbitRadius,
        prepared: entry,
      }))
      statePlacementsByOwner.set(owner, statePlacements)
      return Math.max(0, ...statePlacements.flatMap(({orbitRadius, prepared: entry}) =>
        entry.offsets.map((offset) =>
          Math.hypot(orbitRadius + offset.x, offset.y, offset.z) + offset.node.radius))) * scale
    },
  }
  const placements = store.layout === BULK_STORE_LAYOUT_OUTSIDE_IN
    ? layoutOutsideInStoreFields(
      store,
      store.root,
      allDarkIds,
      allAliases,
      layoutContext,
    )
    : layoutCenteredNestedStoreFields(
      store,
      store.root,
      allDarkIds,
      allAliases,
      0,
      layoutContext,
    )
  for (const placement of placements) fillField(store, fieldSourceById, placement, intern)
  reorderAliases(store, placements)

  for (let slot = 0; slot < store.dark.id.length; slot++) {
    const kind = darkKinds[store.dark.kind[slot]!]!
    const color = visualDarkParticleColor({
      activity: darkActivity[slot] ?? "neutral",
      darkParticleKind: kind,
    })
    writeQuantum(store.dark.material, slot, visualContextTorusMaterial(color))
  }

  const transitionBatches = new Map<string, number>()
  const matchedTransitions = new Set<number>()
  const stateLayoutWorldByOwnerRoot = new Map<string, StateGraphRootLayout>()
  for (const atom of atomsInLayoutOrder) {
    const owner = atom.id * 2
    if (!darkSlotById.has(owner)) continue
    const scale = torusLevelScale(depths.get(owner) ?? 0)
    for (const statePlacement of statePlacementsByOwner.get(owner) ?? []) {
      const rootState = statePlacement.prepared.layout.rootStateId
      const layout = placeStateLayout(statePlacement, {scale, x: 0, y: 0, z: 0})
      stateLayoutWorldByOwnerRoot.set(`${owner}:${rootState}`, layout)
      const orbitalByNode = new Map<string, number>()
      for (const node of layout.nodes) {
        const key = stateOccurrenceKey(atom.id, rootState, node)
        const orbital = orbitalIdByKey.get(key)
        if (orbital === undefined) throw new Error(`Bulk Store State occurrence ${key} is absent`)
        orbitalByNode.set(node.id, orbital)
        const slot = orbital - 1
        store.orbital.position[slot * 3] = node.x
        store.orbital.position[slot * 3 + 1] = node.y
        store.orbital.position[slot * 3 + 2] = node.z
        const form = stateGraphNodeFormDimensions(node.radius, node.innerRadius)
        store.orbital.form[slot * 2] = form.torusRadius
        store.orbital.form[slot * 2 + 1] = form.torusTube
        writeQuantum(
          store.orbital.material,
          slot,
          visualStateTorusMaterial(
            node.color,
            node.current,
            (store.orbital.flags[slot]! & BULK_STORE_FLAG_ACTIVE) !== 0,
          ),
        )
      }
      const nodeById = new Map(layout.nodes.map((node) => [node.id, node] as const))
      for (const edge of layout.edges) {
        const from = orbitalByNode.get(edge.fromNodeId)
        const to = orbitalByNode.get(edge.toNodeId)
        const fromNode = nodeById.get(edge.fromNodeId)
        const toNode = nodeById.get(edge.toNodeId)
        if (!from || !to || !fromNode || !toNode) {
          throw new Error(`Bulk Store State edge ${edge.id} has no endpoint`)
        }
        let transitionSlot = -1
        for (let slot = 0; slot < store.transition.id.length; slot++) {
          if (
            !matchedTransitions.has(slot) &&
            store.transition.owner[slot] === owner &&
            store.transition.source[slot] === edge.transitionId &&
            store.transition.from[slot] === from &&
            store.transition.to[slot] === to
          ) {
            transitionSlot = slot
            break
          }
        }
        if (transitionSlot < 0) throw new Error(`Bulk Store Transition ${edge.id} is absent`)
        matchedTransitions.add(transitionSlot)
        const active = (store.transition.flags[transitionSlot]! & BULK_STORE_FLAG_ACTIVE) !== 0
        const material = visualTransitionMaterial(edge.returning, active)
        store.transition.batch[transitionSlot] = batchFor(
          store,
          transitionBatches,
          owner,
          BULK_STORE_BATCH_KIND.transition,
          edge.returning,
          material,
        )
        const controls = compactCurve(describeStateGraphHermiteEdgeCurve(edge, fromNode, toNode))
        controls.forEach((value, offset) =>
          store.transition.control[transitionSlot * 12 + offset] = value)
      }
    }
  }
  if (matchedTransitions.size !== store.transition.id.length) {
    throw new Error("Bulk Store direct layout did not place every Transition")
  }

  const stateActive = (orbital: number): boolean =>
    (store.orbital.flags[orbital - 1]! & BULK_STORE_FLAG_ACTIVE) !== 0
  for (let slot = 0; slot < store.orbital.id.length; slot++) {
    const kind = store.orbital.kind[slot]!
    if (kind === BULK_STORE_ORBITAL_KIND.state) continue
    const anchor = store.orbital.anchor[slot]!
    const anchorSlot = anchor - 1
    const anchorPoint = pointAt(store.orbital.position, anchorSlot)
    const anchorRadius = store.orbital.form[anchorSlot * 2]!
    const anchorTube = store.orbital.form[anchorSlot * 2 + 1]!
    const active = (store.orbital.flags[slot]! & BULK_STORE_FLAG_ACTIVE) !== 0
    const current = (store.orbital.flags[slot]! & 1) !== 0
    const color = visualOrbitalParticleColor({
      orbitalParticleKind: orbitalKinds[kind]!,
      sourceId: store.orbital.source[slot]!,
    })
    const processLayout = process.byOrbital.get(slot + 1)
    if (kind === BULK_STORE_ORBITAL_KIND.process || kind === BULK_STORE_ORBITAL_KIND.finally) {
      if (!processLayout) throw new Error(`Bulk Store Process ${slot + 1} has no layout`)
      const scale = torusLevelScale(depths.get(store.orbital.owner[slot]!) ?? 0)
      store.orbital.position[slot * 3] = anchorPoint.x + Math.cos(processLayout.orbitAngle) * anchorRadius
      store.orbital.position[slot * 3 + 1] = anchorPoint.y + Math.sin(processLayout.orbitAngle) * anchorRadius
      store.orbital.position[slot * 3 + 2] = anchorPoint.z
      store.orbital.form[slot * 2] = processLayout.form.radius * scale
      store.orbital.form[slot * 2 + 1] = processLayout.form.tube * scale
      writeQuantum(store.orbital.material, slot, visualProcessTorusMaterial(
        color, current, active, stateActive(anchor),
      ))
      continue
    }
    const causalSlot = Array.from({length: slot}, (_, index) => index)
      .filter((index) =>
        store.orbital.anchor[index] === anchor &&
        store.orbital.kind[index] !== BULK_STORE_ORBITAL_KIND.process &&
        store.orbital.kind[index] !== BULK_STORE_ORBITAL_KIND.finally).length
    const radius = torusFieldRadiusAtLevel(depths.get(store.orbital.owner[slot]!) ?? 0) * 0.72
    const angle = stablePhase(orbitalKey[anchorSlot]!) +
      causalSlot * Math.PI * (3 - Math.sqrt(5))
    const orbitRadius = anchorRadius + anchorTube + radius * 1.8
    store.orbital.position[slot * 3] = anchorPoint.x + Math.cos(angle) * orbitRadius
    store.orbital.position[slot * 3 + 1] = anchorPoint.y + Math.sin(angle) * orbitRadius
    store.orbital.position[slot * 3 + 2] = anchorPoint.z +
      Math.sin(stablePhase(`${orbitalKey[slot]}:z`)) * radius * 0.8
    store.orbital.form[slot * 2] = radius
    store.orbital.form[slot * 2 + 1] = 0
    writeQuantum(store.orbital.material, slot, visualCausalMaterial(
      color, current, active, stateActive(anchor),
    ))
  }

  const aliasMarkerByOwnerField = new Map<string, number>()
  for (let slot = 0; slot < store.fieldAlias.id.length; slot++) {
    aliasMarkerByOwnerField.set(
      `${store.fieldAlias.atom[slot]! * 2}:${store.fieldAlias.field[slot]}`,
      store.fieldAlias.marker[slot]!,
    )
  }
  const consumedProxies = new Set<number>()
  for (const layout of [...process.byOrbital.values()].sort((left, right) =>
    orbitalKey[left.orbital - 1]!.localeCompare(orbitalKey[right.orbital - 1]!))) {
    const orbitalSlot = layout.orbital - 1
    const owner = store.orbital.owner[orbitalSlot]!
    const scale = torusLevelScale(depths.get(owner) ?? 0)
    const processPoint = pointAt(store.orbital.position, orbitalSlot)
    for (const field of layout.fieldProxies) {
      const slot = field.proxy - 1
      consumedProxies.add(field.proxy)
      const marker = aliasMarkerByOwnerField.get(`${owner}:${store.proxy.sourceField[slot]}`)
      if (marker === undefined) throw new Error(`Bulk Store Process proxy ${field.proxy} has no Field`)
      store.proxy.field[slot] = marker
      store.proxy.paint[slot] = layout.orbital
      store.proxy.position[slot * 3] = processPoint.x + field.x * scale
      store.proxy.position[slot * 3 + 1] = processPoint.y + field.y * scale
      store.proxy.position[slot * 3 + 2] = processPoint.z + field.z * scale
      store.proxy.form[slot * 2] = field.radius * scale
      store.proxy.form[slot * 2 + 1] = 0
      const color = visualFieldParticleColor({
        fieldParticleKind: fieldKinds[store.field.kind[marker - 1]!]!,
      })
      writeQuantum(store.proxy.material, slot, visualFieldProxyMaterial(
        color,
        "sphere",
        (store.orbital.flags[orbitalSlot]! & BULK_STORE_FLAG_ACTIVE) !== 0,
        stateActive(store.proxy.state[slot]!),
      ))
    }
  }
  for (const atom of atomsInDarkOrder) {
    const owner = atom.id * 2
    for (const statePlacement of statePlacementsByOwner.get(owner) ?? []) {
      const rootState = statePlacement.prepared.layout.rootStateId
      const layout = stateLayoutWorldByOwnerRoot.get(`${owner}:${rootState}`)!
      for (const node of layout.nodes) {
        const stateKey = stateOccurrenceKey(atom.id, rootState, node)
        const state = orbitalIdByKey.get(stateKey)!
        for (const field of stateGraphFieldSphereLayout(node.fields, node.fieldRadius)) {
          const proxy = proxyByStateField.get(`${state}:${field.id}`)
          if (proxy === undefined || consumedProxies.has(proxy)) continue
          consumedProxies.add(proxy)
          const slot = proxy - 1
          const marker = aliasMarkerByOwnerField.get(`${owner}:${field.id}`)
          if (marker === undefined) throw new Error(`Bulk Store condition proxy ${proxy} has no Field`)
          store.proxy.field[slot] = marker
          store.proxy.position[slot * 3] = node.x + field.x
          store.proxy.position[slot * 3 + 1] = node.y + field.y
          store.proxy.position[slot * 3 + 2] = node.z + field.z
          store.proxy.form[slot * 2] = field.radius
          store.proxy.form[slot * 2 + 1] = 0
          const color = visualFieldParticleColor({
            fieldParticleKind: fieldKinds[store.field.kind[marker - 1]!]!,
          })
          writeQuantum(store.proxy.material, slot, visualConditionFieldMaterial(
            color,
            node.current,
            stateActive(state),
          ))
        }
      }
    }
  }
  for (let slot = 0; slot < store.proxy.id.length; slot++) {
    const proxy = slot + 1
    if (consumedProxies.has(proxy)) continue
    const state = store.proxy.state[slot]!
    const stateSlot = state - 1
    const owner = store.proxy.owner[slot]!
    const marker = aliasMarkerByOwnerField.get(`${owner}:${store.proxy.sourceField[slot]}`)
    if (marker === undefined) throw new Error(`Bulk Store proxy ${proxy} has no Field`)
    store.proxy.field[slot] = marker
    const statePoint = pointAt(store.orbital.position, stateSlot)
    const stateOuter = store.orbital.form[stateSlot * 2]! + store.orbital.form[stateSlot * 2 + 1]!
    const angle = stablePhase(proxyKey[slot]!)
    const elevation = Math.sin(stablePhase(`${proxyKey[slot]}:z`)) * 0.55
    const radial = Math.sqrt(Math.max(0, 1 - elevation * elevation))
    const radius = Math.max(
      torusFieldRadiusAtLevel(depths.get(owner) ?? 0) * 0.42,
      stateOuter * 0.1,
    )
    store.proxy.kind[slot] = 1
    store.proxy.flags[slot] = BULK_STORE_FLAG_TORUS
    store.proxy.position[slot * 3] = statePoint.x + Math.cos(angle) * radial * stateOuter * 0.78
    store.proxy.position[slot * 3 + 1] = statePoint.y + Math.sin(angle) * radial * stateOuter * 0.78
    store.proxy.position[slot * 3 + 2] = statePoint.z + elevation * stateOuter * 0.78
    store.proxy.form[slot * 2] = radius
    store.proxy.form[slot * 2 + 1] = radius * 0.16
    const color = visualFieldParticleColor({
      fieldParticleKind: fieldKinds[store.field.kind[marker - 1]!]!,
    })
    writeQuantum(store.proxy.material, slot, visualFieldProxyMaterial(
      color, "torus", stateActive(state), stateActive(state),
    ))
  }

  const endpoint = (kind: number, id: number): OwnedPoint | null => {
    let point: Point | null
    let endpointOwner: number
    if (kind === BULK_STORE_ENDPOINT_KIND.field) {
      const marker = store.fieldAlias.marker[id - 1]!
      if (marker <= 0) return null
      point = pointAt(store.field.position, marker - 1)
      endpointOwner = store.field.owner[marker - 1]!
    } else if (kind === BULK_STORE_ENDPOINT_KIND["field-proxy"]) {
      if (id <= 0) return null
      point = pointAt(store.proxy.position, id - 1)
      endpointOwner = store.proxy.owner[id - 1]!
    } else {
      if (id <= 0) return null
      point = pointAt(store.orbital.position, id - 1)
      endpointOwner = store.orbital.owner[id - 1]!
    }
    return {...point, owner: endpointOwner}
  }
  const darkWorld = (
    id: number,
    cache: Map<number, Point>,
  ): Point => {
    const held = cache.get(id)
    if (held) return held
    const slot = darkSlotById.get(id)
    if (slot === undefined) throw new Error(`Bulk Store Dark ${id} is absent`)
    const local = pointAt(store.dark.position, slot)
    const parent = store.dark.parent[slot]!
    const parentPoint = parent === 0 ? {x: 0, y: 0, z: 0} : darkWorld(parent, cache)
    const world = {
      x: parentPoint.x + local.x,
      y: parentPoint.y + local.y,
      z: parentPoint.z + local.z,
    }
    cache.set(id, world)
    return world
  }
  const branch = (kind: number, id: number): number | null => {
    if (kind === BULK_STORE_ENDPOINT_KIND.field) return null
    if (kind === BULK_STORE_ENDPOINT_KIND["field-proxy"]) return store.proxy.state[id - 1]!
    const slot = id - 1
    return store.orbital.anchor[slot]! ||
      (store.orbital.kind[slot] === BULK_STORE_ORBITAL_KIND.state ? id : null)
  }
  const relationBatches = new Map<string, number>()
  const darkWorldCache = new Map<number, Point>()
  for (let slot = 0; slot < store.relation.id.length; slot++) {
    const relationKind = relationKinds[store.relation.kind[slot]!]!
    if (!visualRelationHasSceneGeometry({relationKind})) continue
    const entanglement = store.relation.kind[slot] === BULK_STORE_RELATION_KIND["field-entanglement"]
    if (
      entanglement &&
      store.relation.aKind[slot] === BULK_STORE_ENDPOINT_KIND.field &&
      store.relation.bKind[slot] === BULK_STORE_ENDPOINT_KIND.field &&
      store.fieldAlias.marker[store.relation.a[slot]! - 1] ===
        store.fieldAlias.marker[store.relation.b[slot]! - 1]
    ) continue
    const fromEndpoint = endpoint(
      store.relation.aKind[slot]!,
      store.relation.a[slot]!,
    )
    const toEndpoint = endpoint(
      store.relation.bKind[slot]!,
      store.relation.b[slot]!,
    )
    if (!fromEndpoint || !toEndpoint) {
      throw new Error(`Bulk Store relation ${slot + 1} has no endpoint`)
    }
    const relationOwner = store.relation.owner[slot]!
    const relationOrigin = darkWorld(relationOwner, darkWorldCache)
    const relative = (entry: OwnedPoint): Point => {
      const origin = darkWorld(entry.owner, darkWorldCache)
      return {
        x: entry.x + origin.x - relationOrigin.x,
        y: entry.y + origin.y - relationOrigin.y,
        z: entry.z + origin.z - relationOrigin.z,
      }
    }
    const from = relative(fromEndpoint)
    const to = relative(toEndpoint)
    const fromBranch = branch(store.relation.aKind[slot]!, store.relation.a[slot]!)
    const toBranch = branch(store.relation.bKind[slot]!, store.relation.b[slot]!)
    if (fromBranch !== null && toBranch !== null && fromBranch !== toBranch) {
      throw new Error(`Bulk Store relation ${slot + 1} crosses State branches`)
    }
    const branchId = fromBranch ?? toBranch
    const active = (store.relation.flags[slot]! & BULK_STORE_FLAG_ACTIVE) !== 0
    const branchActive = branchId === null ? active : stateActive(branchId)
    const material = visualRelationMaterial(
      visualRelationColor({relationKind}),
      active,
      branchActive,
    )
    store.relation.batch[slot] = batchFor(
      store,
      relationBatches,
      store.relation.owner[slot]!,
      BULK_STORE_BATCH_KIND.relation,
      false,
      material,
    )
    store.relation.controlStart[slot] = store.relation.control.length
    numeric(store.relation.control).push(
      ...compactCurve(describeHermiteEdgeCurve({
        from, leftOuterRadius: 1, rightOuterRadius: 1, side: 1, to,
      })),
      ...compactCurve(describeHermiteEdgeCurve({
        from: to, leftOuterRadius: 1, rightOuterRadius: 1, side: -1, to: from,
      })),
    )
  }
  return store
}
