import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {
  type StateGraphLayoutNode,
  type StateGraphRootLayout,
} from "./StateGraphLayout.ts"
import {layoutFieldsInPseudoCircle} from "./FieldsLayout.ts"
import type {
  StateGraphContextField,
  StateGraphContextTorus,
  StateGraphViewportContext,
} from "./StateGraphViewport.ts"
import {
  TORUS_LAYOUT_BASELINE,
  defineTorusComponent,
  resolveContentTorusForm,
  type TorusComponent,
  type TorusPlacement,
} from "./Torus.ts"
import {defineVisualLayout} from "./internal/layout.ts"

export const OutsideIn = defineVisualLayout({
  slug: "outside-in",
  label: "Снаружи → внутрь",
  status: "in-progress",
  description:
    "Раскладка в работе: полный Monad snapshot от корневого Atom внутрь каждого рекурсивного Atom.",
})

type DarkParticle = BulkManifest["darkParticles"][number]
type FieldParticle = BulkManifest["fieldParticles"][number]

export type WorldTransform = Readonly<{
  scale: number
  x: number
  y: number
  z: number
}>

type StateNodeOffset = Readonly<{
  node: StateGraphLayoutNode
  radius: number
  x: number
  y: number
  z: number
}>

export type PreparedStateLayout = StateSleevePackingEnvelope & Readonly<{
  layout: StateGraphRootLayout
  levelOffsets: ReadonlyMap<number, number>
  offsets: readonly StateNodeOffset[]
  root: StateGraphLayoutNode
}>

export type StatePlacement = Readonly<{
  angle: number
  orbitRadius: number
  prepared: PreparedStateLayout
}>

type DarkTorusPayload = Readonly<{
  particle: DarkParticle
  states: readonly StatePlacement[]
}>

type DarkTorus = TorusComponent<DarkTorusPayload, FieldParticle>
type DarkTorusPlacement = TorusPlacement<DarkTorusPayload, FieldParticle>

export type OutsideInVisualScene = Readonly<{
  context: StateGraphViewportContext
  layout: StateGraphRootLayout
}>

export type OutsideInOwnerLayouts = Readonly<{
  atomSrc: string
  layouts: readonly StateGraphRootLayout[]
}>

export type StateSleevePackingEnvelope = Readonly<{
  disks: readonly StateSleevePackingDisk[]
  inwardExtent: number
}>

export type StateSleevePackingDisk = Readonly<{
  radius: number
  x: number
  y: number
}>

export type StateSleevePacking = Readonly<{
  angles: readonly number[]
  halfAngles: readonly number[]
  orbitRadius: number
}>

const finiteExtent = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0

const STATE_NODE_GAP_TO_FIELD_RADIUS = 2

export const stateNodeSurfaceGap = (fieldRadius: number): number =>
  fieldRadius * STATE_NODE_GAP_TO_FIELD_RADIUS

