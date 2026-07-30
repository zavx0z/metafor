import type {
  BulkManifest,
  BulkRelationChannel,
} from "@metafor/types/bulk/manifest"
import {visualRelationColor} from "./SemanticVisual.ts"
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
  material: VisualLineMaterial
  ownerDarkParticleId: number
  path: readonly Point[]
  relationChannelId: string
}>

const RELATION_HALF_SEGMENTS = 32

const ellipticRelationPath = (
  from: Point,
  to: Point,
): readonly Point[] => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const distance = Math.hypot(dx, dy, dz)
  const length = Math.max(1, distance)
  const axis = distance > 1e-6
    ? {x: dx / distance, y: dy / distance, z: dz / distance}
    : {x: 0, y: 0, z: 0}
  let side = {
    x: -axis.x * axis.z,
    y: -axis.y * axis.z,
    z: 1 - axis.z * axis.z,
  }
  const sideLength = Math.hypot(side.x, side.y, side.z)
  side = sideLength <= 1e-6
    ? {x: 1, y: 0, z: 0}
    : {
        x: side.x / sideLength,
        y: side.y / sideLength,
        z: side.z / sideLength,
      }
  const center = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
    z: (from.z + to.z) / 2,
  }
  const major = {x: dx / 2, y: dy / 2, z: dz / 2}
  const minorScale = Math.min(length * 0.23, 180)
  const pointAt = (index: number, half: 1 | -1): Point => {
    const angle = Math.PI * index / RELATION_HALF_SEGMENTS
    const majorScale = -Math.cos(angle)
    const minorFactor = Math.sin(angle) * half * minorScale
    return Object.freeze({
      x: center.x + major.x * majorScale + side.x * minorFactor,
      y: center.y + major.y * majorScale + side.y * minorFactor,
      z: center.z + major.z * majorScale + side.z * minorFactor,
    })
  }
  const points: Point[] = []
  for (let index = 0; index <= RELATION_HALF_SEGMENTS; index += 1) {
    points.push(pointAt(index, 1))
  }
  for (let index = RELATION_HALF_SEGMENTS - 1; index >= 0; index -= 1) {
    points.push(pointAt(index, -1))
  }
  return Object.freeze(points)
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

  return Object.freeze((manifest.relationChannels ?? []).map((channel) => {
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
    const color = visualRelationColor(channel)
    return Object.freeze({
      material: visualRelationMaterial(color, channel.active),
      ownerDarkParticleId: channel.parentDarkParticleId,
      path: ellipticRelationPath(
        from.endpoint.point,
        to.endpoint.point,
      ),
      relationChannelId: channel.relationChannelId,
    })
  }))
}
