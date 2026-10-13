/** Closed validation of public Provider descriptors and canonical registry JSON. @packageDocumentation */
import {parseMetaAddress} from "./graph"
import {BROWSER_PROVIDER_METAS, PROVIDER_DESCRIPTOR_SCHEMA, PROVIDER_REGISTRY_SCHEMA,
  type ProviderExecutionSettings, type ProviderBinding, type ProviderCapabilities, type ProviderCatalogEntry, type ProviderDescriptor, type ProviderRegistry, type ProviderSource} from "./providers"

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join(",") === keys.sort().join(",")
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)
const text = (value: unknown): value is string => typeof value === "string" && value.length <= 2048
const timestamp = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const browserMeta = (value: unknown): value is "chrome-studio" | "capsule" => BROWSER_PROVIDER_METAS.includes(value as "chrome-studio" | "capsule")
const stringOrNull = (value: unknown) => value === null || text(value)
const list = (value: unknown, maximum: number): value is unknown[] => Array.isArray(value) && value.length <= maximum

function capabilities(value: unknown): value is ProviderCapabilities {
  return object(value) && exact(value, ["modelTurn", "browserPreview", "browserControl"]) &&
    typeof value.modelTurn === "boolean" && typeof value.browserPreview === "boolean" && typeof value.browserControl === "boolean" &&
    (!value.browserControl || value.browserPreview)
}

function binding(value: Record<string, unknown>): boolean {
  return [value.id, value.service, value.host, value.remotePeerId, value.executorId].every(id) &&
    (value.assignmentId === undefined || id(value.assignmentId))
}

function source(value: unknown): value is ProviderSource {
  if (!object(value)) return false
  if (value.kind === "native-bootstrap") return exact(value, ["kind", "assignmentId", "remoteGraph"]) && id(value.assignmentId) && value.remoteGraph === "unknown"
  if (value.kind === "peer") return exact(value, ["kind", "peerId", "universeRoot", ...(value.worldIdentity === undefined ? [] : ["worldIdentity"]), ...(value.atomBindings === undefined ? [] : ["atomBindings"])]) &&
    id(value.peerId) && (value.universeRoot === null || typeof value.universeRoot === "string" && parseMetaAddress(value.universeRoot) !== null) &&
    (value.worldIdentity === undefined || world(value.worldIdentity)) && (value.atomBindings === undefined || atomBindings(value.atomBindings))
  return value.kind === "atom" && exact(value, ["kind", "root", "ref", "meta", ...(value.peerId === undefined ? [] : ["peerId"])]) &&
    typeof value.root === "string" && parseMetaAddress(value.root) !== null && typeof value.ref === "string" && /^atom:[A-Za-z0-9._:-]{1,128}$/.test(value.ref) &&
    browserMeta(value.meta) && (value.peerId === undefined || id(value.peerId))
}

function world(value: unknown): boolean {
  return object(value) && exact(value, ["peerId", "root", "cutId"]) && id(value.peerId) && typeof value.root === "string" && parseMetaAddress(value.root) !== null && id(value.cutId)
}
function atomBindings(value: unknown): boolean {
  return list(value, 64) && value.every(binding => object(binding) && exact(binding, ["worldIdentity", "root", "atomRef", "grants", "connectionEpoch", "photonCursor"]) &&
    world(binding.worldIdentity) && typeof binding.root === "string" && parseMetaAddress(binding.root) !== null && typeof binding.atomRef === "string" && /^atom:[1-9][0-9]*$/.test(binding.atomRef) &&
    JSON.stringify(binding.grants) === JSON.stringify(["provider.registry.read", "photon.observe"]) && id(binding.connectionEpoch) &&
    (binding.photonCursor === null || object(binding.photonCursor) && exact(binding.photonCursor, ["cutId", "sequence", "id"]) && id(binding.photonCursor.cutId) && timestamp(binding.photonCursor.sequence) && id(binding.photonCursor.id)))
}

function entry(value: unknown): value is ProviderCatalogEntry {
  return object(value) && exact(value, ["id", "service", "host", "remotePeerId", "executorId", "source", "resolution", "connection", "capabilities", "checks", ...(value.assignmentId === undefined ? [] : ["assignmentId"])]) &&
    binding(value) && source(value.source) && ["exact", "unknown"].includes(String(value.resolution)) &&
    ["connected", "disconnected", "stale", "unknown"].includes(String(value.connection)) && capabilities(value.capabilities) &&
    object(value.checks) && exact(value.checks, ["status", "checkedAt", "message"]) &&
    ["unknown", "passed", "failed"].includes(String(value.checks.status)) &&
    (value.checks.checkedAt === null || timestamp(value.checks.checkedAt)) && stringOrNull(value.checks.message)
}