export const packStateSleeves = (
  sleeves: readonly StateSleevePackingEnvelope[],
  minimumOrbitRadius: number,
  gap: number,
  phase: number,
): StateSleevePacking => {
  if (sleeves.length === 0) {
    return {angles: [], halfAngles: [], orbitRadius: 0}
  }
  const safeMinimumOrbit = finiteExtent(minimumOrbitRadius)
  if (sleeves.length === 1) {
    return {
      angles: [Number.isFinite(phase) ? phase : 0],
      halfAngles: [Math.PI],
      orbitRadius: safeMinimumOrbit,
    }
  }

  const safeGap = finiteExtent(gap)
  let baselineOrbitRadius = safeMinimumOrbit
  for (const sleeve of sleeves) {
    baselineOrbitRadius = Math.max(
      baselineOrbitRadius,
      finiteExtent(sleeve.inwardExtent) + safeGap * 0.5 + 1e-6,
    )
  }

  const angularDemandsAt = (
    orbitRadius: number,
  ): Readonly<{demands: readonly number[]; sum: number}> => {
    const demands = new Array<number>(sleeves.length)
    let sum = 0
    for (let index = 0; index < sleeves.length; index += 1) {
      let demand = 0
      for (const disk of sleeves[index]!.disks) {
        const inflatedRadius = finiteExtent(disk.radius) + safeGap * 0.5
        const x = Number.isFinite(disk.x) ? disk.x : 0
        const y = Number.isFinite(disk.y) ? disk.y : 0
        const centerX = orbitRadius + x
        const centerDistance = Math.hypot(centerX, y)
        demand = Math.max(
          demand,
          Math.abs(Math.atan2(y, centerX)) +
            Math.asin(Math.min(1, inflatedRadius / centerDistance)),
        )
      }
      demands[index] = Math.max(demand, 1e-6)
      sum += demands[index]!
    }
    return {demands, sum}
  }

  const baselineDemands = angularDemandsAt(baselineOrbitRadius)
  let halfAngles = baselineDemands.demands.map((demand) =>
    baselineDemands.sum <= Math.PI
      ? demand + (Math.PI - baselineDemands.sum) / sleeves.length
      : demand * Math.PI / baselineDemands.sum
  )
  let orbitRadius = baselineOrbitRadius
  if (baselineDemands.sum > Math.PI) {
    for (let index = 0; index < sleeves.length; index += 1) {
      const sine = Math.sin(halfAngles[index]!)
      const cosine = Math.cos(halfAngles[index]!)
      for (const disk of sleeves[index]!.disks) {
        const inflatedRadius = finiteExtent(disk.radius) + safeGap * 0.5
        orbitRadius = Math.max(
          orbitRadius,
          (
            inflatedRadius +
            Math.abs(Number.isFinite(disk.y) ? disk.y : 0) * cosine
          ) / sine -
            (Number.isFinite(disk.x) ? disk.x : 0),
        )
      }
    }
    const candidateOrbitRadius =
      (baselineOrbitRadius + orbitRadius) * 0.5
    const candidateDemands = angularDemandsAt(candidateOrbitRadius)
    if (candidateDemands.sum <= Math.PI) {
      orbitRadius = candidateOrbitRadius
      halfAngles = candidateDemands.demands.map((demand) =>
        demand + (Math.PI - candidateDemands.sum) / sleeves.length
      )
    }
  }

  const startAngle = Number.isFinite(phase) ? phase : 0
  const angles = new Array<number>(sleeves.length)
  angles[0] = startAngle
  for (let index = 1; index < sleeves.length; index += 1) {
    angles[index] =
      angles[index - 1]! +
      halfAngles[index - 1]! +
      halfAngles[index]!
  }
  return {angles, halfAngles, orbitRadius}
}

export const mergeStateSleeves = (
  layouts: readonly StateGraphRootLayout[],
): StateGraphRootLayout => ({
  rootStateId: layouts[0]?.rootStateId ?? 0,
  levels: layouts.flatMap((layout) => layout.levels),
  nodes: layouts.flatMap((layout) => layout.nodes),
  edges: layouts.flatMap((layout) => layout.edges),
})

const particleOrder = (
  left: DarkParticle,
  right: DarkParticle,
): number =>
  left.depth - right.depth ||
  left.darkParticleOrder - right.darkParticleOrder ||
  left.darkParticleId - right.darkParticleId

const fieldNucleusExtent = (
  fields: readonly FieldParticle[],
): number => fields.length === 0
  ? 0
  : Math.max(...fields.map((field) =>
    Math.hypot(field.localX, field.localY, field.localZ) +
      field.sphereRadius
  ))

const placeFieldsInPseudoCircle = (
  fields: readonly FieldParticle[],
  markerRadius: number,
): readonly FieldParticle[] => {
  const layout = layoutFieldsInPseudoCircle(
    fields.length,
    markerRadius,
  )
  return fields.map((field, index) => ({
    ...field,
    localX: layout.points[index]?.x ?? 0,
    localY: layout.points[index]?.y ?? 0,
    localZ: layout.points[index]?.z ?? 0,
    sphereRadius: markerRadius,
  }))
}

