import {resolveProviderBinding} from "@metafor/provider/catalog"
import settings from "@zavx0z/storybook-app-settings"
import type {StorybookChatSession} from "@zavx0z/storybook-chat-session"
import type {Graph, RuntimeAtom, RuntimeNode} from "@metafor/types/metafor/graph"
import type {CosmosAtomConversationScope} from "../shared/conversations"
import {providerRegistryOwners} from "../shared/agents"
import {readProviderRegistry} from "./agent-provider"
import type {OracleRpcPeer} from "shared/transport/oracle"

/** Читает только конфигурацию owning Provider. История и настройки бесед остаются у Cosmos Session store. */
export function createConversationExecutionResolver(peer: Pick<OracleRpcPeer, "call">,
  world: (scope: CosmosAtomConversationScope) => Promise<{graph: Graph; atom: RuntimeAtom}>): NonNullable<StorybookChatSession.Input["resolveExecution"]> {
  const pendingRegistries = new Map<string, ReturnType<typeof readProviderRegistry>>()
  return async input => {
    const address: unknown = JSON.parse(input.subject.address)
    if (!Array.isArray(address) || (address.length !== 2 && address.length !== 3) ||
      typeof address[0] !== "string" || typeof address[1] !== "string") throw Error("Адрес беседы не подтверждён")
    const {graph, atom} = await world({verseId: address[0], atomRef: address[1]})
    const path: RuntimeNode[] = []
    const find = (node: RuntimeNode): boolean => {
      path.push(node)
      if (node === atom) return true
      for (const child of node.children ?? []) if (find(child)) return true
      path.pop()
      return false
    }
    for (const root of graph.runtime.roots) if (find(root)) break
    let owners: RuntimeAtom[] = []
    for (const node of path.reverse()) {
      owners = providerRegistryOwners({...graph, runtime: {...graph.runtime, roots: [node]}})
      if (owners.length) break
    }
    if (owners.length !== 1) throw Error("Единственный Provider комнаты не подтверждён")
    const owner = owners[0]!
    const registryKey = JSON.stringify([graph.root, owner.ref, owner.mass])
    let pending = pendingRegistries.get(registryKey)
    if (!pending) {
      pending = readProviderRegistry(peer, graph, owner.ref).finally(() => {pendingRegistries.delete(registryKey)})
      pendingRegistries.set(registryKey, pending)
    }
    const {registry} = await pending
    const config = registry.settings.configuration
    if (!config) throw Error("Provider комнаты ещё не настроен")
    const connections = config.connections.map(connection => {
      const bindingId = registry.settings.connectionBindings?.[connection.id]
      let admitted = false
      if (connection.peer && bindingId) {
        try {
          const binding = resolveProviderBinding(registry, bindingId)
          admitted = binding.remotePeerId === connection.peer.peerId && binding.executorId === connection.peer.executorId
        } catch {}
      }
      return {...connection, enabled: connection.enabled && admitted}
    })
    if (input.selection.approvalMode === "scoped-autonomous" || input.executorSelection?.approvalMode === "scoped-autonomous")
      throw Error("Автономный режим этой поверхности не авторизован")
    const result = settings.resolveExecutionSettings({connections, general: {...config.general, approvalMode: "ask"}, types: {}}, {
      selection: input.selection, executorSelection: input.executorSelection ?? {},
      ...(input.pinnedConnectionId === undefined ? {} : {pinnedConnectionId: input.pinnedConnectionId})})
    return {...result, approvalCapabilities: {modes: ["ask"], autoReview: false, scope: "assignment"}}
  }
}
