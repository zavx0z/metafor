/**
 * Canonical [Provider registry](../../standard/provider/README.md), distinct from
 * native launch configuration, credentials and browser-control handles.
 * @packageDocumentation
 */
import type {AtomRef, MetaAddress, RuntimeMass} from "./graph"
import type {OracleWorldIdentity, ProviderAtomPeerBinding} from "./peer-oracle"

export const PROVIDER_META = "@metafor/provider" as const
export const PROVIDER_REGISTRY_SCHEMA = "metafor/provider-registry/v1" as const
export const PROVIDER_DESCRIPTOR_SCHEMA = "metafor/provider-descriptor/v1" as const
export const PROVIDER_REGISTRY_KEY = "registry" as const
export const BROWSER_PROVIDER_METAS = ["chrome-studio", "capsule"] as const
export const READ_PROVIDERS_METHOD = "readProviders" as const
export const PROVIDERS_OBSERVATION_SCHEMA = "metafor/providers/v1" as const

/** Public assignment tuple. Native authentication and transport endpoints are host-owned. */
export interface ProviderBinding {
  id: string
  service: string
  host: string
  remotePeerId: string
  executorId: string
  assignmentId?: string
}

/** Явный запрос обнаружения; register добавляет одно назначение только после проверки native владельцем. */
export interface ProviderDiscoveryRequest {
  id: string
  register?: ProviderBinding
  configure?: ProviderExecutionSettings
  check?: string
}

/** Настройки подключений принадлежат Mass Provider; параметры не выдают native capability. */
export type ProviderExecutionSelection = Readonly<{connectionId?: string, model?: string, thoughtLevel?: string, approvalMode?: "ask" | "scoped-autonomous"}>
export type ProviderConnectionSsh = Readonly<{host: string, user?: string, port?: number, providerRoot: string, storageRoot: string, dockerContext?: string}>
export type ProviderConnection = Readonly<{id: string, label: string, enabled: boolean, peer?: Readonly<{peerId: string, executorId: string}>}> & (
  Readonly<{provider: "codex", ssh?: ProviderConnectionSsh}> |
  Readonly<{provider: "ollama", endpoint: Readonly<{url: string, ssh?: Readonly<{host: string, user?: string, port?: number}>}>}> |
  Readonly<{provider: "capsule" | "chrome-studio", endpoint: Readonly<{url: string, profile: string, service: "qwen" | "deepseek" | "chatgpt"}>, ssh?: ProviderConnectionSsh}>
)
export interface ProviderExecutionSettings {
  schemaVersion: 1
  revision: number
  connections: readonly ProviderConnection[]
  general: ProviderExecutionSelection
  types: Readonly<Partial<Record<"Project" | "Repo" | "Domain" | "Cluster" | "Container" | "Component", ProviderExecutionSelection>>>
}

/** Declared operations are not grants and do not prove authentication or model readiness. */
export interface ProviderCapabilities {
  modelTurn: boolean
  browserPreview: boolean
  browserControl: boolean
}

export type ProviderSource =
  | {kind: "atom", root: MetaAddress, ref: AtomRef, meta: "chrome-studio" | "capsule", peerId?: string}
  | {kind: "native-bootstrap", assignmentId: string, remoteGraph: "unknown"}
  | {kind: "peer", peerId: string, universeRoot: MetaAddress | null, worldIdentity?: OracleWorldIdentity, atomBindings?: ProviderAtomPeerBinding[]}

export interface ProviderCheck {
  status: "unknown" | "passed" | "failed"
  checkedAt: number | null
  message: string | null
}

/** Stored canonical assignment plus separately observed connection and checks. */
export interface ProviderCatalogEntry extends ProviderBinding {
  source: ProviderSource
  resolution: "exact" | "unknown"
  connection: "connected" | "disconnected" | "stale" | "unknown"
  capabilities: ProviderCapabilities
  checks: ProviderCheck
}

/** A browser owner advertises this JSON in its declared `providerCapabilities` string Field. */
export interface ProviderDescriptor {
  schema: typeof PROVIDER_DESCRIPTOR_SCHEMA
  version: 1
  bindings: Array<ProviderBinding & {capabilities: ProviderCapabilities}>
}

/** Observations retain exact Atom identity/state, never invent an Atom for a native process. */
export interface ProviderAtomObservation {
  source: Extract<ProviderSource, {kind: "atom"}>
  state: string | null
  status: string | null
  resolution: "exact" | "unknown"
  bindingIds: string[]
  issues: string[]
}

export interface ProviderDiscoveryResolution {
  localGraph: "exact" | "unknown"
  admittedPeers: "exact" | "unknown"
  remoteGraphs: Array<{peerId: string, root: MetaAddress | null, resolution: "exact" | "unknown" | "disconnected"}>
  issues: string[]
}

/** Sole durable registry. Changes are Process proposals; publication follows Boundary commit. */
export interface ProviderRegistry {
  schema: typeof PROVIDER_REGISTRY_SCHEMA
  version: 1
  revision: number
  settings: {selectedId: string | null, configuration?: ProviderExecutionSettings, connectionBindings?: Record<string, string | null>, connectionChecks?: Record<string, ProviderCheck>}
  entries: ProviderCatalogEntry[]
  observations: ProviderAtomObservation[]
  discovery: ProviderDiscoveryResolution
  /** Старые записи без register остаются обычными запросами обнаружения. */
  requests: Array<{id: string, revision: number, register?: ProviderBinding, configureHash?: string, check?: string}>
  members: ProviderMember[]
}

/** Provisioned world observation. A target name does not prove a native installation adapter exists. */
export interface ProviderMember {
  peerId: string
  target: "workspace" | "vpn" | "android" | "device" | "server" | "mac" | "unknown"
  worldIdentity: OracleWorldIdentity | null
  atomBindings: ProviderAtomPeerBinding[]
  connection: "connected" | "disconnected" | "stale" | "unknown"
  observation: "current" | "stale" | "gap" | "unknown"
  checkedAt: number
  issue: string | null
}

/** A host/admission adapter supplies already-authorized observations, never caller-selected peers. */
export interface ProviderPeerObservation {
  peerId: string
  connection: "connected" | "disconnected" | "stale" | "unknown"
  universeRoot: MetaAddress | null
  descriptor: ProviderDescriptor | null
  checkedAt: number
  worldIdentity?: OracleWorldIdentity
  atomBindings?: ProviderAtomPeerBinding[]
  observation?: ProviderMember["observation"]
  issue?: string | null
}

/** Trusted full-root projection of only Provider-owned registry Mass, never arbitrary Mass keys. */
export interface ReadProvidersReceipt {
  schema: typeof PROVIDERS_OBSERVATION_SCHEMA
  version: 1
  root: MetaAddress
  providers: Array<{
    ref: AtomRef
    meta: MetaAddress
    state: string | null
    discoveryStatus: string | null
    registryMass: RuntimeMass | null
    registry: {resolution: "exact" | "unknown", value: ProviderRegistry | null, issues: string[]}
  }>
}