const sourceChildPhase = (
  children: readonly DarkTorus[],
): number => {
  const first = children[0]?.payload.particle
  if (!first || Math.hypot(first.localX, first.localY) <= 1e-6) return 0
  return Math.atan2(first.localY, first.localX)
}

export const sourceStatePhase = (
  manifest: BulkManifest,
  particle: DarkParticle,
  layouts: readonly PreparedStateLayout[],
): number => {
  const firstRootStateId = layouts[0]?.layout.rootStateId
  if (firstRootStateId === undefined) return 0
  const orbital = manifest.orbitalParticles?.find((candidate) =>
    candidate.parentDarkParticleId === particle.darkParticleId &&
    candidate.orbitalParticleKind === "state" &&
    candidate.sleeveRootStateId === firstRootStateId &&
    candidate.sourceId === firstRootStateId &&
    candidate.orbitalParticleId.endsWith("/root")
  )
  return orbital && Math.hypot(orbital.localX, orbital.localY) > 1e-6
    ? Math.atan2(orbital.localY, orbital.localX)
    : 0
}

const siblingOrbitRadius = (
  count: number,
  maximumExtent: number,
  gap: number,
): number => count <= 1
  ? 0
  : (maximumExtent + gap * 0.5) / Math.sin(Math.PI / count)

export const prepareStateLayout = (
  layout: StateGraphRootLayout,
): PreparedStateLayout | null => {
  const root = layout.nodes.find(
    (node) => node.stateId === layout.rootStateId,
  )
  if (!root) return null
  const offsets = layout.nodes.map((node) => ({
    node,
    radius: node.radius,
    x: node.x - root.x,
    y: node.y - root.y,
    z: node.z - root.z,
  }))
  return {
    disks: offsets,
    inwardExtent: Math.max(
      root.radius,
      ...offsets.map((offset) =>
        offset.node.radius - offset.x
      ),
    ),
    layout,
    levelOffsets: new Map(layout.levels.map((level) => [
      level.step,
      level.x - root.x,
    ])),
    offsets,
    root,
  }
}

export const stateInnerOrbitRadius = (
  layouts: readonly PreparedStateLayout[],
  innerBoundary: number,
  gap: number,
): number => Math.max(
  innerBoundary + gap,
  ...layouts.flatMap((layout) =>
    layout.offsets.map((offset) => {
      const requiredInnerEdge =
        innerBoundary + gap + offset.node.radius
      if (Math.abs(offset.y) >= requiredInnerEdge) return 0
      return Math.sqrt(
        requiredInnerEdge ** 2 - offset.y ** 2,
      ) - offset.x
    })
  ),
)

