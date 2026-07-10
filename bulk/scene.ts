import type {BulkDarkParticle, BulkFieldParticle, BulkManifest} from "@metafor/types/bulk/manifest"

export type BulkScenePatch = {
  darkParticleIds: number[]
  fieldParticleIds: number[]
  removedDarkParticleIds: number[]
  removedFieldParticleIds: number[]
}

const sameFlatRecord = (left: object, right: object): boolean => {
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const keys = Object.keys(leftRecord)
  return keys.length === Object.keys(rightRecord).length && keys.every((key) => Object.is(leftRecord[key], rightRecord[key]))
}

/** Diff gate used by the live viewport; unchanged render entities are not touched. */
export class BulkSceneStore {
  readonly darkParticles = new Map<number, BulkDarkParticle>()
  readonly fieldParticles = new Map<number, BulkFieldParticle>()

  apply(manifest: BulkManifest): BulkScenePatch {
    const darkParticleIds: number[] = []
    const fieldParticleIds: number[] = []
    const nextDarkIds = new Set<number>()
    const nextFieldIds = new Set<number>()

    for (const particle of manifest.darkParticles) {
      nextDarkIds.add(particle.darkParticleId)
      const current = this.darkParticles.get(particle.darkParticleId)
      if (!current) {
        this.darkParticles.set(particle.darkParticleId, {...particle})
        darkParticleIds.push(particle.darkParticleId)
      } else if (!sameFlatRecord(current, particle)) {
        Object.assign(current, particle)
        darkParticleIds.push(particle.darkParticleId)
      }
    }
    for (const particle of manifest.fieldParticles) {
      nextFieldIds.add(particle.fieldParticleId)
      const current = this.fieldParticles.get(particle.fieldParticleId)
      if (!current) {
        this.fieldParticles.set(particle.fieldParticleId, {...particle})
        fieldParticleIds.push(particle.fieldParticleId)
      } else if (!sameFlatRecord(current, particle)) {
        Object.assign(current, particle)
        fieldParticleIds.push(particle.fieldParticleId)
      }
    }

    const removedFieldParticleIds = [...this.fieldParticles.keys()].filter((id) => !nextFieldIds.has(id))
    const removedDarkParticleIds = [...this.darkParticles.keys()].filter((id) => !nextDarkIds.has(id))
    for (const id of removedFieldParticleIds) this.fieldParticles.delete(id)
    for (const id of removedDarkParticleIds) this.darkParticles.delete(id)

    return {darkParticleIds, fieldParticleIds, removedDarkParticleIds, removedFieldParticleIds}
  }
}
