import type {
  BulkReadyRenderDarkParticle,
  BulkReadyRenderFieldParticle,
  BulkReadyRenderFieldProxy,
  BulkReadyRenderOrbitalParticle,
  BulkReadyRenderRelationChannel,
  BulkReadyRenderScene,
  BulkReadyRenderTransitionChannel,
} from "@bulk/types/visual"

export type BulkScenePatch = {
  darkParticleIds: number[]
  fieldParticleIds: string[]
  removedDarkParticleIds: number[]
  removedFieldParticleIds: string[]
  orbitalParticleIds: string[]
  transitionChannelIds: string[]
  removedOrbitalParticleIds: string[]
  removedTransitionChannelIds: string[]
  fieldProxyIds: string[]
  relationChannelIds: string[]
  removedFieldProxyIds: string[]
  removedRelationChannelIds: string[]
}

/** What one incremental patch changed, by entity class. */
export type BulkSceneAbsorption = {
  darkParticles?: readonly BulkReadyRenderDarkParticle[]
  fieldParticles?: readonly BulkReadyRenderFieldParticle[]
  fieldProxies?: readonly BulkReadyRenderFieldProxy[]
  orbitalParticles?: readonly BulkReadyRenderOrbitalParticle[]
  removedDarkParticleIds?: readonly number[]
  removedFieldParticleIds?: readonly string[]
  removedFieldProxyIds?: readonly string[]
  removedOrbitalParticleIds?: readonly string[]
}

const sameFlatRecord = (left: object, right: object): boolean => {
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const keys = Object.keys(leftRecord)
  const sameValue = (leftValue: unknown, rightValue: unknown): boolean =>
    Object.is(leftValue, rightValue) || (
      Array.isArray(leftValue) &&
      Array.isArray(rightValue) &&
      leftValue.length === rightValue.length &&
      leftValue.every((entry, index) => Object.is(entry, rightValue[index]))
    )
  return keys.length === Object.keys(rightRecord).length &&
    keys.every((key) => sameValue(leftRecord[key], rightRecord[key]))
}

/** Diff gate used by the live viewport; unchanged render entities are not touched. */
export class BulkSceneStore {
  readonly darkParticles = new Map<number, BulkReadyRenderDarkParticle>()
  readonly fieldParticles = new Map<string, BulkReadyRenderFieldParticle>()
  readonly orbitalParticles = new Map<string, BulkReadyRenderOrbitalParticle>()
  readonly transitionChannels = new Map<string, BulkReadyRenderTransitionChannel>()
  readonly fieldProxies = new Map<string, BulkReadyRenderFieldProxy>()
  readonly relationChannels = new Map<string, BulkReadyRenderRelationChannel>()

