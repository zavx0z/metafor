import type {
  BulkManifest,
  BulkOrbitalParticle,
  BulkRelationChannel,
} from "@metafor/types/bulk/manifest"
import type {VisualComponent} from "./internal/component.ts"

export type VisualSceneCounts = Readonly<{
  atoms: number
  fields: number
  orbitals: number
  relations: number
  transitions: number
}>

const copyManifest = (manifest: BulkManifest): BulkManifest => ({
  rootSrc: manifest.rootSrc,
  darkParticles: manifest.darkParticles.map((particle) => ({...particle})),
  fieldParticles: manifest.fieldParticles.map((particle) => ({...particle})),
  orbitalParticles: (manifest.orbitalParticles ?? []).map((particle) => ({
    ...particle,
    relatedStateIds: [...particle.relatedStateIds],
  })),
  transitionChannels: (manifest.transitionChannels ?? []).map((channel) => ({
    ...channel,
    conditionIds: [...channel.conditionIds],
    conditionFieldIds: [...channel.conditionFieldIds],
  })),
  fieldProxies: (manifest.fieldProxies ?? []).map((proxy) => ({...proxy})),
  relationChannels: (manifest.relationChannels ?? []).map((channel) => ({...channel})),
})

const withoutCausalGeometry = (manifest: BulkManifest): BulkManifest => ({
  ...manifest,
  orbitalParticles: [],
  transitionChannels: [],
  fieldProxies: [],
  relationChannels: [],
})

const withOnlyOrbitals = (
  manifest: BulkManifest,
  orbitals: readonly BulkOrbitalParticle[],
): BulkManifest => ({
  ...manifest,
  fieldParticles: [],
  orbitalParticles: orbitals.map((particle) => ({
    ...particle,
    relatedStateIds: [...particle.relatedStateIds],
  })),
  transitionChannels: [],
  fieldProxies: [],
  relationChannels: [],
})

const endpointsPresent = (
  channel: BulkRelationChannel,
  fields: ReadonlySet<string>,
  orbitals: ReadonlySet<string>,
  proxies: ReadonlySet<string>,
): boolean => {
  const present = (kind: BulkRelationChannel["fromKind"], id: string): boolean => {
    if (kind === "field") return fields.has(id)
    if (kind === "field-proxy") return proxies.has(id)
    return orbitals.has(id)
  }
  return present(channel.fromKind, channel.fromId) && present(channel.toKind, channel.toId)
}

const withCausalKind = (
  manifest: BulkManifest,
  kind: BulkOrbitalParticle["orbitalParticleKind"],
): BulkManifest => {
  const allOrbitals = manifest.orbitalParticles ?? []
  const selected = allOrbitals.filter((particle) => particle.orbitalParticleKind === kind)
  const anchorIds = new Set(
    selected
      .map((particle) => particle.anchorStateOrbitalParticleId)
      .filter((id): id is string => id !== null),
  )
  const orbitals = allOrbitals.filter((particle) =>
    selected.some((candidate) => candidate.orbitalParticleId === particle.orbitalParticleId) ||
    anchorIds.has(particle.orbitalParticleId),
  )
  const orbitalIds = new Set(orbitals.map((particle) => particle.orbitalParticleId))
  const proxies = (manifest.fieldProxies ?? []).filter((proxy) =>
    orbitalIds.has(proxy.stateOrbitalParticleId),
  )
  const proxyIds = new Set(proxies.map((proxy) => proxy.fieldProxyId))
  const fields = manifest.fieldParticles.filter((field) =>
    proxies.some((proxy) => proxy.fieldParticleId === field.fieldParticleId),
  )
  const fieldIds = new Set(fields.map((field) => field.fieldParticleId))
  const relations = (manifest.relationChannels ?? []).filter((channel) =>
    endpointsPresent(channel, fieldIds, orbitalIds, proxyIds),
  )
  return {
    ...manifest,
    fieldParticles: fields,
    orbitalParticles: orbitals,
    transitionChannels: [],
    fieldProxies: proxies,
    relationChannels: relations,
  }
}

const firstField = (manifest: BulkManifest): BulkManifest => {
  const rootId = manifest.darkParticles.find(
    (particle) => particle.parentDarkParticleId === null,
  )?.darkParticleId
  const selected = manifest.fieldParticles.find(
    (particle) => particle.parentDarkParticleId === rootId,
  ) ?? manifest.fieldParticles[0]
  return withoutCausalGeometry({
    ...manifest,
    fieldParticles: selected ? [{...selected}] : [],
  })
}

const firstState = (manifest: BulkManifest): BulkManifest => {
  const states = (manifest.orbitalParticles ?? []).filter(
    (particle) => particle.orbitalParticleKind === "state",
  )
  const selected = states.find(
    (particle) => particle.current && particle.sleeveRootStateId === particle.sourceId,
  ) ?? states.find((particle) => particle.current) ?? states[0]
  return withOnlyOrbitals(manifest, selected ? [selected] : [])
}

const firstTransition = (manifest: BulkManifest): BulkManifest => {
  const channel = (manifest.transitionChannels ?? []).find((candidate) => candidate.active) ??
    manifest.transitionChannels?.[0]
  if (!channel) return withOnlyOrbitals(manifest, [])
  const endpointIds = new Set([
    channel.fromOrbitalParticleId,
    channel.toOrbitalParticleId,
  ])
  const orbitals = (manifest.orbitalParticles ?? []).filter((particle) =>
    endpointIds.has(particle.orbitalParticleId),
  )
  return {
    ...withOnlyOrbitals(manifest, orbitals),
    transitionChannels: [{
      ...channel,
      conditionIds: [...channel.conditionIds],
      conditionFieldIds: [...channel.conditionFieldIds],
    }],
  }
}

/**
 * Selects occurrences for an isolated page without changing any retained
 * particle coordinate, transform, radius, semantic state or relationship.
 */
export const projectVisualScene = (
  source: BulkManifest,
  component: VisualComponent,
): BulkManifest => {
  const manifest = copyManifest(source)
  if (component.selection === "all" || component.selection === "states") return manifest
  if (component.selection === "matter") {
    return withoutCausalGeometry({...manifest, fieldParticles: []})
  }
  if (component.selection === "first-field") return firstField(manifest)
  if (component.selection === "fields") return withoutCausalGeometry(manifest)
  if (component.selection === "first-state") return firstState(manifest)
  if (component.selection === "first-transition") return firstTransition(manifest)
  if (component.selection === "processes") return withCausalKind(manifest, "process")
  if (component.selection === "reactions") return withCausalKind(manifest, "reaction")
  if (component.selection === "finally") return withCausalKind(manifest, "finally")
  return withCausalKind(manifest, "axion")
}

export const countVisualScene = (manifest: BulkManifest): VisualSceneCounts => ({
  atoms: manifest.darkParticles.length,
  fields: manifest.fieldParticles.length,
  orbitals: manifest.orbitalParticles?.length ?? 0,
  relations: manifest.relationChannels?.length ?? 0,
  transitions: manifest.transitionChannels?.length ?? 0,
})
