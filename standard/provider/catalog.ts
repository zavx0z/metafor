import {validateGraph, type Graph, type RuntimeAtom, type RuntimeNode} from "@metafor/types/metafor/graph"
import {BROWSER_PROVIDER_METAS,
  type ProviderAtomObservation, type ProviderBinding, type ProviderCatalogEntry,
  type ProviderPeerObservation, type ProviderRegistry, type ProviderSource} from "@metafor/types/metafor/providers"
import {parseProviderDescriptor, parseProviderRegistry} from "@metafor/types/metafor/provider-validation"
export {parseProviderDescriptor, parseProviderRegistry, createProviderRegistry} from "@metafor/types/metafor/provider-validation"

const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)
const timestamp = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const browserMeta = (value: unknown): value is "chrome-studio" | "capsule" => BROWSER_PROVIDER_METAS.includes(value as "chrome-studio" | "capsule")

/** Resolve canonical assignment; connection observation never grants a native operation. */
export function resolveProviderBinding(registry: ProviderRegistry, bindingId: string): ProviderBinding {
  const canonical = parseProviderRegistry(registry)
  if (canonical.settings.configuration && !canonical.settings.configuration.connections.some(row => row.enabled && canonical.settings.connectionBindings?.[row.id] === bindingId && canonical.settings.connectionChecks?.[row.id]?.checkedAt != null && canonical.settings.connectionChecks?.[row.id]?.status !== "failed")) {
    throw new Error("Provider connection is disabled, removed or not admitted")
  }
  const selected = canonical.entries.find(entry => entry.id === bindingId)
  if (!selected || selected.resolution !== "exact" || selected.connection !== "connected" || !selected.capabilities.modelTurn || selected.checks.status === "failed") {
    throw new Error("Provider binding is unknown, disconnected, stale or not model-capable")
  }
  return {id: selected.id, service: selected.service, host: selected.host, remotePeerId: selected.remotePeerId, executorId: selected.executorId,
    ...(selected.assignmentId === undefined ? {} : {assignmentId: selected.assignmentId})}
}

const sameBinding = (a: ProviderBinding, b: ProviderBinding) => ["id", "service", "host", "remotePeerId", "executorId", "assignmentId"].every(key =>
  a[key as keyof ProviderBinding] === b[key as keyof ProviderBinding])

/**
 * Reads exact browser-owner Atoms. A child @capsule/runtime is not another owner.
 * Graph state/values are observations; they never turn connection into connected.
 * [Tests](./catalog.spec.ts) cover missing descriptors and duplicate capability ownership.
 */
export function scanProviderGraph(graph: Graph, peerId?: string): {entries: ProviderCatalogEntry[], observations: ProviderAtomObservation[]} {
  const nodes: RuntimeNode[] = [...graph.runtime.roots]
  const atoms: RuntimeAtom[] = []
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!
    if (node.kind === "atom" && browserMeta(node.meta)) atoms.push(node)
    nodes.push(...(node.children ?? []))
  }
  const entries: ProviderCatalogEntry[] = []
  const observations: ProviderAtomObservation[] = []
  for (const atom of atoms) {
    if (!browserMeta(atom.meta)) continue
    const origin: Extract<ProviderSource, {kind: "atom"}> = {kind: "atom", root: graph.root, ref: atom.ref, meta: atom.meta, ...(peerId === undefined ? {} : {peerId})}
    const observation: ProviderAtomObservation = {source: origin, state: atom.state, status: typeof atom.values.status === "string" ? atom.values.status : null,
      resolution: "unknown", bindingIds: [], issues: []}
    observations.push(observation)
    try {
      if (!graph.template[atom.meta]?.fields.some(field => field.key === "providerCapabilities" && field.type === "string") || typeof atom.values.providerCapabilities !== "string") {
        throw new Error("Browser owner has no declared Provider descriptor Field")
      }
      const descriptor = parseProviderDescriptor(JSON.parse(atom.values.providerCapabilities))
      if (descriptor.bindings.some(advertised => entries.some(entry => entry.id === advertised.id))) throw new Error("Provider binding identity occurs more than once")
      for (const advertised of descriptor.bindings) {
        entries.push({...advertised, source: origin, resolution: "exact", connection: "unknown", checks: {status: "unknown", checkedAt: null, message: null}})
        observation.bindingIds.push(advertised.id)
      }
      observation.resolution = "exact"
    } catch {
      observation.issues.push("Browser owner Provider descriptor is missing, invalid or conflicts with another owner")
    }
  }
  return {entries, observations}
}

