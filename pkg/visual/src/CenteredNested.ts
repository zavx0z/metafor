import type {
  BulkFieldParticle,
  BulkManifest,
} from "@metafor/types/bulk/manifest"
import {layoutFieldsInPseudoCircle} from "./FieldsLayout.ts"
import {
  buildStateSleeveEdges,
  indexOwnerStateLayouts,
  indexStateSleeveOccurrences,
  indexStateSleeveTransitions,
  identifyStateLayoutOccurrences,
  packStateSleeves,
  placeStateLayout,
  prepareStateLayout,
  stateSleevePhase,
  stateInnerOrbitRadius,
  stateNodeSurfaceGap,
  type PreparedStateLayout,
  type OwnerStateLayouts,
  type StatePlacement,
} from "./internal/state-sleeves.ts"
import {
  TORUS_LAYOUT_BASELINE,
  defineTorusComposition,
  resolveContentTorusForm,
  torusFieldRadiusAtLevel,
  torusLevelScale,
  type TorusComposition,
} from "./Torus.ts"
import {
  visualDarkParticleColor,
  visualFieldParticleColor,
} from "./SemanticVisual.ts"
import {
  visualContextTorusMaterial,
  visualCoreFieldMaterial,
} from "./VisualMaterialSpec.ts"
import {createVisualComponentComposer} from "./VisualComponents.ts"
import {
  buildDarkParticleForest,
  compareDarkParticles,
  type DarkTreeNode,
} from "./internal/dark-tree.ts"
import {
  addCompleteVisualStateComponents,
} from "./internal/complete-state-components.ts"
import {buildProcessTorusLayoutIndex} from "./internal/process-layout.ts"
import {
  defineVisualScene,
  defineVisualLayout,
  type VisualFieldPlacement,
  type VisualLayoutInput,
  type VisualOwnerGraph,
  type VisualScene,
  type VisualStateSleevePlacement,
  type VisualTorusPlacement,
} from "./internal/layout.ts"

export type CenteredNestedVisualScene = VisualScene

export type CenteredNestedFieldBandKind =
  | "inner-private"
  | "root-private"
  | "shared"

export type CenteredNestedFieldPlacement = Readonly<{
  affinityOwnerDarkParticleId: number
  band: number
  bandKind: CenteredNestedFieldBandKind
  color: readonly [number, number, number]
  deepestOwnerDepth: number
  fieldIds: readonly number[]
  fieldKeys: readonly string[]
  fieldParticleKind: BulkFieldParticle["fieldParticleKind"]
  fieldParticleIds: readonly string[]
  orbitIndex: number
  ownerDarkParticleIds: readonly number[]
  ownerDarkParticleId: number
  radius: number
  valueId: number | null
  valueText: string | null
  x: number
  y: number
  z: number
}>

type ComponentFieldLayout = Readonly<{
  entriesByOwner: ReadonlyMap<
    number,
    readonly ComponentFieldEntry[]
  >
  root: DarkTreeNode
}>

type ComponentFieldEntry = Readonly<{
  affinityOwner: DarkTreeNode
  band: number
  bandKind: CenteredNestedFieldBandKind
  deepestOwnerDepth: number
  field: BulkFieldParticle
  fieldIds: readonly number[]
  fieldKeys: readonly string[]
  fieldParticleIds: readonly string[]
  owner: DarkTreeNode
  owners: readonly DarkTreeNode[]
}>

type CenteredTorusPayload = Readonly<{
  node: DarkTreeNode
  ownerAtomId: number | null
  states: readonly StatePlacement[]
}>

type CenteredDarkTorus = TorusComposition<
  CenteredTorusPayload,
  CenteredNestedFieldPlacement
>

type ResolvedComponentTori = Readonly<{
  center: Readonly<{x: number; y: number; z: number}>
  root: CenteredDarkTorus
}>

const indexMaximumSubtreeDepth = (
  node: DarkTreeNode,
  index: Map<number, number>,
): number => {
  const depth = Math.max(
    node.particle.depth,
    ...node.children.map((child) =>
      indexMaximumSubtreeDepth(child, index)
    ),
  )
  index.set(node.particle.darkParticleId, depth)
  return depth
}

const stablePhase = (value: string): number => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2
}