  apply(manifest: BulkReadyRenderScene): BulkScenePatch {
    const darkParticleIds: number[] = []
    const fieldParticleIds: string[] = []
    const nextDarkIds = new Set<number>()
    const nextFieldIds = new Set<string>()
    const orbitalParticleIds: string[] = []
    const transitionChannelIds: string[] = []
    const nextOrbitalIds = new Set<string>()
    const nextTransitionIds = new Set<string>()
    const fieldProxyIds: string[] = []
    const relationChannelIds: string[] = []
    const nextFieldProxyIds = new Set<string>()
    const nextRelationChannelIds = new Set<string>()

    for (const particle of manifest.darkParticles) {
      nextDarkIds.add(particle.darkParticleId)
      const current = this.darkParticles.get(particle.darkParticleId)
      if (!current) {
        this.darkParticles.set(particle.darkParticleId, particle)
        darkParticleIds.push(particle.darkParticleId)
      } else if (!sameFlatRecord(current, particle)) {
        this.darkParticles.set(particle.darkParticleId, particle)
        darkParticleIds.push(particle.darkParticleId)
      }
    }
    for (const particle of manifest.fieldParticles) {
      nextFieldIds.add(particle.fieldParticleId)
      const current = this.fieldParticles.get(particle.fieldParticleId)
      if (!current) {
        this.fieldParticles.set(particle.fieldParticleId, particle)
        fieldParticleIds.push(particle.fieldParticleId)
      } else if (!sameFlatRecord(current, particle)) {
        this.fieldParticles.set(particle.fieldParticleId, particle)
        fieldParticleIds.push(particle.fieldParticleId)
      }
    }
    for (const particle of manifest.orbitalParticles ?? []) {
      nextOrbitalIds.add(particle.orbitalParticleId)
      const current = this.orbitalParticles.get(particle.orbitalParticleId)
      if (!current) {
        this.orbitalParticles.set(particle.orbitalParticleId, particle)
        orbitalParticleIds.push(particle.orbitalParticleId)
      } else if (!sameFlatRecord(current, particle)) {
        this.orbitalParticles.set(particle.orbitalParticleId, particle)
        orbitalParticleIds.push(particle.orbitalParticleId)
      }
    }
    for (const channel of manifest.transitionChannels ?? []) {
      nextTransitionIds.add(channel.transitionChannelId)
      const current = this.transitionChannels.get(channel.transitionChannelId)
      if (!current) {
        this.transitionChannels.set(channel.transitionChannelId, channel)
        transitionChannelIds.push(channel.transitionChannelId)
      } else if (!sameFlatRecord(current, channel)) {
        this.transitionChannels.set(channel.transitionChannelId, channel)
        transitionChannelIds.push(channel.transitionChannelId)
      }
    }
    for (const proxy of manifest.fieldProxies ?? []) {
      nextFieldProxyIds.add(proxy.fieldProxyId)
      const current = this.fieldProxies.get(proxy.fieldProxyId)
      if (!current) {
        this.fieldProxies.set(proxy.fieldProxyId, proxy)
        fieldProxyIds.push(proxy.fieldProxyId)
      } else if (!sameFlatRecord(current, proxy)) {
        this.fieldProxies.set(proxy.fieldProxyId, proxy)
        fieldProxyIds.push(proxy.fieldProxyId)
      }
    }
    for (const channel of manifest.relationChannels ?? []) {
      nextRelationChannelIds.add(channel.relationChannelId)
      const current = this.relationChannels.get(channel.relationChannelId)
      if (!current) {
        this.relationChannels.set(channel.relationChannelId, channel)
        relationChannelIds.push(channel.relationChannelId)
      } else if (!sameFlatRecord(current, channel)) {
        this.relationChannels.set(channel.relationChannelId, channel)
        relationChannelIds.push(channel.relationChannelId)
      }
    }

    const removedFieldParticleIds = [...this.fieldParticles.keys()].filter((id) => !nextFieldIds.has(id))
    const removedDarkParticleIds = [...this.darkParticles.keys()].filter((id) => !nextDarkIds.has(id))
    const removedOrbitalParticleIds = [...this.orbitalParticles.keys()].filter((id) => !nextOrbitalIds.has(id))
    const removedTransitionChannelIds = [...this.transitionChannels.keys()].filter((id) => !nextTransitionIds.has(id))
    const removedFieldProxyIds = [...this.fieldProxies.keys()].filter((id) => !nextFieldProxyIds.has(id))
    const removedRelationChannelIds = [...this.relationChannels.keys()].filter((id) => !nextRelationChannelIds.has(id))
    for (const id of removedFieldParticleIds) this.fieldParticles.delete(id)
    for (const id of removedDarkParticleIds) this.darkParticles.delete(id)
    for (const id of removedOrbitalParticleIds) this.orbitalParticles.delete(id)
    for (const id of removedTransitionChannelIds) this.transitionChannels.delete(id)
    for (const id of removedFieldProxyIds) this.fieldProxies.delete(id)
    for (const id of removedRelationChannelIds) this.relationChannels.delete(id)

    return {
      darkParticleIds,
      fieldParticleIds,
      orbitalParticleIds,
      transitionChannelIds,
      removedDarkParticleIds,
      removedFieldParticleIds,
      removedOrbitalParticleIds,
      removedTransitionChannelIds,
      fieldProxyIds,
      relationChannelIds,
      removedFieldProxyIds,
      removedRelationChannelIds,
    }
  }

  /**
   * Records what an incremental patch already applied to the scene.
   *
   * A patch names only what it touched, so absence must not read as removal —
   * which is exactly why `apply` cannot be used for it. Without this the held
   * state goes stale, and a stale diff can *narrow*: if a patch sets an entity
   * to a new value and a later full projection carries the value this store
   * still holds, `apply` would report "unchanged" and the scene would keep the
   * patched value forever.
   */
  absorb(absorption: BulkSceneAbsorption): void {
    for (const particle of absorption.darkParticles ?? []) {
      this.darkParticles.set(particle.darkParticleId, particle)
    }
    for (const particle of absorption.fieldParticles ?? []) {
      this.fieldParticles.set(particle.fieldParticleId, particle)
    }
    for (const particle of absorption.orbitalParticles ?? []) {
      this.orbitalParticles.set(particle.orbitalParticleId, particle)
    }
    for (const proxy of absorption.fieldProxies ?? []) {
      this.fieldProxies.set(proxy.fieldProxyId, proxy)
    }
    for (const id of absorption.removedDarkParticleIds ?? []) {
      this.darkParticles.delete(id)
    }
    for (const id of absorption.removedFieldParticleIds ?? []) {
      this.fieldParticles.delete(id)
    }
    for (const id of absorption.removedOrbitalParticleIds ?? []) {
      this.orbitalParticles.delete(id)
    }
    for (const id of absorption.removedFieldProxyIds ?? []) {
      this.fieldProxies.delete(id)
    }
  }
}