const buildDarkParticleTori = (
  manifest: BulkManifest,
  owners: readonly OutsideInOwnerLayouts[],
): readonly DarkTorus[] => {
  const particles = manifest.darkParticles
    .sort(particleOrder)
  const particleIds = new Set(
    particles.map((particle) => particle.darkParticleId),
  )
  const childrenByParent = new Map<number, DarkParticle[]>()
  for (const particle of particles) {
    if (
      particle.parentDarkParticleId === null ||
      !particleIds.has(particle.parentDarkParticleId)
    ) continue
    const children = childrenByParent.get(particle.parentDarkParticleId)
    if (children) children.push(particle)
    else childrenByParent.set(particle.parentDarkParticleId, [particle])
  }
  for (const children of childrenByParent.values()) children.sort(particleOrder)
  const fieldsByParent = new Map<number, FieldParticle[]>()
  for (const field of manifest.fieldParticles) {
    const fields = fieldsByParent.get(field.parentDarkParticleId)
    if (fields) fields.push(field)
    else fieldsByParent.set(field.parentDarkParticleId, [field])
  }
  const layoutsBySrc = new Map(
    owners.map(({atomSrc, layouts}) => [atomSrc, layouts] as const),
  )
  const resolved = new Map<number, DarkTorus>()

  const resolve = (particle: DarkParticle): DarkTorus => {
    const cached = resolved.get(particle.darkParticleId)
    if (cached) return cached
    const sourceFields = fieldsByParent.get(particle.darkParticleId) ?? []
    const markerRadius = TORUS_LAYOUT_BASELINE.rootFieldRadius
    const fields = placeFieldsInPseudoCircle(sourceFields, markerRadius)
    const gap = Math.max(
      0.001,
      markerRadius * TORUS_LAYOUT_BASELINE.contentGapToFieldRadius,
    )
    const coreExtent = fieldNucleusExtent(fields)
    const coreForm = resolveContentTorusForm({
      emptyOuterRadius: TORUS_LAYOUT_BASELINE.rootOuterRadius,
      coreExtent,
      gap,
    })
    const innerRadius = coreForm.innerRadius
    const childTori = (childrenByParent.get(particle.darkParticleId) ?? [])
      .map(resolve)
    const maximumChildExtent = Math.max(
      0,
      ...childTori.map((child) =>
        child.form.outerRadius * TORUS_LAYOUT_BASELINE.levelScale
      ),
    )
    const matterOrbitRadius = childTori.length === 0
      ? 0
      : Math.max(
        innerRadius + gap + maximumChildExtent,
        siblingOrbitRadius(
          childTori.length,
          maximumChildExtent,
          gap,
        ),
      )
    const childPhase = sourceChildPhase(childTori)
    const childPlacements: DarkTorusPlacement[] = childTori.map((child, index) => {
      const angle = childPhase + index * Math.PI * 2 / childTori.length
      return {
        torus: child,
        scale: TORUS_LAYOUT_BASELINE.levelScale,
        x: Math.cos(angle) * matterOrbitRadius,
        y: Math.sin(angle) * matterOrbitRadius,
        z: 0,
      }
    })
    const matterOuterRadius = childTori.length === 0
      ? innerRadius
      : Math.max(...childTori.map((child) =>
        matterOrbitRadius +
          child.form.outerRadius * TORUS_LAYOUT_BASELINE.levelScale
      ))
    const preparedStates = (
      particle.src === null ? [] : layoutsBySrc.get(particle.src) ?? []
    )
      .map(prepareStateLayout)
      .filter((layout): layout is PreparedStateLayout => layout !== null)
    const statePhase = sourceStatePhase(manifest, particle, preparedStates)
    const statePacking = packStateSleeves(
      preparedStates,
      preparedStates.length === 0
        ? 0
        : stateInnerOrbitRadius(
          preparedStates,
          matterOuterRadius,
          gap,
        ),
      stateNodeSurfaceGap(markerRadius),
      statePhase,
    )
    const statePlacements = preparedStates.map((prepared, index) => ({
      angle: statePacking.angles[index] ?? statePhase,
      orbitRadius: statePacking.orbitRadius,
      prepared,
    }))
    const stateOuterRadius = statePlacements.length === 0
      ? matterOuterRadius
      : Math.max(...statePlacements.flatMap(({orbitRadius, prepared}) =>
        prepared.offsets.map((offset) =>
          Math.hypot(
            orbitRadius + offset.x,
            offset.y,
            offset.z,
          ) + offset.node.radius
        )
      ))
    const form = resolveContentTorusForm({
      emptyOuterRadius: TORUS_LAYOUT_BASELINE.rootOuterRadius,
      coreExtent,
      gap,
      occupiedOuterExtent: Math.max(matterOuterRadius, stateOuterRadius),
    })
    const torus = defineTorusComponent({
      id: `${particle.darkParticleKind}:${particle.darkParticleId}`,
      role: particle.darkParticleKind,
      payload: {
        particle,
        states: statePlacements,
      },
      core: fields,
      innerRadius: form.innerRadius,
      outerRadius: form.outerRadius,
      children: childPlacements,
    })
    resolved.set(particle.darkParticleId, torus)
    return torus
  }

  return particles
    .filter((particle) =>
      particle.parentDarkParticleId === null ||
      !particleIds.has(particle.parentDarkParticleId)
    )
    .map(resolve)
}

