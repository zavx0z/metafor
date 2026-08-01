import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import {BulkVisualSceneLifecycle} from "bulk/visual"
import type {VisualLayoutInput} from "../src/internal/layout.ts"
import snapshotJson from "../playground/fixture/monad-snapshot.json"

/**
 * Test-only fixture: the real `zavx0z/lada` snapshot as complete layout input.
 *
 * This module is deliberately outside the published `files` list. It reaches
 * into Bulk only to reuse the canonical semantic manifestation, so specs
 * exercise production strategies against a real complex scene instead of a
 * hand-written toy graph.
 */

/**
 * The deferred Axion slice carries no visual surface, and a condition Field
 * proxy only exists where a Transition actually reads it. Mirrors the policy a
 * production consumer applies before calling a named strategy.
 */
export const renderableLadaManifest = (source: BulkManifest): BulkManifest => {
  const excluded = new Set(
    source.darkParticles
      .filter((particle) => particle.darkParticleKind === "axion")
      .map((particle) => particle.darkParticleId),
  )
  const retained = (id: number): boolean => !excluded.has(id)
  const transitionChannels = (source.transitionChannels ?? []).filter(
    (channel) => retained(channel.parentDarkParticleId),
  )
  const proxyByStateAndField = new Map(
    (source.fieldProxies ?? [])
      .filter((proxy) => retained(proxy.parentDarkParticleId))
      .map((proxy) =>
        [`${proxy.stateOrbitalParticleId}\0${proxy.fieldId}`, proxy] as const
      ),
  )
  const retainedProxyIds = new Set<string>()
  for (const channel of transitionChannels) {
    for (const fieldId of channel.conditionFieldIds) {
      const proxy = proxyByStateAndField.get(
        `${channel.fromOrbitalParticleId}\0${fieldId}`,
      )
      if (proxy) retainedProxyIds.add(proxy.fieldProxyId)
    }
  }
  const relations = (source.relationChannels ?? []).filter((channel) =>
    retained(channel.parentDarkParticleId) &&
    channel.relationKind !== "axion-read" &&
    channel.relationKind !== "field-entanglement"
  )
  for (const channel of relations) {
    if (channel.relationKind === "field-projection") continue
    if (channel.fromKind === "field-proxy") retainedProxyIds.add(channel.fromId)
    if (channel.toKind === "field-proxy") retainedProxyIds.add(channel.toId)
  }
  const fieldProxies = (source.fieldProxies ?? []).filter((proxy) =>
    retained(proxy.parentDarkParticleId) &&
    retainedProxyIds.has(proxy.fieldProxyId)
  )
  const keptProxyIds = new Set(fieldProxies.map((proxy) => proxy.fieldProxyId))
  return {
    rootSrc: source.rootSrc,
    darkParticles: source.darkParticles.filter((particle) =>
      retained(particle.darkParticleId)
    ),
    fieldParticles: source.fieldParticles.filter((field) =>
      retained(field.parentDarkParticleId)
    ),
    orbitalParticles: (source.orbitalParticles ?? []).filter((particle) =>
      retained(particle.parentDarkParticleId) &&
      particle.orbitalParticleKind !== "axion"
    ),
    transitionChannels,
    fieldProxies,
    relationChannels: relations.filter((channel) => {
      if (channel.relationKind !== "field-projection") return true
      const proxyId = channel.fromKind === "field-proxy"
        ? channel.fromId
        : channel.toKind === "field-proxy"
          ? channel.toId
          : null
      return proxyId !== null && keptProxyIds.has(proxyId)
    }),
  }
}

/** The complete Lada snapshot as canonical semantic manifestation. */
export const ladaManifest = (): BulkManifest => {
  const snapshot = snapshotJson as BulkObserverSnapshot
  const lifecycle = new BulkVisualSceneLifecycle()
  lifecycle.prepare(structuredClone(snapshot))
  return renderableLadaManifest(lifecycle.state().manifest)
}

/**
 * Complete layout input for the real Lada scene.
 *
 * `manifest` adjusts the semantic manifestation and `projection` adjusts the
 * runtime the owner graphs are derived from. A change that moves the current
 * State must be expressed through `projection`, because a strategy requires the
 * manifest and its owner graph to agree on that identity.
 */
export const ladaLayoutInput = (
  mutate: (manifest: BulkManifest) => BulkManifest = (value) => value,
  mutateProjection: (
    projection: BulkRuntimeProjection,
  ) => void = () => {},
): VisualLayoutInput => {
  const snapshot = structuredClone(snapshotJson) as BulkObserverSnapshot
  mutateProjection(snapshot.projection.runtime)
  const lifecycle = new BulkVisualSceneLifecycle()
  lifecycle.prepare(snapshot)
  const manifest = mutate(
    renderableLadaManifest(lifecycle.state().manifest),
  )
  return lifecycle.layoutInput(manifest)
}
