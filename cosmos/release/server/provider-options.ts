import type {OracleRpcPeer} from "shared/transport/oracle"
import type {Graph} from "@metafor/types/metafor/graph"
import {readProviderOptions} from "@metafor/provider/driver"
import {resolveProviderBinding} from "@metafor/provider/catalog"
import {sameProviderBinding} from "@metafor/provider/protocol"
import {readProviderRegistry} from "./agent-provider"

/** Read-only каталог назначенного endpoint; canonical connection читается через Oracle Mass, native session не создаётся. */
export async function providerConnectionOptions(peer: Pick<OracleRpcPeer, "call">, providerRef: string, request: {connectionId: string; model?: string}, signal: AbortSignal) {
  const read = async () => {
    const graph = await peer.call<Graph>("dark", "readGraph", {})
    const owner = await readProviderRegistry(peer, graph, providerRef)
    const config = owner.registry.settings.configuration
    if (config && !config.connections.some(row => row.id === request.connectionId && row.enabled)) throw new Error("Подключение выключено или удалено")
    const selected = config ? owner.registry.settings.connectionBindings?.[request.connectionId] : request.connectionId
    if (!selected) throw new Error("Назначение подключения не подтверждено")
    return {...owner, root: graph.root, binding: resolveProviderBinding(owner.registry, selected)}
  }
  signal.throwIfAborted()
  const before = await read()
  const options = await readProviderOptions(before.binding, request.model, signal)
  const after = await read()
  if (before.root !== after.root || !sameProviderBinding(before.binding, after.binding) || before.registry.settings.configuration?.revision !== after.registry.settings.configuration?.revision) throw new Error("Назначение Provider изменилось")
  return {ref: after.ref, registry: after.registry, options}
}
