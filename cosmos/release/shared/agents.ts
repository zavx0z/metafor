/** Browser wire adapter of existing public Oracle operations, not a second registry. */
import type {AgentObservation, AgentConfigurationObservation} from "@metafor/types/metafor/agent-observation"
import type {AtomRef, Graph, MetaAddress, RuntimeAtom, RuntimeNode} from "@metafor/types/metafor/graph"
import {productRoutePath} from "./product-route"
import type {EnergyMassResultReadReceipt, MetaCausalFrontier, MetaFieldValueApplyReceipt} from "shared/protocol/metafor/observation"
import type {ProviderRegistry} from "@metafor/types/metafor/providers"
import type {ProfileCatalogReceipt} from "@metafor/types/metafor/profile-intent"

export const AGENT_UI_PATH = "/agents" as const
export const AGENT_UI_SCHEMA = "cosmos:agents/v1" as const
export const AGENT_UI_TASK_SCHEMA = "cosmos:agents/task/v1" as const
export const AGENT_UI_PROVIDER_PATH = "/agents/provider" as const
export const AGENT_UI_PROVIDER_SCHEMA = "cosmos:agents/provider/v1" as const
export const AGENT_UI_CONNECT_PATH = "/agents/connect" as const
export const AGENT_UI_CONNECT_SCHEMA = "cosmos:agents/connect/v1" as const
export const AGENT_UI_CONNECTIONS_PATH = "/agents/connections" as const
export const AGENT_UI_PROFILE_PATH = "/agents/profile" as const

/** Owner projections текущего Graph; executor читает alias, но не становится ещё одним каталогом. */
export function providerRegistryOwners(graph: Graph): RuntimeAtom[] {
  const pending: RuntimeNode[] = [...graph.runtime.roots], owners: RuntimeAtom[] = []
  for (let index = 0; index < pending.length; index++) {const node = pending[index]!; if (node.kind === "atom" && node.meta === "@metafor/provider" && node.values.registryMode !== "executor") owners.push(node); pending.push(...node.children ?? [])}
  return owners
}
export interface AgentUiProviderRegistry {ref: AtomRef; registry: ProviderRegistry}
export interface AgentUiProviderRegistryError {ref: AtomRef; message: string}

/** Явный opaque адрес host assignment; causal cut и Meta address не становятся Verse ID. */
export function isAgentUiVerseId(value: unknown): value is string | null {
  if (value === null) return true
  if (typeof value !== "string") return false
  try {productRoutePath({kind: "atom", verseId: value, atomId: "assignment"}); return true} catch {return false}
}

export interface AgentUiSlot {
  ref: AtomRef
  meta: "@metafor/agent-slot"
  owner: {ref: AtomRef, meta: MetaAddress} | null
  enabled: boolean
  state: string | null
  configuration: AgentConfigurationObservation
}

export interface AgentUiItem extends AgentObservation {
  error: string | null
  activeTaskId: string | null
  busy: boolean
  /** Only this Agent's discovered own Chat session, read through the public Mass operation. */
  chatSession: EnergyMassResultReadReceipt | null
  chatError: string | null
  providers?: {ref: AtomRef, registry: ProviderRegistry} | null
  providerError?: string | null
  providerBinding?: {id: string | null, locked: boolean}
}

export interface AgentUiSnapshot {
  schema: typeof AGENT_UI_SCHEMA
  version: 1
  root: MetaAddress
  /** Полный read-only public Graph; не выводится из списка подключённых Agent. */
  graph: Graph
  /** Только явно назначенный host адрес COSMOS_VERSE_ID, иначе null. */
  verseId: string | null
  /** Наблюдаемая причинная identity хранится отдельно от адреса Verse. */
  observedWorld: {root: MetaAddress; cutId: string}
  /** Accepted Force position; ordinary reads are not one held causal snapshot. */
  revision: MetaCausalFrontier
  observation: {mechanism: "public-oracle-poll", photonSubscription: false}
  agents: AgentUiItem[]
  providerRegistries: AgentUiProviderRegistry[]
  providerRegistryErrors: AgentUiProviderRegistryError[]
  connectableSlots?: AgentUiSlot[]
  profiles?: ProfileCatalogReceipt | null
  profileError?: string | null
}

export type AgentUiTask =
  | {id: string, text: string, mode: "conversation"}
  | {id: string, text: string, mode: "development", maxSteps?: number}
  | {id: string, text: string, mode: "scenario", scenario: "agent-system.integrity"}
  | {id: string, text: string, mode: "codespace", operation: "status" | "start"}

export interface AgentUiTaskRequest {
  agentRef: AtomRef
  task: AgentUiTask
}

export interface AgentUiTaskReceipt {
  schema: typeof AGENT_UI_TASK_SCHEMA
  version: 1
  agentRef: AtomRef
  taskId: string
  receipt: MetaFieldValueApplyReceipt
}

export interface AgentUiFailure {
  error: {code: "forbidden" | "invalid_request" | "busy" | "world_unavailable" | "conflict" | "new_session_required" | "profile_not_admitted", message: string}
}
