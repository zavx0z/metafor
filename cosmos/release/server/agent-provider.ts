import type {Graph, RuntimeAtom, RuntimeNode} from "@metafor/types/metafor/graph"
import {PROVIDER_META, type ProviderRegistry, type ProviderBinding} from "@metafor/types/metafor/providers"
import {parseProviderRegistry} from "@metafor/types/metafor/provider-validation"
import {ENERGY_MASS_RESULT_READ_METHOD, type EnergyMassResultReadReceipt} from "shared/protocol/metafor/observation"
import type {OracleRpcPeer} from "shared/transport/oracle"

export function indexAgentAtoms(graph: Graph) {
  const pending: RuntimeNode[] = [...graph.runtime.roots]
  const atoms = new Map<string, RuntimeAtom>()
  const children = new Map<string, RuntimeAtom[]>()
  const visit = (node: RuntimeNode, parent: RuntimeAtom | null) => {
    if (node.kind === "atom") {
      atoms.set(node.ref, node)
      if (parent) children.set(parent.ref, [...children.get(parent.ref) ?? [], node])
      parent = node
    }
    for (const child of node.children ?? []) visit(child, parent)
  }
  for (const node of pending) visit(node, null)
  return {atoms, children}
}

/** Resolves the Agent's own executor and its unique canonical registry owner by shared Mass identity. */
export function resolveAgentProvider(graph: Graph, agentRef: string, providerRef?: string) {
  const {atoms, children} = indexAgentAtoms(graph)
  const agent = atoms.get(agentRef)
  if (agent?.meta !== "@metafor/agent") throw new Error("Agent scope is unavailable")
  const chats = (children.get(agentRef) ?? []).filter(atom => atom.meta === "@metafor/chat")
  if (chats.length !== 1) throw new Error("Agent own Chat is unavailable")
  const executors = (children.get(chats[0]!.ref) ?? []).filter(atom => atom.meta === PROVIDER_META)
  if (executors.length !== 1) throw new Error("Agent own Provider is unavailable")
  const executor = executors[0]!
  const ref = executor.mass.find(mass => mass.key === "registry" && mass.format === "json")?.ref
  if (!ref) throw new Error("Agent Provider registry is unavailable")
  const owners = [...atoms.values()].filter(atom => atom.meta === PROVIDER_META && atom.values.registryMode !== "executor"
    && atom.mass.some(mass => mass.key === "registry" && mass.format === "json" && mass.ref === ref))
  if (owners.length !== 1 || providerRef !== undefined && owners[0]!.ref !== providerRef) throw new Error("Provider registry owner changed or is ambiguous")
  return {agent, chat: chats[0]!, executor, owner: owners[0]!}
}

/** Только exact owner Provider и его объявленный JSON Mass; executor и неоднозначный owner не допускаются. */
export async function readProviderRegistry(peer: Pick<OracleRpcPeer, "call">, graph: Graph, providerRef: string): Promise<{ref: RuntimeAtom["ref"], registry: ProviderRegistry}> {
  const {atoms} = indexAgentAtoms(graph), owner = atoms.get(providerRef)
  const registry = owner?.mass.find(mass => mass.key === "registry" && mass.format === "json")
  if (!owner || owner.meta !== PROVIDER_META || owner.values.registryMode === "executor" || !registry ||
    [...atoms.values()].filter(atom => atom.meta === PROVIDER_META && atom.values.registryMode !== "executor" && atom.mass.some(mass => mass.key === "registry" && mass.format === "json" && mass.ref === registry.ref)).length !== 1) throw new Error("Provider registry owner is unavailable or ambiguous")
  const read = await peer.call<EnergyMassResultReadReceipt>("energy", ENERGY_MASS_RESULT_READ_METHOD,
    {contractVersion: 1, atom: {root: graph.root, ref: owner.ref, meta: owner.meta}, key: "registry", maxBytes: 1024 * 1024})
  if (read.atom.root !== graph.root || read.atom.ref !== owner.ref || read.atom.meta !== PROVIDER_META || read.key !== "registry"
    || read.resolution !== "exact" || !Number.isSafeInteger(read.bytes) || read.bytes < 0 || read.bytes > 1024 * 1024
    || read.content.format !== "json" || !read.content.present) throw new Error("Provider registry cannot be observed")
  return {ref: owner.ref, registry: parseProviderRegistry(read.content.value)}
}

/** Agent читает тот же owner; GET может передать request-local дедуп reader, без отдельного registry Store. */
export async function readAgentProvider(peer: Pick<OracleRpcPeer, "call">, graph: Graph, agentRef: string, providerRef?: string,
  readRegistry?: (ref: RuntimeAtom["ref"]) => ReturnType<typeof readProviderRegistry>): Promise<{ref: RuntimeAtom["ref"], registry: ProviderRegistry}> {
  const {owner} = resolveAgentProvider(graph, agentRef, providerRef)
  return readRegistry ? readRegistry(owner.ref) : readProviderRegistry(peer, graph, owner.ref)
}

export function browserBinding(registry: ProviderRegistry, entryId: string): ProviderBinding {
  if (registry.settings.configuration && !registry.settings.configuration.connections.some(row => row.enabled && registry.settings.connectionBindings?.[row.id] === entryId &&
      registry.settings.connectionChecks?.[row.id]?.checkedAt != null && registry.settings.connectionChecks?.[row.id]?.status !== "failed")) throw new Error("Configured browser is disabled, removed or not admitted")
  const entry = registry.entries.find(entry => entry.id === entryId)
  if (!entry || entry.resolution !== "exact" || entry.connection !== "connected" || !entry.capabilities.browserPreview) throw new Error("Assigned browser is unavailable")
  return {id: entry.id, service: entry.service, host: entry.host, remotePeerId: entry.remotePeerId, executorId: entry.executorId,
    ...(entry.assignmentId === undefined ? {} : {assignmentId: entry.assignmentId})}
}
