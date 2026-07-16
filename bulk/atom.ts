import type {BulkManifest} from "@metafor/types/bulk/manifest"

/**
 * Converts the legacy manifestation label of a materialized WIMP instance into
 * the canonical Atom term. Declaration references in src/metaSrc stay intact.
 */
export const manifestAtoms = (manifest: BulkManifest): BulkManifest => ({
  ...manifest,
  darkParticles: manifest.darkParticles.map((particle) =>
    particle.darkParticleKind === "wimp"
      ? {...particle, darkParticleKind: "atom" as const}
      : particle
  ),
})
