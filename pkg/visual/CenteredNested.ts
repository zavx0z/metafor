import type {
  BulkDarkParticle,
  BulkFieldParticle,
  BulkManifest,
} from "@metafor/types/bulk/manifest"
import {layoutFieldsInPseudoCircle} from "./FieldsLayout.ts"
import {
  mergeStateSleeves,
  packStateSleeves,
  placeStateLayout,
  prepareStateLayout,
  sourceStatePhase,
  stateInnerOrbitRadius,
  stateNodeSurfaceGap,
  type OutsideInOwnerLayouts,
  type PreparedStateLayout,
  type StatePlacement,
} from "./OutsideIn.ts"
import type {StateGraphRootLayout} from "./StateGraphLayout.ts"
import type {
  StateGraphContextField,
  StateGraphContextTorus,
  StateGraphViewportContext,
} from "./StateGraphViewport.ts"
import {
  TORUS_LAYOUT_BASELINE,
  resolveContentTorusForm,
  torusFieldRadiusAtLevel,
  torusLevelScale,
  type TorusForm,
} from "./Torus.ts"
import {defineVisualLayout} from "./internal/layout.ts"

export const CenteredNested = defineVisualLayout({
  slug: "centered-nested",
  label: "Центрированно-вложенная",
  status: "in-progress",
  description:
    "Общий центр вложенных Torus: private Fields остаются в ядре владельца, а общие canonical Values — у верхнего общего предка.",
})

export type CenteredNestedOwnerLayouts = OutsideInOwnerLayouts

export type CenteredNestedVisualScene = Readonly<{
  context: StateGraphViewportContext
  layout: StateGraphRootLayout
}>

export type CenteredNestedFieldBandKind =
  | "inner-private"
  | "root-private"
  | "shared"

export type CenteredNestedFieldPlacement = Readonly<{
  affinityOwnerDarkParticleId: number
  band: number
  bandKind: CenteredNestedFieldBandKind
  deepestOwnerDepth: number
  field: BulkFieldParticle
  fieldParticleIds: readonly string[]
  orbitIndex: number
  ownerDarkParticleIds: readonly number[]
  ownerDarkParticleId: number
  radius: number
  x: number
  y: number
  z: number
}>

type DarkNode = {
  children: DarkNode[]
  particle: BulkDarkParticle
}

type ComponentFieldLayout = Readonly<{
  entriesByOwner: ReadonlyMap<
    number,
    readonly ComponentFieldEntry[]
  >
  root: DarkNode
}>

type ComponentFieldEntry = Readonly<{
  affinityOwner: DarkNode
  band: number
  bandKind: CenteredNestedFieldBandKind
  deepestOwnerDepth: number
  field: BulkFieldParticle
  fieldParticleIds: readonly string[]
  owner: DarkNode
  owners: readonly DarkNode[]
}>

type ResolvedDarkTorus = Readonly<{
  children: readonly ResolvedDarkTorus[]
  form: TorusForm
  node: DarkNode
  states: readonly StatePlacement[]
}>

type ResolvedComponentTori = Readonly<{
  placements: readonly CenteredNestedFieldPlacement[]
  root: ResolvedDarkTorus
}>

const particleOrder = (
  left: BulkDarkParticle,
  right: BulkDarkParticle,
): number =>
  left.depth - right.depth ||
  left.darkParticleOrder - right.darkParticleOrder ||
  left.darkParticleId - right.darkParticleId

const buildDarkTrees = (
  manifest: BulkManifest,
): readonly DarkNode[] => {
  const particles = [...manifest.darkParticles].sort(particleOrder)
  const nodeById = new Map<number, DarkNode>()
  for (const particle of particles) {
    const node: DarkNode = {
      children: [],
      particle,
    }
    nodeById.set(particle.darkParticleId, node)
  }

  const roots: DarkNode[] = []
  for (const particle of particles) {
    const node = nodeById.get(particle.darkParticleId)!
    const parent = particle.parentDarkParticleId === null
      ? undefined
      : nodeById.get(particle.parentDarkParticleId)
    if (!parent) {
      roots.push(node)
      continue
    }
    parent.children.push(node)
  }

  const sortTree = (node: DarkNode): void => {
    node.children.sort((left, right) =>
      particleOrder(left.particle, right.particle)
    )
    for (const child of node.children) sortTree(child)
  }
  for (const root of roots) sortTree(root)
  return roots
}

const collectParticleIds = (
  root: DarkNode,
): ReadonlySet<number> => {
  const ids = new Set<number>()
  const visit = (node: DarkNode): void => {
    ids.add(node.particle.darkParticleId)
    node.children.forEach(visit)
  }
  visit(root)
  return ids
}

