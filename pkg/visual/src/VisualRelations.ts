import type {
  BulkManifest,
  BulkRelationChannel,
} from "@metafor/types/bulk/manifest"
import {
  describeHermiteEdgeCurve,
  sampleHermiteEdgeCurve,
  type HermiteEdgeCurve,
} from "./HermiteEdge.ts"
import {
  visualRelationColor,
  visualRelationHasSceneGeometry,
} from "./SemanticVisual.ts"
import type {
  VisualFieldPlacement,
  VisualFieldProxyPlacement,
  VisualOrbitalPlacement,
} from "./internal/layout.ts"
import {
  visualRelationMaterial,
  type VisualLineMaterial,
} from "./VisualMaterialSpec.ts"

type Point = Readonly<{x: number; y: number; z: number}>

type Endpoint = Readonly<{
  point: Point
}>

export type VisualRelationEdgePlacement = Readonly<{
  curves: readonly [HermiteEdgeCurve, HermiteEdgeCurve]
  material: VisualLineMaterial
  ownerDarkParticleId: number
  path: readonly Point[]
  relationChannelId: string
}>

const hermiteRelationCurves = (
  from: Point,
  to: Point,
): readonly [HermiteEdgeCurve, HermiteEdgeCurve] => Object.freeze([
  describeHermiteEdgeCurve({
    from,
    leftOuterRadius: 1,
    rightOuterRadius: 1,
    side: 1,
    to,
  }),
  describeHermiteEdgeCurve({
    from: to,
    leftOuterRadius: 1,
    rightOuterRadius: 1,
    side: -1,
    to: from,
  }),
])

const sampleHermiteRelationCurves = (
  curves: readonly [HermiteEdgeCurve, HermiteEdgeCurve],
): readonly Point[] => {
  const upper = sampleHermiteEdgeCurve(curves[0])
  const lower = sampleHermiteEdgeCurve(curves[1])
  return Object.freeze([...upper, ...lower.slice(1)])
}

const uniqueIndex = <Value>(
  values: readonly Value[],
  key: (value: Value) => string,
  label: string,
): ReadonlyMap<string, Value> => {
  const index = new Map<string, Value>()
  for (const value of values) {
    const id = key(value)
    if (index.has(id)) {
      throw new Error(`Visual relation ${label} ${id} is duplicated`)
    }
    index.set(id, value)
  }
  return index
}

const rootIndex = (
  manifest: BulkManifest,
): ReadonlyMap<number, number> => {
  const particleById = new Map(manifest.darkParticles.map((particle) =>
    [particle.darkParticleId, particle] as const
  ))
  const rootById = new Map<number, number>()
  const visiting = new Set<number>()
  const resolve = (id: number): number => {
    const cached = rootById.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) {
      throw new Error(`Visual relation Dark parent cycle at ${id}`)
    }
    const particle = particleById.get(id)
    if (!particle) {
      throw new Error(`Visual relation Dark particle ${id} is absent`)
    }
    visiting.add(id)
    const root = particle.parentDarkParticleId === null
      ? id
      : resolve(particle.parentDarkParticleId)
    visiting.delete(id)
    rootById.set(id, root)
    return root
  }
  manifest.darkParticles.forEach((particle) =>
    resolve(particle.darkParticleId)
  )
  return rootById
}

/**
 * Resolves the complete sampled relation geometry inside the package. The
 * consumer receives identity, material and points and never chooses a curve.
 */