/**
 * Reconciles observations into the sole Mass registry. Verified native bootstrap
 * entries retain their provenance; graph declarations do not overwrite them.
 * An absent peer catalog remains unknown, never inferred from telemetry.
 */
export function reconcileProviderRegistry(input: {
  registry: ProviderRegistry
  graph?: Graph
  remoteGraphs?: Array<{peerId: string, graph: Graph}>
  peers?: readonly ProviderPeerObservation[]
  now: number
  staleAfterMs?: number
}): ProviderRegistry {
  const registry = parseProviderRegistry(input.registry)
  if (!timestamp(input.now)) throw new Error("Invalid Provider observation time")
  const staleAfterMs = input.staleAfterMs ?? 60_000
  if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs < 1) throw new Error("Invalid Provider observation lifetime")
  const remotePeers = new Set<string>()
  for (const remote of input.remoteGraphs ?? []) {
    const admitted = input.peers?.find(peer => peer.peerId === remote.peerId && peer.connection === "connected")
    if (!admitted || admitted.universeRoot !== remote.graph.root || remotePeers.has(remote.peerId) || !validateGraph(remote.graph).ok) {
      throw new Error("Remote Provider Graph requires its exact admitted universe")
    }
    remotePeers.add(remote.peerId)
  }
  const observed = [...(input.graph ? [scanProviderGraph(input.graph)] : []), ...(input.remoteGraphs ?? []).map(remote => scanProviderGraph(remote.graph, remote.peerId))]
  const found = observed.flatMap(snapshot => snapshot.entries)
  const observations = observed.flatMap(snapshot => snapshot.observations)
  const issues: string[] = []
  for (const peer of input.peers ?? []) {
    if (!id(peer.peerId) || !timestamp(peer.checkedAt) || peer.checkedAt > input.now || !["connected", "disconnected", "stale", "unknown"].includes(peer.connection)) throw new Error("Invalid admitted Provider peer observation")
    if (!peer.descriptor) continue
    for (const advertised of parseProviderDescriptor(peer.descriptor).bindings) {
      found.push({...advertised, source: {kind: "peer", peerId: peer.peerId, universeRoot: peer.universeRoot,
        ...(peer.worldIdentity ? {worldIdentity: peer.worldIdentity} : {}), ...(peer.atomBindings ? {atomBindings: peer.atomBindings} : {})}, resolution: "exact", connection: peer.connection,
        checks: {status: "unknown", checkedAt: peer.checkedAt, message: "Descriptor observed; model readiness is not checked"}})
    }
  }
  const seen = new Set<string>()
  for (const next of found) {
    if (seen.has(next.id)) {
      const ambiguous = registry.entries.find(entry => entry.id === next.id)
      if (ambiguous) {ambiguous.resolution = "unknown"; ambiguous.connection = "unknown"}
      issues.push("Provider binding identity is advertised more than once")
      continue
    }
    seen.add(next.id)
    const previous = registry.entries.find(entry => entry.id === next.id)
    if (previous) {
      if (!sameBinding(previous, next)) {previous.resolution = "unknown"; previous.connection = "unknown"; issues.push("Provider assignment identity changed and requires explicit selection"); continue}
      if (previous.source.kind === "peer" && next.source.kind === "peer" && (previous.source.peerId !== next.source.peerId || previous.source.universeRoot !== next.source.universeRoot ||
          JSON.stringify(previous.source.worldIdentity) !== JSON.stringify(next.source.worldIdentity))) {
        previous.resolution = "unknown"; previous.connection = "unknown"; issues.push("Provider world identity changed and requires explicit admission"); continue
      }
      if (previous.source.kind === "native-bootstrap") continue
      if (next.source.kind === "atom" && JSON.stringify(previous.source) === JSON.stringify(next.source)) {
        next.connection = previous.connection
        next.checks = previous.checks
      }
      Object.assign(previous, next)
    } else {
      if (registry.entries.length >= 256) throw new Error("Provider registry is full")
      registry.entries.push(next)
    }
  }
  for (const entry of registry.entries) {
    const origin = entry.source
    if (origin.kind === "atom" && (origin.peerId === undefined ? input.graph === undefined : !(input.remoteGraphs ?? []).some(remote => remote.peerId === origin.peerId))) {
      entry.resolution = "unknown"
      entry.connection = "unknown"
    }
    if (origin.kind === "atom" && !seen.has(entry.id) && (origin.peerId === undefined ? input.graph !== undefined : (input.remoteGraphs ?? []).some(remote => remote.peerId === origin.peerId))) entry.connection = "disconnected"
    if (origin.kind === "peer" && input.peers !== undefined && !input.peers.some(peer => peer.peerId === origin.peerId && peer.connection === "connected")) entry.connection = "disconnected"
    if (origin.kind === "peer" && input.peers?.some(peer => peer.peerId === origin.peerId && peer.connection === "connected" && peer.descriptor === null)) {
      entry.resolution = "unknown"
      entry.connection = "unknown"
    }
    if (origin.kind === "peer") {
      const peer = input.peers?.find(peer => peer.peerId === origin.peerId)
      if (peer && peer.connection !== "connected") entry.connection = peer.connection
      if (peer?.descriptor && !seen.has(entry.id)) entry.connection = "disconnected"
    }
    if (entry.connection === "connected" && (entry.checks.checkedAt === null || input.now - entry.checks.checkedAt > staleAfterMs)) entry.connection = "stale"
  }
  registry.observations = observations
  if (input.peers !== undefined) {
    for (const peer of input.peers) {
      const member = {peerId: peer.peerId, target: peer.universeRoot === "workspace-capsule" ? "workspace" as const : peer.universeRoot === "intel-macos-chrome-studio" ? "mac" as const : "unknown" as const,
        worldIdentity: peer.worldIdentity ?? null, atomBindings: peer.atomBindings ?? [], connection: peer.connection, observation: peer.observation ?? "unknown" as const,
        checkedAt: peer.checkedAt, issue: peer.issue ?? null}
      const previous = registry.members.find(member => member.peerId === peer.peerId)
      if (previous?.worldIdentity && member.worldIdentity && (previous.worldIdentity.peerId !== member.worldIdentity.peerId || previous.worldIdentity.root !== member.worldIdentity.root || previous.worldIdentity.cutId !== member.worldIdentity.cutId)) {
        previous.connection = "unknown"; previous.observation = "gap"; previous.issue = "Peer world changed; explicit owner binding is required"
      } else if (previous) Object.assign(previous, member, !member.worldIdentity && previous.worldIdentity ? {worldIdentity: previous.worldIdentity, atomBindings: previous.atomBindings} : {})
      else registry.members.push(member)
    }
    for (const member of registry.members) if (!input.peers.some(peer => peer.peerId === member.peerId)) {member.connection = "disconnected"; member.observation = "unknown"}
  }
  registry.discovery = {localGraph: input.graph ? "exact" : "unknown", admittedPeers: input.peers === undefined ? "unknown" : "exact",
    remoteGraphs: (input.peers ?? []).map(peer => ({peerId: peer.peerId, root: peer.universeRoot,
      resolution: peer.connection === "disconnected" ? "disconnected" : (input.remoteGraphs ?? []).some(remote => remote.peerId === peer.peerId) ? "exact" : "unknown"})),
    issues: [...issues, ...(input.peers === undefined ? ["Admitted peer Oracle catalog is unavailable"] : [])]}
  registry.revision++
  return parseProviderRegistry(registry)
}
