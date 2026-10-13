import type {AtomContext, AtomBrowserConnection, AtomProvidersSnapshot, AtomProviderRegistryError, ProviderBrowserTarget} from "@metafor/agent/atom"
import type {OfficeBounds} from "@metafor/agent/office-layout"
import type {AtomRef, Graph} from "@metafor/types/metafor/graph"
import type {AgentConfigurationObservation} from "@metafor/types/metafor/agent-observation"
import type {ProfileCatalogReceipt, ProfileIntentRequest} from "@metafor/types/metafor/profile-intent"

/** Read-only browser binding; transport, identity grants и канонические snapshots принадлежат передавшему source. */
export type AgentWorkspaceSource = Readonly<{
  getSnapshot(): AgentWorkspaceSnapshot
  subscribe(listener: () => void): () => void
  connectSlot?(slotRef: AtomRef, signal: AbortSignal): Promise<void>
  profileIntent?(request: ProfileIntentRequest, signal: AbortSignal): Promise<void>
  connectProviderBrowser?(target: ProviderBrowserTarget, signal: AbortSignal): Promise<AtomBrowserConnection>
}>
/** A real declared ordinary slot; it is not itself an Agent or an implicit model request. */
export type AgentConnectableSlot = Readonly<{
  ref: AtomRef
  meta: "@metafor/agent-slot"
  owner: Readonly<{ref: AtomRef; meta: string}> | null
  enabled: boolean
  state: string | null
  configuration: AgentConfigurationObservation
}>
/** Один fixed prism owning Atom и только явно подключённые Agent. */
export type AgentOfficeSnapshot = Readonly<{
  id: string
  owner: AtomRef
  label: string
  bounds: OfficeBounds
  agents: readonly Readonly<{id: string; atom: AtomContext}>[]
}>
/** Отсутствие подключённых Agent является обычным ready состоянием, не поводом создавать AI. */
export type AgentWorkspaceSnapshot = Readonly<{
  status: "loading" | "ready" | "error"
  error?: string | null
  /** Последний валидный полный Graph, включая Atoms без Agent; null до первого чтения. */
  graph: Graph | null
  /** Назначенный host opaque address; не causal cut. */
  verseId: string | null
  observedWorld: Readonly<{root: string; cutId: string}> | null
  offices: readonly AgentOfficeSnapshot[]
  providerRegistries?: readonly AtomProvidersSnapshot[]
  providerRegistryErrors?: readonly AtomProviderRegistryError[]
  connectableSlots?: readonly AgentConnectableSlot[]
  profiles?: ProfileCatalogReceipt | null
  profileError?: string | null
}>