const fieldOrder = (
  left: BulkFieldParticle,
  right: BulkFieldParticle,
): number =>
  (left.valueId ?? Number.MAX_SAFE_INTEGER) -
    (right.valueId ?? Number.MAX_SAFE_INTEGER) ||
  left.parentDarkParticleId - right.parentDarkParticleId ||
  left.fieldId - right.fieldId ||
  left.fieldParticleId.localeCompare(right.fieldParticleId)

const fieldValueGroupKey = (
  field: BulkFieldParticle,
): string => field.valueId === null
  ? `field:${field.fieldParticleId}`
  : `value:${field.valueId}`

const highestCommonOwner = (
  fields: readonly BulkFieldParticle[],
  root: DarkTreeNode,
  nodeById: ReadonlyMap<number, DarkTreeNode>,
): DarkTreeNode => {
  const ownerIds = [...new Set(fields.map((field) =>
    field.parentDarkParticleId
  ))]
  const paths = ownerIds.flatMap((ownerId) => {
    const owner = nodeById.get(ownerId)
    if (!owner) return []
    const path: DarkTreeNode[] = []
    let cursor: DarkTreeNode | undefined = owner
    while (cursor) {
      path.push(cursor)
      const parentId: number | null =
        cursor.particle.parentDarkParticleId
      cursor = parentId === null
        ? undefined
        : nodeById.get(parentId)
    }
    return [path.reverse()]
  })
  if (paths.length === 0) return root

  let common = paths[0]?.[0] ?? root
  const maximumCommonDepth = Math.min(...paths.map((path) => path.length))
  for (let index = 0; index < maximumCommonDepth; index += 1) {
    const candidate = paths[0]?.[index]
    if (
      !candidate ||
      !paths.every((path) =>
        path[index]?.particle.darkParticleId ===
          candidate.particle.darkParticleId
      )
    ) break
    common = candidate
  }
  return common
}

const fieldOrbitCapacity = (
  orbitRadius: number,
  markerRadius: number,
): number => {
  if (markerRadius <= 0 || orbitRadius <= markerRadius) return 1
  const halfAngle = Math.asin(
    Math.min(1, markerRadius / orbitRadius),
  )
  return Math.max(
    1,
    Math.floor(Math.PI / Math.max(halfAngle, 1e-9) + 1e-9),
  )
}

const proportionalOrbitCounts = (
  count: number,
  capacities: readonly number[],
): readonly number[] => {
  if (count <= 0 || capacities.length === 0) return []
  const allocations = capacities.map(() => 1)
  let remaining = count - allocations.length
  if (remaining <= 0) return allocations

  const available = capacities.map((capacity, index) =>
    Math.max(0, capacity - allocations[index]!)
  )
  const totalAvailable = available.reduce(
    (total, capacity) => total + capacity,
    0,
  )
  const quotas = available.map((capacity) =>
    totalAvailable === 0 ? 0 : remaining * capacity / totalAvailable
  )
  for (let index = 0; index < allocations.length; index += 1) {
    const addition = Math.min(
      available[index]!,
      Math.floor(quotas[index]!),
    )
    allocations[index]! += addition
    remaining -= addition
  }
  const remainderOrder = quotas
    .map((quota, index) => ({
      fraction: quota - Math.floor(quota),
      index,
    }))
    .sort((left, right) =>
      right.fraction - left.fraction || left.index - right.index
    )
  for (const {index} of remainderOrder) {
    if (remaining === 0) break
    if (allocations[index]! >= capacities[index]!) continue
    allocations[index]! += 1
    remaining -= 1
  }
  return allocations
}