/** Closed public descriptor; unsupported keys never become executable operations. */
export function parseProviderDescriptor(value: unknown): ProviderDescriptor {
  if (!object(value) || !exact(value, ["schema", "version", "bindings"]) || value.schema !== PROVIDER_DESCRIPTOR_SCHEMA || value.version !== 1 ||
      !list(value.bindings, 128) || !value.bindings.every(item => object(item) &&
        exact(item, ["id", "service", "host", "remotePeerId", "executorId", "capabilities", ...(item.assignmentId === undefined ? [] : ["assignmentId"])]) && binding(item) && capabilities(item.capabilities)) ||
      new Set(value.bindings.map(item => (item as ProviderBinding).id)).size !== value.bindings.length) throw new Error("Invalid Provider descriptor")
  return structuredClone(value) as unknown as ProviderDescriptor
}

/** Empty registry is a valid unknown observation, not an implicit native fallback. */
export function createProviderRegistry(entries: ProviderCatalogEntry[] = []): ProviderRegistry {
  return parseProviderRegistry({schema: PROVIDER_REGISTRY_SCHEMA, version: 1, revision: 0, settings: {selectedId: null}, entries,
    observations: [], discovery: {localGraph: "unknown", admittedPeers: "unknown", remoteGraphs: [], issues: []}, requests: [], members: []})
}

/** Fail-closed Mass decoding. Malformed retained state is never silently replaced. */
export function parseProviderRegistry(value: unknown): ProviderRegistry {
  const fail = () => {throw new Error("Invalid Provider registry Mass")}
  if (!object(value) || !exact(value, ["schema", "version", "revision", "settings", "entries", "observations", "discovery", "requests", ...(value.members === undefined ? [] : ["members"])]) ||
      value.schema !== PROVIDER_REGISTRY_SCHEMA || value.version !== 1 || !timestamp(value.revision) || !object(value.settings) ||
      !exact(value.settings, ["selectedId", ...(value.settings.configuration === undefined ? [] : ["configuration", "connectionBindings", "connectionChecks"])]) || !(value.settings.selectedId === null || id(value.settings.selectedId)) ||
      !list(value.entries, 256) || !value.entries.every(entry) || new Set(value.entries.map(item => item.id)).size !== value.entries.length ||
      !list(value.observations, 256) || !object(value.discovery) || !list(value.requests, 1024)) return fail()
  if (value.settings.configuration !== undefined) {
    const config = parseProviderExecutionSettings(value.settings.configuration)
    if (!object(value.settings.connectionBindings) || !object(value.settings.connectionChecks) ||
        !exact(value.settings.connectionBindings, config.connections.map(row => row.id)) || !exact(value.settings.connectionChecks, config.connections.map(row => row.id))) return fail()
    for (const row of config.connections) {
      const target = value.settings.connectionBindings[row.id], check = value.settings.connectionChecks[row.id]
      if (!(target === null || id(target) && value.entries.some(entry => entry.id === target)) || !object(check) || !exact(check, ["status", "checkedAt", "message"]) ||
          !["unknown", "passed", "failed"].includes(String(check.status)) || !(check.checkedAt === null || timestamp(check.checkedAt)) || !stringOrNull(check.message)) return fail()
    }
  }
  const selectedId = value.settings.selectedId
  const revision = value.revision
  if (selectedId !== null && !value.entries.some(item => item.id === selectedId)) return fail()
  for (const observation of value.observations) {
    if (!object(observation) || !exact(observation, ["source", "state", "status", "resolution", "bindingIds", "issues"]) || !source(observation.source) || observation.source.kind !== "atom" ||
        !stringOrNull(observation.state) || !stringOrNull(observation.status) || !["exact", "unknown"].includes(String(observation.resolution)) ||
        !list(observation.bindingIds, 128) || !observation.bindingIds.every(id) || !list(observation.issues, 32) || !observation.issues.every(text)) return fail()
  }
  const discovery = value.discovery
  if (!exact(discovery, ["localGraph", "admittedPeers", "remoteGraphs", "issues"]) || !["exact", "unknown"].includes(String(discovery.localGraph)) ||
      !["exact", "unknown"].includes(String(discovery.admittedPeers)) || !list(discovery.remoteGraphs, 64) || !list(discovery.issues, 32) || !discovery.issues.every(text)) return fail()
  if (!discovery.remoteGraphs.every(item => object(item) && exact(item, ["peerId", "root", "resolution"]) && id(item.peerId) &&
      (item.root === null || typeof item.root === "string" && parseMetaAddress(item.root) !== null) && ["exact", "unknown", "disconnected"].includes(String(item.resolution)))) return fail()
  if (!value.requests.every(item => object(item) && exact(item, ["id", "revision", ...(item.register === undefined ? [] : ["register"]), ...(item.configureHash === undefined ? [] : ["configureHash"]), ...(item.check === undefined ? [] : ["check"])]) && id(item.id) && timestamp(item.revision) && item.revision <= revision &&
      (item.register === undefined || object(item.register) && exact(item.register, ["id", "service", "host", "remotePeerId", "executorId", ...(item.register.assignmentId === undefined ? [] : ["assignmentId"])]) && binding(item.register)) && (item.configureHash === undefined || typeof item.configureHash === "string" && /^[a-f0-9]{64}$/.test(item.configureHash)) && (item.check === undefined || id(item.check))) ||
      new Set(value.requests.map(item => (item as {id: string}).id)).size !== value.requests.length) return fail()
  if (value.members !== undefined && (!list(value.members, 64) || !value.members.every(member => object(member) && exact(member, ["peerId", "target", "worldIdentity", "atomBindings", "connection", "observation", "checkedAt", "issue"]) &&
      id(member.peerId) && ["workspace", "vpn", "android", "device", "server", "mac", "unknown"].includes(String(member.target)) && (member.worldIdentity === null || world(member.worldIdentity)) && atomBindings(member.atomBindings) &&
      ["connected", "disconnected", "stale", "unknown"].includes(String(member.connection)) && ["current", "stale", "gap", "unknown"].includes(String(member.observation)) && timestamp(member.checkedAt) && stringOrNull(member.issue)))) return fail()
  return structuredClone({...value, members: value.members ?? []}) as unknown as ProviderRegistry
}


