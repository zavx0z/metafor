import type {
  BulkDarkParticle,
  BulkFieldParticle,
  BulkOrbitalParticle,
  BulkRelationChannel,
  BulkTransitionChannel,
} from "@metafor/types/bulk/manifest"

export type VisualColor = readonly [number, number, number]

export const visualDarkParticleColor = (
  particle: Pick<BulkDarkParticle, "darkParticleKind" | "activity">,
): VisualColor => {
  const base: VisualColor = particle.darkParticleKind === "atom"
    ? [0.4, 0.45, 0.98]
    : particle.darkParticleKind === "fuzzy"
      ? [0.52, 0.88, 1]
      : particle.darkParticleKind === "axion"
        ? [1, 0.66, 0.36]
        : [1, 0.38, 0.48]
  if (particle.activity === "inactive") {
    return base.map((channel) => channel * 0.56) as unknown as VisualColor
  }
  if (particle.activity === "active") {
    return base.map((channel) =>
      channel + (1 - channel) * 0.2
    ) as unknown as VisualColor
  }
  return base
}

export const visualFieldParticleColor = (
  particle: Pick<BulkFieldParticle, "fieldParticleKind">,
): VisualColor => {
  if (particle.fieldParticleKind === "string") return [1, 0.08, 0.58]
  if (particle.fieldParticleKind === "number") return [1, 0.88, 0]
  if (particle.fieldParticleKind === "boolean") return [0, 0.9, 1]
  if (particle.fieldParticleKind === "enum") return [0.58, 0.32, 1]
  if (particle.fieldParticleKind === "array") return [1, 0.42, 0]
  return [1, 0.16, 0.16]
}

export const visualOrbitalParticleColor = (
  particle: Pick<
    BulkOrbitalParticle,
    "orbitalParticleKind" | "sourceId"
  >,
): VisualColor => {
  if (particle.orbitalParticleKind === "process") return [0.72, 0.46, 1]
  if (particle.orbitalParticleKind === "finally") return [1, 0.22, 0.2]
  if (particle.orbitalParticleKind === "reaction") return [1, 0.3, 0.68]
  if (particle.orbitalParticleKind === "axion") return [1, 0.66, 0.36]
  const phase = Math.abs(particle.sourceId * 0.6180339887498949) % 1
  return [0.2 + phase * 0.42, 0.68 + phase * 0.28, 1]
}

export const visualTransitionColor = (
  channel: Pick<BulkTransitionChannel, "active">,
): VisualColor => channel.active ? [0.48, 0.9, 1] : [0.2, 0.48, 1]

export const visualRelationColor = (
  channel: Pick<BulkRelationChannel, "relationKind">,
): VisualColor => {
  if (channel.relationKind.endsWith("-write")) return [1, 0.54, 0.17]
  if (channel.relationKind === "axion-read") return [1, 0.66, 0.36]
  if (channel.relationKind === "field-projection") return [0.58, 0.72, 1]
  return [0.37, 0.89, 1]
}

/**
 * Process dependencies remain relational layout facts, but the containing
 * Process Torus already represents their common operation. Drawing every
 * dependency to its empty Torus center creates a closed-loop visual artifact.
 */
export const visualRelationHasSceneGeometry = (
  channel: Pick<BulkRelationChannel, "relationKind">,
): boolean =>
  channel.relationKind !== "process-read" &&
  channel.relationKind !== "process-write"