const placeComponentFields = (
  fields: readonly BulkFieldParticle[],
  root: DarkTreeNode,
  nodeById: ReadonlyMap<number, DarkTreeNode>,
): ComponentFieldLayout => {
  const groups = new Map<string, BulkFieldParticle[]>()
  for (const field of fields) {
    const key = fieldValueGroupKey(field)
    const group = groups.get(key)
    if (group) group.push(field)
    else groups.set(key, [field])
  }
  for (const group of groups.values()) group.sort(fieldOrder)

  const rootDepth = root.particle.depth
  const visualEntries: ComponentFieldEntry[] = []
  for (const group of groups.values()) {
    const owners = [...new Set(group.map((field) =>
      field.parentDarkParticleId
    ))]
      .flatMap((ownerId) => {
        const owner = nodeById.get(ownerId)
        return owner ? [owner] : []
      })
      .sort((left, right) =>
        compareDarkParticles(left.particle, right.particle)
      )
    const deepestOwnerDepth = Math.max(
      rootDepth,
      ...owners.map((owner) => owner.particle.depth),
    )
    const affinityOwner = owners.find((owner) =>
      owner.particle.depth === deepestOwnerDepth
    ) ?? root
    const shared = owners.length > 1 && group[0]?.valueId !== null
    if (shared) {
      const owner = highestCommonOwner(group, root, nodeById)
      const ownerDepth = Math.max(
        0,
        owner.particle.depth - rootDepth,
      )
      visualEntries.push({
        affinityOwner,
        band: ownerDepth * 2 + 1,
        bandKind: "shared",
        deepestOwnerDepth,
        field: group.find((field) =>
          field.parentDarkParticleId === owner.particle.darkParticleId
        ) ?? group[0]!,
        fieldIds: group.map((field) => field.fieldId),
        fieldKeys: group.map((field) => field.fieldKey),
        fieldParticleIds: group.map((field) => field.fieldParticleId),
        owner,
        owners,
      })
      continue
    }
    for (const field of group) {
      const owner = nodeById.get(field.parentDarkParticleId) ?? root
      const ownerDepth = Math.max(
        0,
        owner.particle.depth - rootDepth,
      )
      visualEntries.push({
        affinityOwner: owner,
        band: ownerDepth === 0 ? 0 : ownerDepth * 2,
        bandKind: ownerDepth === 0
          ? "root-private"
          : "inner-private",
        deepestOwnerDepth: owner.particle.depth,
        field,
        fieldIds: [field.fieldId],
        fieldKeys: [field.fieldKey],
        fieldParticleIds: [field.fieldParticleId],
        owner,
        owners: [owner],
      })
    }
  }

  const entriesByOwner = new Map<
    number,
    ComponentFieldEntry[]
  >()
  for (const entry of visualEntries) {
    const ownerId = entry.owner.particle.darkParticleId
    const entries = entriesByOwner.get(ownerId)
    if (entries) entries.push(entry)
    else entriesByOwner.set(ownerId, [entry])
  }
  for (const entries of entriesByOwner.values()) {
    entries.sort((left, right) =>
      (left.bandKind === right.bandKind
        ? 0
        : left.bandKind === "root-private" ||
            left.bandKind === "inner-private"
          ? -1
          : 1) ||
      right.deepestOwnerDepth - left.deepestOwnerDepth ||
      compareDarkParticles(
        left.affinityOwner.particle,
        right.affinityOwner.particle,
      ) ||
      fieldOrder(left.field, right.field)
    )
  }

  return {
    entriesByOwner,
    root,
  }
}

type FieldOrbitCursor = {
  value: number
}

type OwnerFieldLayout = Readonly<{
  outerBoundary: number
  placements: readonly CenteredNestedFieldPlacement[]
}>

const fieldPlacement = (
  entry: ComponentFieldEntry,
  orbitIndex: number,
  radius: number,
  point: Readonly<{x: number; y: number; z: number}>,
): CenteredNestedFieldPlacement => ({
  affinityOwnerDarkParticleId:
    entry.affinityOwner.particle.darkParticleId,
  band: entry.band,
  bandKind: entry.bandKind,
  color: visualFieldParticleColor(entry.field),
  deepestOwnerDepth: entry.deepestOwnerDepth,
  fieldIds: entry.fieldIds,
  fieldKeys: entry.fieldKeys,
  fieldParticleKind: entry.field.fieldParticleKind,
  fieldParticleIds: entry.fieldParticleIds,
  orbitIndex,
  ownerDarkParticleIds: entry.owners.map((owner) =>
    owner.particle.darkParticleId
  ),
  ownerDarkParticleId: entry.owner.particle.darkParticleId,
  radius,
  valueId: entry.field.valueId,
  valueText: entry.field.valueText,
  x: point.x,
  y: point.y,
  z: point.z,
})