/** Закрытая конфигурация HUD; секреты, команды и неизвестные поля отклоняются до Process. */
export function parseProviderExecutionSettings(value: unknown): ProviderExecutionSettings {
  const fail = () => {throw new Error("Invalid Provider execution settings")}
  const only = (row: Record<string, unknown>, keys: string[]) => Object.keys(row).every(key => keys.includes(key))
  const nonempty = (value: unknown) => text(value) && value.trim().length > 0
  const ssh = (value: unknown, paths: boolean, docker: boolean): boolean => object(value) && only(value, ["host", "user", "port", ...(paths ? ["providerRoot", "storageRoot"] : []), ...(docker ? ["dockerContext"] : [])]) &&
    nonempty(value.host) && (value.user === undefined || nonempty(value.user)) && (value.port === undefined || Number.isSafeInteger(value.port) && Number(value.port) >= 1 && Number(value.port) <= 65535) &&
    (!paths || [value.providerRoot, value.storageRoot].every(path => typeof path === "string" && path.startsWith("/") && text(path))) && (value.dockerContext === undefined || nonempty(value.dockerContext))
  const url = (value: unknown): boolean => {
    if (!nonempty(value)) return false
    try {const parsed = new URL(value as string); return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.hash && !parsed.search} catch {return false}
  }
  if (!object(value) || !exact(value, ["schemaVersion", "revision", "connections", "general", "types"]) || value.schemaVersion !== 1 || !timestamp(value.revision) || !list(value.connections, 256)) return fail()
  for (const row of value.connections) {
    if (!object(row) || !id(row.id) || !nonempty(row.label) || typeof row.enabled !== "boolean" || !["codex", "ollama", "capsule", "chrome-studio"].includes(String(row.provider)) ||
        !only(row, ["id", "label", "enabled", "provider", "peer", ...(row.provider === "codex" ? ["ssh"] : row.provider === "ollama" ? ["endpoint"] : ["endpoint", "ssh"])])) return fail()
    if (row.peer !== undefined && (!object(row.peer) || !exact(row.peer, ["peerId", "executorId"]) || !id(row.peer.peerId) || !id(row.peer.executorId) || row.ssh !== undefined)) return fail()
    if (row.ssh !== undefined && !ssh(row.ssh, true, row.provider === "capsule")) return fail()
    if (row.provider !== "codex") {
      if (!object(row.endpoint) || !exact(row.endpoint, row.provider === "ollama" ? ["url", ...(row.endpoint.ssh === undefined ? [] : ["ssh"])] : ["url", "profile", "service"]) || !(url(row.endpoint.url) || row.peer !== undefined && row.endpoint.url === "")) return fail()
      if (row.provider === "ollama") {if (row.endpoint.ssh !== undefined && (row.peer !== undefined || !ssh(row.endpoint.ssh, false, false))) return fail()}
      else if (!(nonempty(row.endpoint.profile) || row.peer !== undefined && row.endpoint.profile === "") || !["qwen", "deepseek", "chatgpt"].includes(String(row.endpoint.service))) return fail()
    }
  }
  if (new Set(value.connections.map(row => (row as {id: string}).id)).size !== value.connections.length) return fail()
  const connections = value.connections
  const selection = (row: unknown): boolean => object(row) && only(row, ["connectionId", "model", "thoughtLevel", "approvalMode"]) &&
    (row.connectionId === undefined || id(row.connectionId) && connections.some(connection => (connection as {id: string}).id === row.connectionId)) &&
    (row.model === undefined || nonempty(row.model)) && (row.thoughtLevel === undefined || nonempty(row.thoughtLevel)) &&
    (row.approvalMode === undefined || row.approvalMode === "ask" || row.approvalMode === "scoped-autonomous")
  if (!selection(value.general) || !object(value.types) || !only(value.types, ["Project", "Repo", "Domain", "Cluster", "Container", "Component"]) || !Object.values(value.types).every(selection)) return fail()
  return structuredClone(value) as unknown as ProviderExecutionSettings
}
