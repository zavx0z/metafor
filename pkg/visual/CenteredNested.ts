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
  extentByParticle: ReadonlyMap<number, number>
  placements: readonly CenteredNestedFieldPlacement[]
  root: DarkNode
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
  const fieldsByOwner = new Map<number, BulkFieldParticle[]>()
  for (const field of fields) {
    const key = fieldValueGroupKey(field)
    const group = groups.get(key)
    if (group) group.push(field)
    else groups.set(key, [field])
    const owned = fieldsByOwner.get(field.parentDarkParticleId)
    if (owned) owned.push(field)
    else fieldsByOwner.set(field.parentDarkParticleId, [field])
  }

  const rootDepth = root.particle.depth
  const bandByFieldId = new Map<string, number>()
  for (const group of groups.values()) {
    const ownerIds = new Set(group.map((field) =>
      field.parentDarkParticleId
    ))
    const ownerDepths = [...ownerIds].map((ownerId) =>
      Math.max(
        0,
        (nodeById.get(ownerId)?.particle.depth ?? rootDepth) - rootDepth,
      )
    )
    const shared = ownerIds.size > 1 && group[0]?.valueId !== null
    const band = shared
      ? Math.min(...ownerDepths) * 2 + 1
      : ownerDepths[0] === 0
        ? 0
        : ownerDepths[0]! * 2
    for (const field of group) bandByFieldId.set(field.fieldParticleId, band)
  }

  const fieldsByBand = new Map<number, BulkFieldParticle[]>()
  for (const field of fields) {
    const band = bandByFieldId.get(field.fieldParticleId) ?? 0
    const entries = fieldsByBand.get(band)
    if (entries) entries.push(field)
    else fieldsByBand.set(band, [field])
  }
  for (const entries of fieldsByBand.values()) {
    entries.sort((left, right) =>
      (left.valueId ?? Number.MAX_SAFE_INTEGER) -
        (right.valueId ?? Number.MAX_SAFE_INTEGER) ||
      left.parentDarkParticleId - right.parentDarkParticleId ||
      left.fieldId - right.fieldId ||
      left.fieldParticleId.localeCompare(right.fieldParticleId)
    )
  }

  const localPlacements = new Map<string, CenteredNestedFieldPlacement>()
  let occupiedOuterBoundary = 0
  const bands = [...fieldsByBand.keys()].sort((left, right) => left - right)
  for (const band of bands) {
    const entries = fieldsByBand.get(band) ?? []
    const radii = entries.map((field) =>
      torusFieldRadiusAtLevel(
        nodeById.get(field.parentDarkParticleId)?.particle.depth ?? rootDepth,
      )
    )
    if (band === 0) {
      const markerRadius = Math.max(0, ...radii)
      const layout = layoutFieldsInPseudoCircle(
        entries.length,
        markerRadius,
      )
      entries.forEach((field, index) => {
        const point = layout.points[index] ?? {x: 0, y: 0, z: 0}
        const radius = radii[index] ?? markerRadius
        localPlacements.set(field.fieldParticleId, {
          band,
          bandKind: fieldBandKind(band),
          field,
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
    entries.forEach((field, index) => {
      const angle = phase + index * Math.PI * 2 / entries.length
      const radius = radii[index] ?? maximumRadius
      localPlacements.set(field.fieldParticleId, {
        band,
        bandKind: fieldBandKind(band),
        field,
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

  const extentByParticle = new Map<number, number>()
  const resolveExtent = (node: DarkNode): number => {
    let extent = 0
    for (
      const field of fieldsByOwner.get(
        node.particle.darkParticleId,
      ) ?? []
    ) {
      const placement = localPlacements.get(field.fieldParticleId)
      if (!placement) continue
      extent = Math.max(
        extent,
        Math.hypot(placement.x, placement.y, placement.z) +
          placement.radius,
      )
    }
    for (const child of node.children) {
      extent = Math.max(extent, resolveExtent(child))
    }
    extentByParticle.set(node.particle.darkParticleId, extent)
    return extent
  }
  resolveExtent(root)

  const center = root.particle
  return {
    extentByParticle,
    placements: fields.flatMap((field) => {
      const placement = localPlacements.get(field.fieldParticleId)
      return placement
        ? [{
          ...placement,
          x: center.localX + placement.x,
          y: center.localY + placement.y,
          z: center.localZ + placement.z,
        }]
        : []
    }),
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
    let childOuterExtent = 0
    const children = node.children.map((child) => {
      const resolved = resolve(child, childOuterExtent)
      childOuterExtent = resolved.form.outerRadius
      return resolved
    })
    const particle = node.particle
    const scale = torusLevelScale(particle.depth)
    const coreExtent = Math.max(
      minimumCoreExtent,
      component.extentByParticle.get(particle.darkParticleId) ?? 0,
      childOuterExtent,
    )
    const gap = localGap * scale
    const emptyOuterRadius =
      TORUS_LAYOUT_BASELINE.rootOuterRadius * scale
    const coreForm = resolveContentTorusForm({
      coreExtent,
      emptyOuterRadius,
      gap,
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
          coreForm.innerRadius / scale,
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
    const form = resolveContentTorusForm({
      coreExtent,
      emptyOuterRadius,
      gap,
      occupiedOuterExtent: stateOuterExtent(states) * scale,
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
  const fieldPlacementById = new Map(
    components
      .flatMap((component) => component.placements)
      .map((placement) => [
        placement.field.fieldParticleId,
        placement,
      ] as const),
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
  components.forEach((component) => {
    const particle = component.root.particle
    visit(
      resolveComponentTori(manifest, component, owners),
      {x: particle.localX, y: particle.localY, z: particle.localZ},
    )
  })

  const fields: StateGraphContextField[] = manifest.fieldParticles.flatMap(
    (field) => {
      const placement = fieldPlacementById.get(field.fieldParticleId)
      return placement
        ? [{
          x: placement.x,
          y: placement.y,
          z: placement.z,
          radius: placement.radius,
          color: [
            field.colorR,
            field.colorG,
            field.colorB,
          ] as const,
        }]
        : []
    },
  )

  return {
    context: {fields, tori},
    layout: mergeStateSleeves(stateLayouts),
  }
}
