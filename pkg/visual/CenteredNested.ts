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
    "Общий центр вложенных Torus: частные Fields остаются в ядре, а общие canonical Values занимают последовательные Matter-орбиты.",
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
  band: number
  bandKind: CenteredNestedFieldBandKind
  field: BulkFieldParticle
  fieldParticleIds: readonly string[]
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
  fieldExtentByParticle: ReadonlyMap<number, number>
  placements: readonly CenteredNestedFieldPlacement[]
  root: DarkNode
}>

type ComponentFieldEntry = Readonly<{
  band: number
  field: BulkFieldParticle
  fieldParticleIds: readonly string[]
  owner: DarkNode
}>

type ResolvedDarkTorus = Readonly<{
  children: readonly ResolvedDarkTorus[]
  form: TorusForm
  node: DarkNode
  states: readonly StatePlacement[]
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

const fieldBandKind = (
  band: number,
): CenteredNestedFieldBandKind =>
  band === 0
    ? "root-private"
    : band % 2 === 1
      ? "shared"
      : "inner-private"

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
    const ownerIds = new Set(group.map((field) =>
      field.parentDarkParticleId
    ))
    const shared = ownerIds.size > 1 && group[0]?.valueId !== null
    if (shared) {
      const owner = highestCommonOwner(group, root, nodeById)
      const ownerDepth = Math.max(
        0,
        owner.particle.depth - rootDepth,
      )
      visualEntries.push({
        band: ownerDepth * 2 + 1,
        field: group.find((field) =>
          field.parentDarkParticleId === owner.particle.darkParticleId
        ) ?? group[0]!,
        fieldParticleIds: group.map((field) => field.fieldParticleId),
        owner,
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
        band: ownerDepth === 0 ? 0 : ownerDepth * 2,
        field,
        fieldParticleIds: [field.fieldParticleId],
        owner,
      })
    }
  }

  const fieldsByBand = new Map<number, ComponentFieldEntry[]>()
  for (const entry of visualEntries) {
    const entries = fieldsByBand.get(entry.band)
    if (entries) entries.push(entry)
    else fieldsByBand.set(entry.band, [entry])
  }
  for (const entries of fieldsByBand.values()) {
    entries.sort((left, right) =>
      fieldOrder(left.field, right.field)
    )
  }

  const localPlacements: CenteredNestedFieldPlacement[] = []
  let occupiedOuterBoundary = 0
  const bands = [...fieldsByBand.keys()].sort((left, right) => left - right)
  for (const band of bands) {
    const entries = fieldsByBand.get(band) ?? []
    const radii = entries.map((entry) =>
      torusFieldRadiusAtLevel(
        entry.owner.particle.depth,
      )
    )
    if (band === 0) {
      const markerRadius = Math.max(0, ...radii)
      const layout = layoutFieldsInPseudoCircle(
        entries.length,
        markerRadius,
      )
      entries.forEach((entry, index) => {
        const point = layout.points[index] ?? {x: 0, y: 0, z: 0}
        const radius = radii[index] ?? markerRadius
        localPlacements.push({
          band,
          bandKind: fieldBandKind(band),
          field: entry.field,
          fieldParticleIds: entry.fieldParticleIds,
          ownerDarkParticleId: entry.owner.particle.darkParticleId,
          radius,
          x: point.x,
          y: point.y,
          z: point.z,
        })
        occupiedOuterBoundary = Math.max(
          occupiedOuterBoundary,
          Math.hypot(point.x, point.y, point.z) + radius,
        )
      })
      continue
    }

    const orbitLevel = rootDepth + Math.floor(band / 2)
    const orbitGap = torusFieldRadiusAtLevel(orbitLevel) * 2
    const maximumRadius = Math.max(0, ...radii)
    let orbitRadius = occupiedOuterBoundary + orbitGap + maximumRadius
    if (entries.length > 1) {
      const slotHalfAngle = Math.PI / entries.length
      const slotSin = Math.max(1e-9, Math.sin(slotHalfAngle))
      for (let index = 0; index < entries.length; index += 1) {
        const next = (index + 1) % entries.length
        orbitRadius = Math.max(
          orbitRadius,
          ((radii[index] ?? 0) + (radii[next] ?? 0)) /
            (2 * slotSin),
        )
      }
    }
    const phase = stablePhase(
      `${root.particle.darkParticleId}:${band}`,
    )
    entries.forEach((entry, index) => {
      const angle = phase + index * Math.PI * 2 / entries.length
      const radius = radii[index] ?? maximumRadius
      localPlacements.push({
        band,
        bandKind: fieldBandKind(band),
        field: entry.field,
        fieldParticleIds: entry.fieldParticleIds,
        ownerDarkParticleId: entry.owner.particle.darkParticleId,
        radius,
        x: Math.cos(angle) * orbitRadius,
        y: Math.sin(angle) * orbitRadius,
        z: 0,
      })
      occupiedOuterBoundary = Math.max(
        occupiedOuterBoundary,
        orbitRadius + radius,
      )
    })
  }

  const fieldExtentByParticle = new Map<number, number>()
  const initializeFieldExtent = (node: DarkNode): void => {
    fieldExtentByParticle.set(node.particle.darkParticleId, 0)
    node.children.forEach(initializeFieldExtent)
  }
  initializeFieldExtent(root)
  for (const placement of localPlacements) {
    fieldExtentByParticle.set(
      placement.ownerDarkParticleId,
      Math.max(
        fieldExtentByParticle.get(placement.ownerDarkParticleId) ?? 0,
        Math.hypot(placement.x, placement.y, placement.z) +
          placement.radius,
      ),
    )
  }

  const center = root.particle
  return {
    fieldExtentByParticle,
    placements: localPlacements.map((placement) => ({
      ...placement,
      x: center.localX + placement.x,
      y: center.localY + placement.y,
      z: center.localZ + placement.z,
    })),
    root,
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

export const layoutCenteredNestedFields = (
  manifest: BulkManifest,
): readonly CenteredNestedFieldPlacement[] => {
  const roots = buildDarkTrees(manifest)
  return buildComponentFieldLayouts(manifest, roots)
    .flatMap((component) => component.placements)
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
): ResolvedDarkTorus => {
  const layoutsBySrc = new Map(
    owners.map(({atomSrc, layouts}) => [atomSrc, layouts] as const),
  )
  const markerRadius = TORUS_LAYOUT_BASELINE.rootFieldRadius
  const localGap =
    markerRadius * TORUS_LAYOUT_BASELINE.contentGapToFieldRadius

  const resolve = (
    node: DarkNode,
    minimumCoreExtent: number,
  ): ResolvedDarkTorus => {
    const particle = node.particle
    const scale = torusLevelScale(particle.depth)
    const coreExtent = Math.max(
      minimumCoreExtent,
      component.fieldExtentByParticle.get(particle.darkParticleId) ?? 0,
    )
    const gap = localGap * scale
    const emptyOuterRadius =
      TORUS_LAYOUT_BASELINE.rootOuterRadius * scale
    const coreForm = resolveContentTorusForm({
      coreExtent,
      emptyOuterRadius,
      gap,
    })
    let childOuterExtent = coreForm.innerRadius
    const children = node.children.map((child) => {
      const resolved = resolve(child, childOuterExtent)
      childOuterExtent = resolved.form.outerRadius
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
      children,
      form,
      node,
      states,
    }
  }

  return resolve(component.root, 0)
}

export const buildCenteredNestedVisualScene = (
  manifest: BulkManifest,
  owners: readonly CenteredNestedOwnerLayouts[],
): CenteredNestedVisualScene => {
  const roots = buildDarkTrees(manifest)
  const components = buildComponentFieldLayouts(manifest, roots)
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
  components.forEach((component) => {
    const particle = component.root.particle
    visit(
      resolveComponentTori(manifest, component, owners),
      {x: particle.localX, y: particle.localY, z: particle.localZ},
    )
  })

  const fields: StateGraphContextField[] = components.flatMap((component) =>
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
