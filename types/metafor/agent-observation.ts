/**
Read-only Agent declarations and their actual placement in one ordinary current
Graph. Declared tools are not grants, executable operations or native handles.
This contract inherits readGraph's trusted full-root boundary and carries no
causal frontier or Mass content. Owner: Dark Oracle's Graph projection.
@packageDocumentation
*/
import type {AgentConfiguration} from "./agents"
import {isMetaPackageName, type AtomRef, type MetaAddress, type RuntimeMass} from "./graph"

export const READ_AGENTS_METHOD = "readAgents" as const
export const AGENT_OBSERVATION_SCHEMA = "metafor/agents/v1" as const
export const AGENT_OBSERVATION_VERSION = 1 as const
export const STANDARD_AGENT_META = "@metafor/agent" as const
export const STANDARD_AGENT_CHAT_META = "@metafor/chat" as const

export type ReadAgentsParams = Record<string, never>

export interface AgentObservationIssue {
  code: "missing_configuration" | "invalid_configuration" | "missing_owner" | "missing_chat" | "ambiguous_chat" | "missing_chat_session" | "invalid_status"
  message: string
}

/** Exact means decoded from this Graph's Field value, not an exact causal cut. */
export type AgentConfigurationObservation =
  | {resolution: "exact", value: AgentConfiguration, issues: []}
  | {resolution: "unknown", value: null, issues: AgentObservationIssue[]}

export interface AgentObservation {
  ref: AtomRef
  meta: MetaAddress
  /** Nearest containing Atom, including through intervening topology nodes. */
  owner: {ref: AtomRef, meta: MetaAddress} | null
  state: string | null
  status: string | null
  configuration: AgentConfigurationObservation
  /** The Agent's own nearest child Chat; session is metadata only. */
  chat: {ref: AtomRef, meta: MetaAddress, session: RuntimeMass | null} | null
  issues: AgentObservationIssue[]
}

export interface ReadAgentsReceipt {
  schema: typeof AGENT_OBSERVATION_SCHEMA
  version: typeof AGENT_OBSERVATION_VERSION
  root: MetaAddress
  agents: AgentObservation[]
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const exact = (value: unknown, required: readonly string[]): value is Record<string, unknown> =>
  object(value) && Object.keys(value).length === required.length && required.every(key => Object.hasOwn(value, key))
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 180 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value)
const json = (value: unknown, depth = 0): boolean => depth <= 32 && (
  value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) ||
  Array.isArray(value) && value.every(item => json(item, depth + 1)) || object(value) && Object.values(value).every(item => json(item, depth + 1))
)
const valid = (value: unknown): value is AgentConfiguration => {
  if (!exact(value, ["id", "atom", "presentation", "tools", "displays"]) || !id(value.id) ||
      !exact(value.atom, ["kind", "scope"]) || value.atom.kind !== "atom" || value.atom.scope !== "owner" ||
      !exact(value.presentation, ["kind", "defaultTab", "tabs"]) || value.presentation.kind !== "agent-inspector" ||
      value.presentation.defaultTab !== "chat" || JSON.stringify(value.presentation.tabs) !== JSON.stringify(["chat", "provider", "tools", "context"]) ||
      !Array.isArray(value.tools) || value.tools.length > 64 || !Array.isArray(value.displays) || value.displays.length > 64) return false
  const tools = new Set<string>()
  for (const tool of value.tools) {
    if (!object(tool) || !exact(tool, tool.owner === undefined ? ["kind", "name", "input"] : ["kind", "name", "input", "owner"]) ||
        tool.kind !== "oracle-tool" || typeof tool.name !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(tool.name) || !json(tool.input) ||
        tool.owner !== undefined && (!exact(tool.owner, ["meta"]) || !isMetaPackageName(tool.owner.meta))) return false
    const key = JSON.stringify(tool)
    if (tools.has(key)) return false
    tools.add(key)
  }
  const displays = new Set<string>()
  for (const display of value.displays) {
    if (!exact(display, ["id", "source"]) || !id(display.id) || displays.has(display.id) || !object(display.source)) return false
    displays.add(display.id)
    const source = display.source
    if (source.kind === "atom") {if (!exact(source, ["kind", "scope"]) || source.scope !== "owner") return false}
    else if (source.kind === "mass") {if (!exact(source, ["kind", "key"]) || !id(source.key)) return false}
    else if (!exact(source, ["kind"]) || !["graph", "force", "oracle"].includes(String(source.kind))) return false
  }
  return true
}

/** Decodes a canonical JSON Field without executing expressions or retaining unknown data. */
export function observeAgentConfiguration(input: unknown): AgentConfigurationObservation {
  if (input === undefined || input === null) return {resolution: "unknown", value: null, issues: [{code: "missing_configuration", message: "Agent configuration is not present in the current Graph"}]}
  try {
    if (typeof input !== "string" || input.length > 1024 * 1024) throw new Error("Invalid declaration")
    const value: unknown = JSON.parse(input)
    if (!valid(value)) throw new Error("Invalid declaration")
    return {resolution: "exact", value: structuredClone(value), issues: []}
  } catch {
    return {resolution: "unknown", value: null, issues: [{code: "invalid_configuration", message: "Agent configuration is not a supported bounded JSON declaration"}]}
  }
}