const placeFieldOrbitGroup = (
  entries: readonly ComponentFieldEntry[],
  occupiedOuterBoundary: number,
  surfaceGap: number,
  phaseKey: string,
  orbitCursor: FieldOrbitCursor,
): OwnerFieldLayout => {
  if (entries.length === 0) {
    return {
      outerBoundary: occupiedOuterBoundary,
      placements: [],
    }
  }
  const radii = entries.map((entry) =>
    torusFieldRadiusAtLevel(entry.owner.particle.depth)
  )
  const maximumRadius = Math.max(0, ...radii)
  const firstOrbitRadius =
    occupiedOuterBoundary + surfaceGap + maximumRadius
  const orbitStep = maximumRadius * 2
  const orbitRadii: number[] = []
  const orbitCapacities: number[] = []
  let totalCapacity = 0
  while (totalCapacity < entries.length) {
    const orbitRadius =
      firstOrbitRadius + orbitRadii.length * orbitStep
    const capacity = fieldOrbitCapacity(
      orbitRadius,
      maximumRadius,
    )
    orbitRadii.push(orbitRadius)
    orbitCapacities.push(capacity)
    totalCapacity += capacity
  }

  const placements: CenteredNestedFieldPlacement[] = []
  const orbitCounts = proportionalOrbitCounts(
    entries.length,
    orbitCapacities,
  )
  let entryCursor = 0
  orbitCounts.forEach((orbitCount, localOrbitIndex) => {
    const orbitRadius = orbitRadii[localOrbitIndex]!
    const orbitIndex = orbitCursor.value
    const phase = stablePhase(
      `${phaseKey}:${orbitIndex}`,
    )
    for (let index = 0; index < orbitCount; index += 1) {
      const entryIndex = entryCursor + index
      const entry = entries[entryIndex]!
      const angle = phase + index * Math.PI * 2 / orbitCount
      placements.push(fieldPlacement(
        entry,
        orbitIndex,
        radii[entryIndex] ?? maximumRadius,
        {
          x: Math.cos(angle) * orbitRadius,
          y: Math.sin(angle) * orbitRadius,
          z: 0,
        },
      ))
    }
    entryCursor += orbitCount
    orbitCursor.value += 1
  })

  return {
    outerBoundary:
      orbitRadii.at(-1)! + maximumRadius,
    placements,
  }
}

const placeOwnerFields = (
  component: ComponentFieldLayout,
  node: DarkTreeNode,
  minimumCoreExtent: number,
  orbitCursor: FieldOrbitCursor,
): OwnerFieldLayout => {
  const entries = component.entriesByOwner.get(
    node.particle.darkParticleId,
  ) ?? []
  const privateEntries = entries.filter((entry) =>
    entry.bandKind !== "shared"
  )
  const sharedEntries = entries.filter((entry) =>
    entry.bandKind === "shared"
  )
  const placements: CenteredNestedFieldPlacement[] = []
  let occupiedOuterBoundary = minimumCoreExtent

  if (node === component.root) {
    const centerRadii = privateEntries.map((entry) =>
      torusFieldRadiusAtLevel(entry.owner.particle.depth)
    )
    const centerMarkerRadius = Math.max(0, ...centerRadii)
    const centerLayout = layoutFieldsInPseudoCircle(
      privateEntries.length,
      centerMarkerRadius,
    )
    privateEntries.forEach((entry, index) => {
      const point = centerLayout.points[index] ?? {x: 0, y: 0, z: 0}
      const radius = centerRadii[index] ?? centerMarkerRadius
      placements.push(fieldPlacement(
        entry,
        orbitCursor.value,
        radius,
        point,
      ))
      occupiedOuterBoundary = Math.max(
        occupiedOuterBoundary,
        Math.hypot(point.x, point.y, point.z) + radius,
      )
    })
  } else {
    const privateLayout = placeFieldOrbitGroup(
      privateEntries,
      occupiedOuterBoundary,
      0,
      `${component.root.particle.darkParticleId}:` +
        `${node.particle.darkParticleId}:private`,
      orbitCursor,
    )
    placements.push(...privateLayout.placements)
    occupiedOuterBoundary = privateLayout.outerBoundary
  }

  const sharedByDepth = Map.groupBy(
    sharedEntries,
    (entry) => entry.deepestOwnerDepth,
  )
  const sharedDepths = [...sharedByDepth.keys()].sort((left, right) =>
    right - left
  )
  let firstSharedDepth = true
  for (const depth of sharedDepths) {
    const depthEntries = sharedByDepth.get(depth) ?? []
    const maximumRadius = Math.max(
      0,
      ...depthEntries.map((entry) =>
        torusFieldRadiusAtLevel(entry.owner.particle.depth)
      ),
    )
    const sharedLayout = placeFieldOrbitGroup(
      depthEntries,
      occupiedOuterBoundary,
      firstSharedDepth && privateEntries.length > 0
        ? maximumRadius * 2
        : 0,
      `${component.root.particle.darkParticleId}:` +
        `${node.particle.darkParticleId}:shared:${depth}`,
      orbitCursor,
    )
    placements.push(...sharedLayout.placements)
    occupiedOuterBoundary = sharedLayout.outerBoundary
    firstSharedDepth = false
  }

  return {
    outerBoundary: occupiedOuterBoundary,
    placements,
  }
}