const indexMaximumSubtreeDepth = (
  node: DarkNode,
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

const fieldValueGroupKey = (
  field: BulkFieldParticle,
): string => field.valueId === null
  ? `field:${field.fieldParticleId}`
  : `value:${field.valueId}`

const fieldOrder = (
  left: BulkFieldParticle,
  right: BulkFieldParticle,
): number =>
  (left.valueId ?? Number.MAX_SAFE_INTEGER) -
    (right.valueId ?? Number.MAX_SAFE_INTEGER) ||
  left.parentDarkParticleId - right.parentDarkParticleId ||
  left.fieldId - right.fieldId ||
  left.fieldParticleId.localeCompare(right.fieldParticleId)

const highestCommonOwner = (
  fields: readonly BulkFieldParticle[],
  root: DarkNode,
  nodeById: ReadonlyMap<number, DarkNode>,
): DarkNode => {
  const ownerIds = [...new Set(fields.map((field) =>
    field.parentDarkParticleId
  ))]
  const paths = ownerIds.flatMap((ownerId) => {
    const owner = nodeById.get(ownerId)
    if (!owner) return []
    const path: DarkNode[] = []
    let cursor: DarkNode | undefined = owner
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
  manifest: BulkManifest,
  root: DarkNode,
  nodeById: ReadonlyMap<number, DarkNode>,
): ComponentFieldLayout => {
  const particleIds = collectParticleIds(root)
  const fields = manifest.fieldParticles.filter((field) =>
    particleIds.has(field.parentDarkParticleId)
  )
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
        particleOrder(left.particle, right.particle)
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
      particleOrder(
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
  deepestOwnerDepth: entry.deepestOwnerDepth,
  field: entry.field,
  fieldParticleIds: entry.fieldParticleIds,
  orbitIndex,
  ownerDarkParticleIds: entry.owners.map((owner) =>
    owner.particle.darkParticleId
  ),
  ownerDarkParticleId: entry.owner.particle.darkParticleId,
  radius,
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
  node: DarkNode,
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
  roots: readonly DarkNode[],
): readonly ComponentFieldLayout[] => {
  const nodeById = new Map<number, DarkNode>()
  const index = (node: DarkNode): void => {
    nodeById.set(node.particle.darkParticleId, node)
    node.children.forEach(index)
  }
  roots.forEach(index)
  return roots.map((root) =>
    placeComponentFields(manifest, root, nodeById)
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
  manifest: BulkManifest,
  component: ComponentFieldLayout,
  owners: readonly CenteredNestedOwnerLayouts[],
): ResolvedComponentTori => {
  const layoutsBySrc = new Map(
    owners.map(({atomSrc, layouts}) => [atomSrc, layouts] as const),
  )
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
    node: DarkNode,
    minimumCoreExtent: number,
  ): ResolvedComponentTori => {
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
      particleOrder(left.particle, right.particle)
    )
    const childLayouts = orderedChildren.map((child) => {
      const resolved = resolve(child, childOuterExtent)
      childOuterExtent = resolved.root.form.outerRadius
      return resolved
    })
    const preparedStates = (
      particle.src === null ? [] : layoutsBySrc.get(particle.src) ?? []
    )
      .map((layout) => prepareStateLayout(layout, markerRadius))
      .filter((layout): layout is PreparedStateLayout => layout !== null)
    const statePhase = sourceStatePhase(
      manifest,
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
    return {
      placements: [
        ...fieldLayout.placements,
        ...childLayouts.flatMap((child) => child.placements),
      ],
      root: {
        children: childLayouts.map((child) => child.root),
        form,
        node,
        states,
      },
    }
  }

  const resolved = resolve(component.root, 0)
  const center = component.root.particle
  return {
    placements: resolved.placements.map((placement) => ({
      ...placement,
      x: center.localX + placement.x,
      y: center.localY + placement.y,
      z: center.localZ + placement.z,
    })),
    root: resolved.root,
  }
}

export const layoutCenteredNestedFields = (
  manifest: BulkManifest,
  owners: readonly CenteredNestedOwnerLayouts[] = [],
): readonly CenteredNestedFieldPlacement[] => {
  const roots = buildDarkTrees(manifest)
  return buildComponentFieldLayouts(manifest, roots)
    .flatMap((component) =>
      resolveComponentTori(manifest, component, owners).placements
    )
}

export const buildCenteredNestedVisualScene = (
  manifest: BulkManifest,
  owners: readonly CenteredNestedOwnerLayouts[],
): CenteredNestedVisualScene => {
  const roots = buildDarkTrees(manifest)
  const components = buildComponentFieldLayouts(manifest, roots)
  const resolvedComponents = components.map((component) =>
    resolveComponentTori(manifest, component, owners)
  )
  const tori: StateGraphContextTorus[] = []
  const stateLayouts: StateGraphRootLayout[] = []
  const visit = (
    torus: ResolvedDarkTorus,
    center: Readonly<{x: number; y: number; z: number}>,
  ): void => {
    const particle = torus.node.particle
    tori.push({
      x: center.x,
      y: center.y,
      z: center.z,
      radius: torus.form.radius,
      tube: torus.form.tube,
      color: [
        particle.colorR,
        particle.colorG,
        particle.colorB,
      ],
    })
    for (const placement of torus.states) {
      stateLayouts.push(placeStateLayout(placement, {
        ...center,
        scale: torusLevelScale(particle.depth),
      }))
    }
    for (const child of torus.children) visit(child, center)
  }
  resolvedComponents.forEach((component) => {
    const particle = component.root.node.particle
    visit(
      component.root,
      {x: particle.localX, y: particle.localY, z: particle.localZ},
    )
  })

  const fields: StateGraphContextField[] = resolvedComponents.flatMap(
    (component) =>
    component.placements.map((placement) => ({
      x: placement.x,
      y: placement.y,
      z: placement.z,
      radius: placement.radius,
      color: [
        placement.field.colorR,
        placement.field.colorG,
        placement.field.colorB,
      ] as const,
    }))
  )

  return {
    context: {fields, tori},
    layout: mergeStateSleeves(stateLayouts),
  }
}