export const buildVisualRelationEdges = (
  manifest: BulkManifest,
  visual: Readonly<{
    fields: readonly VisualFieldPlacement[]
    fieldProxies: readonly VisualFieldProxyPlacement[]
    orbitals: readonly VisualOrbitalPlacement[]
  }>,
): readonly VisualRelationEdgePlacement[] => {
  const fieldByOccurrenceId = new Map<string, VisualFieldPlacement>()
  for (const field of visual.fields) {
    for (const occurrenceId of field.fieldParticleIds) {
      if (fieldByOccurrenceId.has(occurrenceId)) {
        throw new Error(
          `Visual relation Field occurrence ${occurrenceId} is duplicated`,
        )
      }
      fieldByOccurrenceId.set(occurrenceId, field)
    }
  }
  const orbitalById = uniqueIndex(
    visual.orbitals,
    (orbital) => orbital.orbitalParticleId,
    "orbital",
  )
  const proxyById = uniqueIndex(
    visual.fieldProxies,
    (proxy) => proxy.fieldProxyId,
    "Field proxy",
  )
  const manifestedOrbitalById = new Map(
    (manifest.orbitalParticles ?? []).map((particle) =>
      [particle.orbitalParticleId, particle] as const
    ),
  )
  const stateBranchActiveById = new Map(
    (manifest.orbitalParticles ?? []).flatMap((particle) =>
      particle.orbitalParticleKind === "state"
        ? [[particle.orbitalParticleId, particle.active] as const]
        : []
    ),
  )
  const rootByOwner = rootIndex(manifest)
  const endpoint = (
    kind: BulkRelationChannel["fromKind"],
    id: string,
  ): Readonly<{endpoint: Endpoint; ownerDarkParticleId: number}> | null => {
    if (kind === "field") {
      const field = fieldByOccurrenceId.get(id)
      return field
        ? {
            endpoint: {
              point: {x: field.x, y: field.y, z: field.z},
            },
            ownerDarkParticleId: field.ownerDarkParticleId,
          }
        : null
    }
    if (kind === "field-proxy") {
      const proxy = proxyById.get(id)
      return proxy
        ? {
            endpoint: {
              point: {x: proxy.x, y: proxy.y, z: proxy.z},
            },
            ownerDarkParticleId: proxy.ownerDarkParticleId,
          }
        : null
    }
    const orbital = orbitalById.get(id)
    return orbital
      ? {
          endpoint: {
            point: {x: orbital.x, y: orbital.y, z: orbital.z},
          },
          ownerDarkParticleId: orbital.ownerDarkParticleId,
        }
      : null
  }
  const stateBranchId = (
    kind: BulkRelationChannel["fromKind"],
    id: string,
  ): string | null => {
    if (kind === "field") return null
    if (kind === "field-proxy") {
      return proxyById.get(id)?.stateOrbitalParticleId ?? null
    }
    const orbital = orbitalById.get(id)
    if (orbital?.anchorStateOrbitalParticleId) {
      return orbital.anchorStateOrbitalParticleId
    }
    return manifestedOrbitalById.get(id)?.orbitalParticleKind === "state"
      ? id
      : null
  }

  return Object.freeze((manifest.relationChannels ?? []).flatMap((channel) => {
    if (!visualRelationHasSceneGeometry(channel)) return []
    if (
      channel.relationKind === "field-entanglement" &&
      channel.fromKind === "field" &&
      channel.toKind === "field" &&
      fieldByOccurrenceId.get(channel.fromId) ===
        fieldByOccurrenceId.get(channel.toId)
    ) {
      return []
    }
    const from = endpoint(channel.fromKind, channel.fromId)
    const to = endpoint(channel.toKind, channel.toId)
    const ownerRoot = rootByOwner.get(channel.parentDarkParticleId)
    if (
      !from ||
      !to ||
      ownerRoot === undefined ||
      rootByOwner.get(from.ownerDarkParticleId) !== ownerRoot ||
      rootByOwner.get(to.ownerDarkParticleId) !== ownerRoot
    ) {
      throw new Error(
        `Visual relation ${channel.relationChannelId} has unresolved component endpoints`,
      )
    }
    const fromStateBranchId = stateBranchId(
      channel.fromKind,
      channel.fromId,
    )
    const toStateBranchId = stateBranchId(
      channel.toKind,
      channel.toId,
    )
    if (
      fromStateBranchId !== null &&
      toStateBranchId !== null &&
      fromStateBranchId !== toStateBranchId
    ) {
      throw new Error(
        `Visual relation ${channel.relationChannelId} crosses State branches`,
      )
    }
    const branchId = fromStateBranchId ?? toStateBranchId
    const branchActive = branchId === null
      ? channel.active
      : stateBranchActiveById.get(branchId)
    if (branchActive === undefined) {
      throw new Error(
        `Visual relation ${channel.relationChannelId} has unresolved State branch ${branchId}`,
      )
    }
    const color = visualRelationColor(channel)
    const curves = hermiteRelationCurves(
      from.endpoint.point,
      to.endpoint.point,
    )
    return [Object.freeze({
      curves,
      material: visualRelationMaterial(
        color,
        channel.active,
        branchActive,
      ),
      ownerDarkParticleId: channel.parentDarkParticleId,
      path: sampleHermiteRelationCurves(curves),
      relationChannelId: channel.relationChannelId,
    })]
  }))
}