const buildComponentFieldLayouts = (
  manifest: BulkManifest,
  roots: readonly DarkTreeNode[],
): readonly ComponentFieldLayout[] => {
  const nodeById = new Map<number, DarkTreeNode>()
  const rootIdByNodeId = new Map<number, number>()
  const index = (node: DarkTreeNode, rootId: number): void => {
    nodeById.set(node.particle.darkParticleId, node)
    rootIdByNodeId.set(node.particle.darkParticleId, rootId)
    node.children.forEach((child) => index(child, rootId))
  }
  roots.forEach((root) =>
    index(root, root.particle.darkParticleId)
  )
  const fieldsByRootId = new Map<number, BulkFieldParticle[]>()
  for (const field of manifest.fieldParticles) {
    const rootId = rootIdByNodeId.get(field.parentDarkParticleId)
    if (rootId === undefined) {
      throw new Error(
        `Visual Field owner ${field.parentDarkParticleId} is absent`,
      )
    }
    const fields = fieldsByRootId.get(rootId)
    if (fields) fields.push(field)
    else fieldsByRootId.set(rootId, [field])
  }
  return roots.map((root) =>
    placeComponentFields(
      fieldsByRootId.get(root.particle.darkParticleId) ?? [],
      root,
      nodeById,
    )
  )
}

const stateOuterExtent = (
  placements: readonly StatePlacement[],
): number => Math.max(
  0,
  ...placements.flatMap(({orbitRadius, prepared}) =>
    prepared.offsets.map((offset) =>
      Math.hypot(
        orbitRadius + offset.x,
        offset.y,
        offset.z,
      ) + offset.node.radius
    )
  ),
)