const worldPoint = (
  transform: WorldTransform,
  x: number,
  y: number,
  z: number,
): Readonly<{x: number; y: number; z: number}> => ({
  x: transform.x + x * transform.scale,
  y: transform.y + y * transform.scale,
  z: transform.z + z * transform.scale,
})

export const placeStateLayout = (
  placement: StatePlacement,
  transform: WorldTransform,
): StateGraphRootLayout => {
  const radialX = Math.cos(placement.angle)
  const radialY = Math.sin(placement.angle)
  const tangentX = -radialY
  const tangentY = radialX
  const localPoint = (
    x: number,
    y: number,
    z: number,
  ): Readonly<{x: number; y: number; z: number}> => worldPoint(
    transform,
    radialX * (placement.orbitRadius + x) + tangentX * y,
    radialY * (placement.orbitRadius + x) + tangentY * y,
    z,
  )
  const offsets = new Map(
    placement.prepared.offsets.map((offset) => [
      offset.node.id,
      offset,
    ] as const),
  )

  return {
    ...placement.prepared.layout,
    nodes: placement.prepared.layout.nodes.map((node) => {
      const offset = offsets.get(node.id) ?? {x: 0, y: 0, z: 0}
      return {
        ...node,
        ...localPoint(offset.x, offset.y, offset.z),
        fieldRadius: node.fieldRadius * transform.scale,
        innerRadius: node.innerRadius * transform.scale,
        radius: node.radius * transform.scale,
      }
    }),
    levels: placement.prepared.layout.levels.map((level) => {
      const x = placement.prepared.levelOffsets.get(level.step) ?? 0
      return {
        ...level,
        x: localPoint(x, 0, 0).x,
      }
    }),
  }
}

export const buildOutsideInVisualScene = (
  manifest: BulkManifest,
  owners: readonly OutsideInOwnerLayouts[],
): OutsideInVisualScene => {
  const tori: StateGraphContextTorus[] = []
  const fields: StateGraphContextField[] = []
  const stateLayouts: StateGraphRootLayout[] = []
  const visit = (
    torus: DarkTorus,
    transform: WorldTransform,
  ): void => {
    tori.push({
      x: transform.x,
      y: transform.y,
      z: transform.z,
      radius: torus.form.radius * transform.scale,
      tube: torus.form.tube * transform.scale,
      color: [
        torus.payload.particle.colorR,
        torus.payload.particle.colorG,
        torus.payload.particle.colorB,
      ],
    })
    for (const field of torus.core) {
      fields.push({
        ...worldPoint(
          transform,
          field.localX,
          field.localY,
          field.localZ,
        ),
        radius: field.sphereRadius * transform.scale,
        color: [field.colorR, field.colorG, field.colorB],
      })
    }
    for (const placement of torus.payload.states) {
      stateLayouts.push(placeStateLayout(placement, transform))
    }
    for (const child of torus.children) {
      const point = worldPoint(transform, child.x, child.y, child.z)
      visit(child.torus, {
        ...point,
        scale: transform.scale * child.scale,
      })
    }
  }

  for (const root of buildDarkParticleTori(manifest, owners)) {
    const particle = root.payload.particle
    visit(root, {
      x: particle.localX,
      y: particle.localY,
      z: particle.localZ,
      scale: 1,
    })
  }

  return {
    context: {tori, fields},
    layout: mergeStateSleeves(stateLayouts),
  }
}
