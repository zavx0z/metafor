import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {
  StateGraphLayoutNode,
  StateGraphRootLayout,
} from "./StateGraphLayout.ts"
import type {
  StateGraphContextField,
  StateGraphContextTorus,
  StateGraphViewportContext,
} from "./StateGraphViewport.ts"
import {
  defineTorusComponent,
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

type WorldTransform = Readonly<{
  scale: number
  x: number
  y: number
  z: number
}>

type StateNodeOffset = Readonly<{
  node: StateGraphLayoutNode
  x: number
  y: number
  z: number
}>

type PreparedStateLayout = Readonly<{
  extent: number
  layout: StateGraphRootLayout
  offsets: readonly StateNodeOffset[]
  positionScale: number
  root: StateGraphLayoutNode
  tangentExtent: number
}>

type StatePlacement = Readonly<{
  angle: number
  orbitRadius: number
  prepared: PreparedStateLayout
}>

type DarkTorusPayload = Readonly<{
  markerRadius: number
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

const mergeStateSleeves = (
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

const fallbackMarkerRadius = (particle: DarkParticle): number =>
  Math.max(
    0.001,
    Math.min(particle.torusTube * 0.08, particle.torusRadius * 0.04),
  )

const ownerMarkerRadius = (
  manifest: BulkManifest,
  particle: DarkParticle,
  fields: readonly FieldParticle[],
): number => {
  const radii = [
    ...fields.map((field) => field.sphereRadius),
    ...(manifest.orbitalParticles ?? [])
      .filter((orbital) =>
        orbital.parentDarkParticleId === particle.darkParticleId &&
        orbital.orbitalParticleKind === "state"
      )
      .map((orbital) => orbital.sphereRadius),
  ].filter((radius) => Number.isFinite(radius) && radius > 0)
  return radii.length > 0
    ? Math.max(...radii)
    : fallbackMarkerRadius(particle)
}

const fieldNucleusExtent = (
  fields: readonly FieldParticle[],
  markerRadius: number,
): number => fields.length === 0
  ? markerRadius * 0.75
  : Math.max(...fields.map((field) =>
    Math.hypot(field.localX, field.localY, field.localZ) +
    field.sphereRadius
  ))

const minimumNodeDistance = (
  nodes: readonly StateGraphLayoutNode[],
): number => {
  let minimum = Number.POSITIVE_INFINITY
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const distance = Math.hypot(
        nodes[left]!.x - nodes[right]!.x,
        nodes[left]!.y - nodes[right]!.y,
        nodes[left]!.z - nodes[right]!.z,
      )
      if (distance > 1e-6) minimum = Math.min(minimum, distance)
    }
  }
  return minimum
}

const prepareStateLayout = (
  layout: StateGraphRootLayout,
  markerRadius: number,
): PreparedStateLayout | null => {
  const root = layout.nodes.find((node) => node.stateId === layout.rootStateId)
  if (!root) return null
  const radiusScale = markerRadius / Math.max(0.001, root.radius)
  const sourceDistance = minimumNodeDistance(layout.nodes)
  const positionScale = Number.isFinite(sourceDistance)
    ? Math.min(radiusScale, markerRadius * 2.6 / sourceDistance)
    : radiusScale
  const offsets = layout.nodes.map((node) => ({
    node,
    x: (node.x - root.x) * positionScale,
    y: (node.y - root.y) * positionScale,
    z: (node.z - root.z) * positionScale,
  }))
  return {
    extent: Math.max(
      markerRadius,
      ...offsets.map((offset) =>
        Math.hypot(offset.x, offset.y, offset.z) + markerRadius
      ),
    ),
    layout,
    offsets,
    positionScale,
    root,
    tangentExtent: Math.max(
      markerRadius,
      ...offsets.map((offset) => Math.abs(offset.y) + markerRadius),
    ),
  }
}

const sourceChildPhase = (
  children: readonly DarkTorus[],
): number => {
  const first = children[0]?.payload.particle
  if (!first || Math.hypot(first.localX, first.localY) <= 1e-6) return 0
  return Math.atan2(first.localY, first.localX)
}

const sourceStatePhase = (
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

const stateInnerOrbitRadius = (
  layouts: readonly PreparedStateLayout[],
  innerBoundary: number,
  markerRadius: number,
  gap: number,
): number => {
  const requiredInnerEdge = innerBoundary + gap + markerRadius
  return Math.max(
    requiredInnerEdge,
    ...layouts.flatMap((layout) =>
      layout.offsets.map((offset) => {
        if (Math.abs(offset.y) >= requiredInnerEdge) return 0
        return Math.sqrt(
          requiredInnerEdge ** 2 - offset.y ** 2,
        ) - offset.x
      })
    ),
  )
}

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
    const fields = fieldsByParent.get(particle.darkParticleId) ?? []
    const markerRadius = ownerMarkerRadius(manifest, particle, fields)
    const gap = Math.max(0.001, markerRadius * 0.75)
    const innerRadius =
      fieldNucleusExtent(fields, markerRadius) + gap
    const childTori = (childrenByParent.get(particle.darkParticleId) ?? [])
      .map(resolve)
    const maximumChildExtent = Math.max(
      0,
      ...childTori.map((child) =>
        child.form.outerRadius * child.payload.particle.torusScale
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
        scale: child.payload.particle.torusScale,
        x: Math.cos(angle) * matterOrbitRadius,
        y: Math.sin(angle) * matterOrbitRadius,
        z: 0,
      }
    })
    const matterOuterRadius = childTori.length === 0
      ? innerRadius
      : Math.max(...childTori.map((child) =>
        matterOrbitRadius +
          child.form.outerRadius * child.payload.particle.torusScale
      ))
    const preparedStates = (
      particle.src === null ? [] : layoutsBySrc.get(particle.src) ?? []
    )
      .map((layout) => prepareStateLayout(layout, markerRadius))
      .filter((layout): layout is PreparedStateLayout => layout !== null)
    const maximumStateTangentExtent = Math.max(
      markerRadius,
      ...preparedStates.map((layout) => layout.tangentExtent),
    )
    const stateOrbitRadius = preparedStates.length === 0
      ? 0
      : Math.max(
        stateInnerOrbitRadius(
          preparedStates,
          matterOuterRadius,
          markerRadius,
          gap,
        ),
        siblingOrbitRadius(
          preparedStates.length,
          maximumStateTangentExtent,
          gap,
        ),
      )
    const statePhase = sourceStatePhase(manifest, particle, preparedStates)
    const statePlacements = preparedStates.map((prepared, index) => ({
      angle: statePhase + index * Math.PI * 2 / preparedStates.length,
      orbitRadius: stateOrbitRadius,
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
          ) + markerRadius
        )
      ))
    const outerRadius = Math.max(
      innerRadius + markerRadius * 2,
      matterOuterRadius + gap,
      stateOuterRadius + gap,
    )
    const torus = defineTorusComponent({
      id: `${particle.darkParticleKind}:${particle.darkParticleId}`,
      role: particle.darkParticleKind,
      payload: {
        markerRadius,
        particle,
        states: statePlacements,
      },
      core: fields,
      innerRadius,
      outerRadius,
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

const placeStateLayout = (
  placement: StatePlacement,
  owner: DarkTorus,
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
        radius: owner.payload.markerRadius * transform.scale,
      }
    }),
    levels: placement.prepared.layout.levels.map((level) => {
      const x = (level.x - placement.prepared.root.x) *
        placement.prepared.positionScale
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
      stateLayouts.push(placeStateLayout(placement, torus, transform))
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
      scale: particle.torusScale,
    })
  }

  return {
    context: {tori, fields},
    layout: mergeStateSleeves(stateLayouts),
  }
}