const resolveComponentTori = (
  component: ComponentFieldLayout,
  layoutsByOwner: ReadonlyMap<
    number,
    OwnerStateLayouts
  >,
): ResolvedComponentTori => {
  const markerRadius = TORUS_LAYOUT_BASELINE.rootFieldRadius
  const localGap =
    markerRadius * TORUS_LAYOUT_BASELINE.contentGapToFieldRadius
  const orbitCursor: FieldOrbitCursor = {value: 0}
  const maximumSubtreeDepthById = new Map<number, number>()
  indexMaximumSubtreeDepth(
    component.root,
    maximumSubtreeDepthById,
  )

  const resolve = (
    node: DarkTreeNode,
    minimumCoreExtent: number,
  ): CenteredDarkTorus => {
    const particle = node.particle
    const scale = torusLevelScale(particle.depth)
    const fieldLayout = placeOwnerFields(
      component,
      node,
      minimumCoreExtent,
      orbitCursor,
    )
    const coreExtent = fieldLayout.outerBoundary
    const gap = localGap * scale
    const emptyOuterRadius =
      TORUS_LAYOUT_BASELINE.rootOuterRadius * scale
    const coreForm = resolveContentTorusForm({
      coreExtent,
      emptyOuterRadius,
      gap,
    })
    let childOuterExtent = coreForm.innerRadius
    const orderedChildren = [...node.children].sort((left, right) =>
      (
        maximumSubtreeDepthById.get(
          right.particle.darkParticleId,
        ) ?? right.particle.depth
      ) -
        (
          maximumSubtreeDepthById.get(
            left.particle.darkParticleId,
          ) ?? left.particle.depth
        ) ||
      compareDarkParticles(left.particle, right.particle)
    )
    const childTori = orderedChildren.map((child) => {
      const childTorus = resolve(child, childOuterExtent)
      childOuterExtent = childTorus.form.outerRadius
      return childTorus
    })
    const ownerStateLayouts = layoutsByOwner.get(particle.darkParticleId)
    const preparedStates =
      (ownerStateLayouts?.layouts ?? [])
      .map(prepareStateLayout)
      .filter((layout): layout is PreparedStateLayout => layout !== null)
    const statePhase = stateSleevePhase(
      particle,
      preparedStates,
    )
    const statePacking = packStateSleeves(
      preparedStates,
      preparedStates.length === 0
        ? 0
        : stateInnerOrbitRadius(
          preparedStates,
          childOuterExtent / scale,
          localGap,
        ),
      stateNodeSurfaceGap(markerRadius),
      statePhase,
    )
    const states = preparedStates.map((prepared, index) => ({
      angle: statePacking.angles[index] ?? statePhase,
      orbitRadius: statePacking.orbitRadius,
      prepared,
    }))
    const ownStateOuterExtent = stateOuterExtent(states) * scale
    const form = resolveContentTorusForm({
      coreExtent,
      emptyOuterRadius,
      gap,
      occupiedOuterExtent: Math.max(
        childOuterExtent,
        ownStateOuterExtent,
      ),
    })
    return defineTorusComposition({
      id: `${particle.darkParticleKind}:${particle.darkParticleId}`,
      role: particle.darkParticleKind,
      payload: {
        node,
        ownerAtomId: ownerStateLayouts?.ownerAtomId ?? null,
        states,
      },
      core: fieldLayout.placements,
      innerRadius: form.innerRadius,
      outerRadius: form.outerRadius,
      children: childTori.map((torus) => ({
        scale: 1,
        torus,
        x: 0,
        y: 0,
        z: 0,
      })),
    })
  }

  return {
    center: {x: 0, y: 0, z: 0},
    root: resolve(component.root, 0),
  }
}

const collectCenteredFields = (
  component: ResolvedComponentTori,
): readonly CenteredNestedFieldPlacement[] => {
  const placements: CenteredNestedFieldPlacement[] = []
  const visit = (torus: CenteredDarkTorus): void => {
    for (const placement of torus.core) {
      placements.push(Object.freeze({
        ...placement,
        color: Object.freeze([...placement.color]) as
          readonly [number, number, number],
        fieldIds: Object.freeze([...placement.fieldIds]),
        fieldKeys: Object.freeze([...placement.fieldKeys]),
        fieldParticleIds: Object.freeze([...placement.fieldParticleIds]),
        ownerDarkParticleIds:
          Object.freeze([...placement.ownerDarkParticleIds]),
        x: component.center.x + placement.x,
        y: component.center.y + placement.y,
        z: component.center.z + placement.z,
      }))
    }
    torus.children.forEach((child) => visit(child.torus))
  }
  visit(component.root)
  return Object.freeze(placements)
}

export const layoutCenteredNestedFields = (
  manifest: BulkManifest,
  owners: readonly VisualOwnerGraph[] = [],
): readonly CenteredNestedFieldPlacement[] => {
  const roots = buildDarkParticleForest(manifest)
  const processLayouts = buildProcessTorusLayoutIndex(manifest)
  const layoutsByOwner = indexOwnerStateLayouts(
    manifest,
    owners,
    false,
    processLayouts.stateOrbitalContentByOwner,
  )
  return Object.freeze(
    buildComponentFieldLayouts(manifest, roots).flatMap((component) =>
      collectCenteredFields(
        resolveComponentTori(component, layoutsByOwner),
      )
    ),
  )
}

