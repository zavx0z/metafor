/**
Dark-owned Agent projection over one existing current Graph. No world Store,
source evaluation, capability resolution or private domain access is involved.
@packageDocumentation
*/
import {AGENT_OBSERVATION_SCHEMA, AGENT_OBSERVATION_VERSION, STANDARD_AGENT_META, STANDARD_AGENT_CHAT_META,
  observeAgentConfiguration, type AgentObservation, type ReadAgentsReceipt} from "@metafor/types/metafor/agent-observation"
import type {Graph, RuntimeAtom, RuntimeNode} from "@metafor/types/metafor/graph"

const ownChildren = (node: RuntimeAtom): RuntimeAtom[] => {
  const children = [...(node.children ?? [])]
  const atoms: RuntimeAtom[] = []
  for (let index = 0; index < children.length; index++) {
    const child = children[index]!
    if (child.kind === "atom") atoms.push(child)
    else children.push(...(child.children ?? []))
  }
  return atoms
}

/** Preserves stable refs and nearest Atom ownership without interpreting declared tools as grants. */
export function projectAgents(graph: Graph): ReadAgentsReceipt {
  const agents: AgentObservation[] = []
  const pending: Array<{node: RuntimeNode, owner: RuntimeAtom | null}> = graph.runtime.roots.map(node => ({node, owner: null}))
  for (let index = 0; index < pending.length; index++) {
    const {node, owner} = pending[index]!
    if (node.kind === "atom" && node.meta === STANDARD_AGENT_META) {
      const observation: AgentObservation = {ref: node.ref, meta: node.meta, owner: owner ? {ref: owner.ref, meta: owner.meta} : null,
        state: node.state, status: typeof node.values.status === "string" ? node.values.status : null,
        configuration: observeAgentConfiguration(node.values.configuration), chat: null, issues: []}
      if (!owner) observation.issues.push({code: "missing_owner", message: "The current Graph does not contain an owning parent Atom"})
      if (node.values.status !== undefined && node.values.status !== null && typeof node.values.status !== "string")
        observation.issues.push({code: "invalid_status", message: "Agent status is not a string in the current Graph"})
      const chats = ownChildren(node).filter(child => child.meta === STANDARD_AGENT_CHAT_META)
      if (chats.length === 1) {
        const chat = chats[0]!
        const sessions = chat.mass.filter(mass => mass.key === "session" && mass.format === "json")
        observation.chat = {ref: chat.ref, meta: chat.meta, session: sessions.length === 1 ? structuredClone(sessions[0]!) : null}
        if (sessions.length !== 1) observation.issues.push({code: "missing_chat_session", message: "The owning Chat has no unambiguous JSON session Mass metadata"})
      } else observation.issues.push({code: chats.length ? "ambiguous_chat" : "missing_chat", message: "The current Graph does not contain one owning Chat child"})
      agents.push(observation)
    }
    pending.push(...(node.children ?? []).map(child => ({node: child,
      owner: node.kind === "atom" && node.meta !== "@metafor/agent-slot" ? node : owner})))
  }
  return {schema: AGENT_OBSERVATION_SCHEMA, version: AGENT_OBSERVATION_VERSION, root: graph.root, agents}
}
