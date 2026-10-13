import {createHash} from "node:crypto"
import {PROVIDER_META, PROVIDER_DESCRIPTOR_SCHEMA, type ProviderBinding, type ProviderCatalogEntry, type ProviderPeerObservation, type ProviderRegistry} from "@metafor/types/metafor/providers"
import {PROVIDER_PEERS_READ_METHOD} from "@metafor/types/metafor/peer-oracle"
import {validateGraph, type Graph} from "@metafor/types/metafor/graph"
import type {OracleProcessEnvironment} from "@metafor/types/metafor/environment"
import {createProviderRegistry, parseProviderRegistry, reconcileProviderRegistry} from "./catalog"
import {checkProviderBinding, checkProviderRegistration, resolveConfiguredProvider} from "./driver"
import {parseProviderDiscoveryRequest, sameProviderBinding} from "./protocol"

type RegistryMass = {readText(): Promise<string>, write(value: unknown): Promise<void>}

/** A trusted admission adapter supplies only public Oracle observations, never telemetry. */
export interface ProviderDiscoverySource {
  read(signal: AbortSignal): Promise<{peers: readonly ProviderPeerObservation[], remoteGraphs: Array<{peerId: string, graph: Graph}>}>
}

export interface ProviderDiscoverInput {
  request: string | null
  bootstrap?: string | null
  mass: {registry: RegistryMass}
  environment?: OracleProcessEnvironment | undefined
  source?: ProviderDiscoverySource
  signal: AbortSignal
  now?: () => number
  self?: {atom: string}
  registryMode?: string
  check?: typeof checkProviderBinding
  registrationCheck?: typeof checkProviderRegistration
  resolveConnection?: typeof resolveConfiguredProvider
}

/**
 * Autonomous read-only discovery; native seed is consumed only at first Mass
 * initialization. Missing Graph/admission capabilities are recorded as unknown.
 * No prompt, browser lifecycle or external mutable operation occurs here.
 * [Tests](./catalog.spec.ts) exercise restoration and exact owner discovery.
 */