export const buildCenteredNestedVisualScene = (
  {manifest, owners}: VisualLayoutInput,
): CenteredNestedVisualScene => {
  const componentComposer = createVisualComponentComposer()
  const occurrenceIndex = indexStateSleeveOccurrences(manifest)
  const transitions = indexStateSleeveTransitions(manifest)
  const roots = buildDarkParticleForest(manifest)
  const processLayouts = buildProcessTorusLayoutIndex(manifest)
  const layoutsByOwner = indexOwnerStateLayouts(
    manifest,
    owners,
    true,
    processLayouts.stateOrbitalContentByOwner,
  )
  const components = buildComponentFieldLayouts(manifest, roots)
  const centeredComponents = components.map((component) =>
    resolveComponentTori(component, layoutsByOwner)
  )
  let componentRightBoundary = 0
  const resolvedComponents = centeredComponents.map((component, index) => {
    if (index === 0) {
      componentRightBoundary = component.root.form.outerRadius
      return component
    }
    const gap =
      TORUS_LAYOUT_BASELINE.rootFieldRadius *
      TORUS_LAYOUT_BASELINE.contentGapToFieldRadius
    const x =
      componentRightBoundary + gap + component.root.form.outerRadius
    componentRightBoundary = x + component.root.form.outerRadius
    return {...component, center: {x, y: 0, z: 0}}
  })
  const tori: VisualTorusPlacement[] = []
  const fields: VisualFieldPlacement[] = []
  const stateSleeves: VisualStateSleevePlacement[] = []
  const visit = (
    torus: CenteredDarkTorus,
    center: Readonly<{x: number; y: number; z: number}>,
  ): void => {
    const particle = torus.payload.node.particle
    const color = visualDarkParticleColor(particle)
    tori.push({
      darkParticleId: particle.darkParticleId,
      darkParticleKind: particle.darkParticleKind,
      depth: particle.depth,
      parentDarkParticleId: particle.parentDarkParticleId,
      src: particle.src,
      x: center.x,
      y: center.y,
      z: center.z,
      radius: torus.form.radius,
      tube: torus.form.tube,
      color,
      material: visualContextTorusMaterial(color),
    })
    componentComposer.addTorus(tori[tori.length - 1]!)
    for (const placement of torus.core) {
      fields.push({
        color: placement.color,
        material: visualCoreFieldMaterial(placement.color),
        fieldIds: placement.fieldIds,
        fieldKeys: placement.fieldKeys,
        fieldParticleIds: placement.fieldParticleIds,
        fieldParticleKind: placement.fieldParticleKind,
        ownerDarkParticleId: placement.ownerDarkParticleId,
        sourceOwnerDarkParticleIds: placement.ownerDarkParticleIds,
        valueId: placement.valueId,
        valueText: placement.valueText,
        radius: placement.radius,
        x: center.x + placement.x,
        y: center.y + placement.y,
        z: center.z + placement.z,
      })
      componentComposer.addField(fields[fields.length - 1]!)
    }
    for (const placement of torus.payload.states) {
      const ownerAtomId = torus.payload.ownerAtomId
      if (particle.src === null || ownerAtomId === null) continue
      const layout = placeStateLayout(placement, {
          ...center,
          scale: torusLevelScale(particle.depth),
      })
      const occurrences = identifyStateLayoutOccurrences(
        occurrenceIndex,
        ownerAtomId,
        particle.darkParticleId,
        layout,
      )
      stateSleeves.push({
        edges: buildStateSleeveEdges(
          transitions,
          particle.darkParticleId,
          layout,
          occurrences,
        ),
        layout,
        occurrences,
        ownerAtomId,
        ownerDarkParticleId: particle.darkParticleId,
        ownerSrc: particle.src,
        rootStateId: placement.prepared.layout.rootStateId,
      })
      componentComposer.addStateSleeve(
        stateSleeves[stateSleeves.length - 1]!,
      )
    }
    for (const child of torus.children) visit(child.torus, center)
  }
  resolvedComponents.forEach((component) => {
    visit(component.root, component.center)
  })

  addCompleteVisualStateComponents({
    componentComposer,
    fields,
    manifest,
    processLayouts,
    stateSleeves,
    tori,
  })
  return defineVisualScene({
    components: componentComposer.finish({
      requireCompleteStateForms: true,
    }),
    layoutSlug: "centered-nested",
  })
}

export const CenteredNested = defineVisualLayout({
  slug: "centered-nested",
  label: "Центрированно-вложенная",
  status: "ready",
  description:
    "Общий центр вложенных Torus: private Fields остаются в ядре владельца, а общие canonical Values — у верхнего общего предка.",
  /**
   * `fieldValueGroupKey` keys every Field group by canonical Value, and a group
   * owned by more than one Atom is relocated to the highest common owner in a
   * `shared` band. Rebinding a Value therefore regroups and moves markers, so a
   * Value change is a geometry change here, never appearance-only.
   */
  placement: {currentState: false, fieldValue: true},
  buildScene: buildCenteredNestedVisualScene,
})