export default async function discoverProviders(input: ProviderDiscoverInput) {
  let discoveryAckId = ""
  const providerRef = input.self && /^[1-9][0-9]*$/.test(input.self.atom) ? `atom:${input.self.atom}` : null
  try {
    input.signal.throwIfAborted()
    if (input.request === null) return {discoveryRequest: null, discoveryAck: true, discoveryAckId, discoveryResponse: null, discoveryError: null, discoveryStatus: "idle", registryRevision: null, providerRef}
    const request = parseProviderDiscoveryRequest(JSON.parse(input.request))
    discoveryAckId = request.id
    const bytes = await input.mass.registry.readText()
    if (input.registryMode !== undefined && input.registryMode !== "owner" && input.registryMode !== "executor") throw new Error("Invalid Provider registry ownership mode")
    if (input.registryMode === "executor") {
      if (request.register || request.configure || request.check) throw new Error("Executor Provider cannot register a binding in its owner's registry")
      const registry = bytes ? parseProviderRegistry(JSON.parse(bytes)) : null
      return {discoveryRequest: null, discoveryAck: true, discoveryAckId, discoveryResponse: registry ? JSON.stringify({schema: "metafor/provider-discovery/v1", version: 1, registryRevision: registry.revision}) : null,
        discoveryError: null, discoveryStatus: registry ? "observed" : "partial", registryRevision: registry?.revision ?? null, providerRef}
    }
    let registry: ProviderRegistry
    if (bytes) registry = parseProviderRegistry(JSON.parse(bytes))
    else {
      const seed: unknown = input.bootstrap ? JSON.parse(input.bootstrap) : []
      if (!Array.isArray(seed)) throw new Error("Invalid Provider bootstrap entries")
      registry = createProviderRegistry(seed as ProviderCatalogEntry[])
      if (registry.entries.some(entry => entry.source.kind !== "native-bootstrap")) throw new Error("Provider bootstrap requires explicit native provenance")
      if (input.bootstrap !== null && input.bootstrap !== undefined) registry.requests.push({id: "bootstrap-seed", revision: registry.revision})
    }
    const configureHash = request.configure ? createHash("sha256").update(JSON.stringify(request.configure)).digest("hex") : undefined
    const previous = registry.requests.find(entry => entry.id === discoveryAckId)
    if (previous) {
      if (!sameProviderBinding(previous.register ?? null, request.register ?? null) || previous.configureHash !== configureHash || previous.check !== request.check) throw new Error("Provider discovery request identity conflicts with earlier content")
      return {...receipt(discoveryAckId, previous.revision, registry), providerRef}
    }
    if (registry.requests.length >= 1024) throw new Error("Provider discovery request ledger is full")
    if (request.configure || request.check) {
      if (request.configure && request.configure.revision !== (registry.settings.configuration?.revision ?? 0)) throw new Error("Конфигурация Provider изменилась; обновите настройки")
      if (request.check && !registry.settings.configuration) {
        const entry = registry.entries.find(row => row.id === request.check)
        if (!entry) throw new Error("Подключение отсутствует в Provider")
        try {Object.assign(entry, await (input.registrationCheck ?? checkProviderRegistration)(entry, input.signal))}
        catch {input.signal.throwIfAborted(); entry.connection = "unknown"; entry.checks = {status: "failed", checkedAt: input.now?.() ?? Date.now(), message: "Назначение хоста или transport admission не подтверждены"}}
        registry.revision++
        registry.requests.push({id: request.id, revision: registry.revision, check: request.check})
        await input.mass.registry.write(parseProviderRegistry(registry))
        input.signal.throwIfAborted()
        return {...receipt(discoveryAckId, registry.revision, registry), providerRef}
      }
      const config = request.configure ?? registry.settings.configuration
      if (!config) throw new Error("У Provider нет сохранённой конфигурации подключений")
      const bindings = request.configure ? {} as Record<string, string | null> : {...registry.settings.connectionBindings}
      const checks = request.configure ? {} as NonNullable<ProviderRegistry["settings"]["connectionChecks"]> : {...registry.settings.connectionChecks}
      const targets = request.check ? config.connections.filter(row => row.id === request.check) : config.connections
      if (request.check && targets.length !== 1) throw new Error("Подключение отсутствует в конфигурации Provider")
      for (const connection of targets) {
        bindings[connection.id] = null
        checks[connection.id] = {status: "unknown", checkedAt: null, message: connection.enabled ? "Назначение ещё не проверено" : "Подключение выключено"}
        if (!connection.enabled) continue
        try {
          const binding = await (input.resolveConnection ?? resolveConfiguredProvider)(connection, registry.entries)
          const previous = registry.entries.find(row => row.id === binding.id)
          if (previous && !sameProviderBinding(previous, binding)) throw new Error("Identity назначения Provider изменилась")
          if (request.check) {
            const checked = await (input.registrationCheck ?? checkProviderRegistration)(binding, input.signal)
            input.signal.throwIfAborted()
            if (checked.connection !== "connected" || checked.checks.status === "failed") throw new Error("Native назначение недоступно")
            const entry: ProviderCatalogEntry = {...binding, source: previous?.source ?? {kind: "native-bootstrap", assignmentId: binding.id, remoteGraph: "unknown"}, resolution: "exact", ...checked}
            if (previous) Object.assign(previous, entry)
            else registry.entries.push(entry)
            checks[connection.id] = checked.checks
          } else {
            if (!previous) registry.entries.push({...binding, source: {kind: "native-bootstrap", assignmentId: binding.id, remoteGraph: "unknown"}, resolution: "exact", connection: "unknown",
              capabilities: {modelTurn: false, browserPreview: false, browserControl: false}, checks: {status: "unknown", checkedAt: null, message: "Назначение ещё не проверено"}})
            const old = registry.settings.configuration?.connections.find(row => row.id === connection.id)
            const transport = (row: typeof connection) => {const {label, enabled, ...value} = row; return value}
            if (old && JSON.stringify(transport(old)) === JSON.stringify(transport(connection)) && registry.settings.connectionBindings?.[connection.id] === binding.id) {
              checks[connection.id] = registry.settings.connectionChecks?.[connection.id] ?? checks[connection.id]!
            } else if (!registry.settings.configuration && previous) checks[connection.id] = previous.checks
          }
          bindings[connection.id] = binding.id
        } catch {
          input.signal.throwIfAborted()
          checks[connection.id] = {status: "failed", checkedAt: input.now?.() ?? Date.now(), message: "Назначение хоста или transport admission не подтверждены"}
        }
      }
      registry.revision++
      registry.settings = {selectedId: config.general.connectionId ? bindings[config.general.connectionId] ?? null : null,
        configuration: {...config, revision: request.configure ? request.configure.revision + 1 : config.revision}, connectionBindings: bindings, connectionChecks: checks}
      registry.requests.push({id: request.id, revision: registry.revision, ...(request.configure ? {configureHash: configureHash!} : {check: request.check!})})
      if (Buffer.byteLength(JSON.stringify(registry)) > 1024 * 1024) throw new Error("Provider registry exceeds its retained limit")
      await input.mass.registry.write(parseProviderRegistry(registry))
      input.signal.throwIfAborted()
      return {...receipt(discoveryAckId, registry.revision, registry), providerRef}
    }
    if (request.register) {
      const binding = request.register
      const existing = registry.entries.find(entry => entry.id === binding.id)
      if (existing && !sameProviderBinding(existing, binding)) throw new Error("Provider binding identity conflicts with the established registry")
      const checked = binding.id === "legacy-codex" && input.check
        ? {...await input.check(binding, input.signal), capabilities: {modelTurn: true, browserPreview: false, browserControl: false}}
        : await (input.registrationCheck ?? checkProviderRegistration)(binding, input.signal)
      input.signal.throwIfAborted()
      if (checked.connection !== "connected" || checked.checks.status === "failed") throw new Error("Native Provider assignment was not admitted")
      const entry: ProviderCatalogEntry = {...binding, source: existing?.source ?? {kind: "native-bootstrap", assignmentId: binding.id, remoteGraph: "unknown"},
        resolution: "exact", capabilities: checked.capabilities, connection: checked.connection, checks: checked.checks}
      if (existing) Object.assign(existing, entry)
      else registry.entries.push(entry)
      registry.revision++
      registry.requests.push({id: discoveryAckId, revision: registry.revision, register: binding})
      await input.mass.registry.write(parseProviderRegistry(registry))
      input.signal.throwIfAborted()
      return {...receipt(discoveryAckId, registry.revision, registry), providerRef}
    }
    let graph: Graph | undefined
    const issues: string[] = []
    if (input.environment) {
      try {
        const snapshot = await input.environment.read()
        if (snapshot.actor.meta !== PROVIDER_META) throw new Error("Provider Environment belongs to another Atom")
        const validated = validateGraph(snapshot.graph)
        if (!validated.ok) throw new Error("Invalid Provider Graph")
        graph = validated.value
        if (!input.source && snapshot.operations.some(operation => operation.name === PROVIDER_PEERS_READ_METHOD)) {
          const observed = await input.environment.call(PROVIDER_PEERS_READ_METHOD, {})
          if (observed.resolution === "exact") input.source = {async read() {
            return {remoteGraphs: [], peers: observed.peers.map(peer => ({peerId: peer.peerId,
              connection: peer.connection,
              universeRoot: peer.world?.root ?? null, checkedAt: peer.checkedAt,
              ...(peer.world ? {worldIdentity: peer.world.worldIdentity} : {}), atomBindings: peer.bindings, observation: peer.observation, issue: peer.issue,
              descriptor: peer.catalog && peer.connection === "connected" ? {schema: PROVIDER_DESCRIPTOR_SCHEMA, version: 1,
                bindings: peer.catalog.providers.flatMap(provider => provider.registry.resolution === "exact" && provider.registry.value ? provider.registry.value.entries.filter(entry => entry.resolution === "exact" && entry.connection === "connected").map(entry => ({
                  id: entry.id, service: entry.service, host: entry.host, remotePeerId: entry.remotePeerId, executorId: entry.executorId,
                  ...(entry.assignmentId === undefined ? {} : {assignmentId: entry.assignmentId}), capabilities: entry.capabilities,
                })) : [])} : null,
            }))}
          }}
        }
      } catch {issues.push("Local Graph observation is unavailable")}
    } else issues.push("Local Graph capability is not assigned")
    let admitted: Awaited<ReturnType<ProviderDiscoverySource["read"]>> | undefined
    if (input.source) {
      try {admitted = await input.source.read(input.signal)}
      catch {issues.push("Admitted peer Oracle discovery is unavailable")}
    }
    input.signal.throwIfAborted()
    registry = reconcileProviderRegistry({registry, ...(graph ? {graph} : {}),
      ...(admitted ? {peers: admitted.peers, remoteGraphs: admitted.remoteGraphs} : {}), now: input.now?.() ?? Date.now()})
    const candidates = registry.entries.filter(entry => entry.resolution === "exact" && (entry.capabilities.modelTurn || entry.capabilities.browserPreview) && entry.connection !== "disconnected" && (entry.source.kind !== "peer" || entry.connection === "connected"))
    for (let offset = 0; offset < Math.min(candidates.length, 16); offset += 4) await Promise.all(candidates.slice(offset, offset + 4).map(async entry => {
      const binding: ProviderBinding = {id: entry.id, service: entry.service, host: entry.host, remotePeerId: entry.remotePeerId, executorId: entry.executorId,
        ...(entry.assignmentId === undefined ? {} : {assignmentId: entry.assignmentId})}
      try {Object.assign(entry, await (entry.capabilities.browserPreview && (input.registrationCheck || !input.check)
        ? (input.registrationCheck ?? checkProviderRegistration)(binding, input.signal)
        : (input.check ?? checkProviderBinding)(binding, input.signal)))}
      catch {entry.connection = "unknown"; entry.checks = {status: "failed", checkedAt: input.now?.() ?? Date.now(), message: "Assigned transport/executor admission check failed; no model prompt was sent"}}
    }))
    registry.discovery.issues.push(...issues)
    registry.requests.push({id: discoveryAckId, revision: registry.revision})
    await input.mass.registry.write(registry)
    input.signal.throwIfAborted()
    return {...receipt(discoveryAckId, registry.revision, registry), providerRef}
  } catch (error) {
    return {discoveryAck: true, discoveryAckId, discoveryResponse: null,
      discoveryError: error instanceof Error ? error.message : "Provider discovery failed", discoveryStatus: "failed", registryRevision: null, discoveryRequest: null, providerRef}
  }
}

function receipt(discoveryAckId: string, revision: number, registry: ProviderRegistry) {
  return {discoveryRequest: null, discoveryAck: true, discoveryAckId,
    discoveryResponse: JSON.stringify({schema: "metafor/provider-discovery/v1", version: 1, registryRevision: revision}), discoveryError: null,
    discoveryStatus: registry.discovery.localGraph === "exact" && registry.discovery.admittedPeers === "exact" ? "observed" : "partial",
    registryRevision: registry.revision}
}

/** One-shot late bootstrap after root initial Fields arrive; established registry entries are never overwritten. */
export async function bootstrap(input: Pick<ProviderDiscoverInput, "bootstrap" | "registryMode" | "mass" | "signal" | "self">) {
  const providerRef = input.self && /^[1-9][0-9]*$/.test(input.self.atom) ? `atom:${input.self.atom}` : null
  try {
    input.signal.throwIfAborted()
    if (input.registryMode === "executor") return {bootstrapApplied: true, bootstrapError: null, discoveryRequest: null, discoveryAck: true, providerRef}
    if (input.registryMode !== undefined && input.registryMode !== "owner") throw new Error("Invalid Provider registry mode")
    const text = await input.mass.registry.readText()
    const registry = text ? parseProviderRegistry(JSON.parse(text)) : createProviderRegistry()
    if (!registry.requests.some(request => request.id === "bootstrap-seed")) {
      if (registry.entries.length) throw new Error("Provider bootstrap conflicts with an established registry")
      const seed: unknown = JSON.parse(input.bootstrap ?? "null")
      if (!Array.isArray(seed)) throw new Error("Invalid Provider bootstrap entries")
      const validated = createProviderRegistry(seed as ProviderCatalogEntry[])
      if (validated.entries.some(entry => entry.source.kind !== "native-bootstrap")) throw new Error("Provider bootstrap requires explicit native provenance")
      registry.entries = validated.entries
      registry.revision++
      registry.requests.push({id: "bootstrap-seed", revision: registry.revision})
      await input.mass.registry.write(registry)
    }
    input.signal.throwIfAborted()
    return {bootstrapApplied: true, bootstrapError: null, discoveryRequest: JSON.stringify({id: "bootstrap-native"}), discoveryAck: false, providerRef}
  } catch (error) {
    return {bootstrapApplied: false, bootstrapError: error instanceof Error ? error.message : "Provider bootstrap failed", discoveryRequest: null, discoveryAck: true, providerRef}
  }
}
