import {OracleRpcRemoteError, type OracleRpcPeer} from "shared/transport/oracle"
import type {Graph} from "@metafor/types/metafor/graph"
import {PROVIDER_META, type ProviderExecutionSettings} from "@metafor/types/metafor/providers"
import {DARK_FORCE_HISTORY_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD, type DarkForceHistoryReadReceipt, isMetaFieldValueApplyRefusal} from "shared/protocol/metafor/observation"
import {indexAgentAtoms, readProviderRegistry} from "./agent-provider"

/**
 * Один ordinary Field intent запускает owning Provider Process; ответ ждёт ack
 * и committed Mass. Только typed frontier_mismatch до admission допускает до
 * трёх повторов с той же identity/body после проверки owner, Mass и конфигурации.
 * Неизвестный исход отправки не повторяется.
 * [Проверки](../spec/provider-connections.spec.ts) покрывают отказ и неизвестный исход.
 */
export async function providerConnections(peer: Pick<OracleRpcPeer, "call">, providerRef: string,
  operation: {configure: ProviderExecutionSettings} | {check: string}, signal: AbortSignal) {
  signal.throwIfAborted()
  const id = `connections-${crypto.randomUUID()}`
  const encoded = JSON.stringify({id, ...operation})
  const observe = async () => {
    signal.throwIfAborted()
    const frontier = await peer.call<DarkForceHistoryReadReceipt>("dark", DARK_FORCE_HISTORY_READ_METHOD, {contractVersion: 1, query: {kind: "frontier"}})
    const graph = await peer.call<Graph>("dark", "readGraph", {})
    const owner = indexAgentAtoms(graph).atoms.get(providerRef)
    if (!owner || owner.meta !== PROVIDER_META || owner.values.registryMode === "executor" ||
        !graph.template[owner.meta]?.fields.some(field => field.key === "discoveryRequest" && field.type === "string")) throw new Error("Владелец Provider недоступен")
    if (owner.values.discoveryRequest != null || owner.state === "discovering" || owner.state === "turning" || owner.state === "bootstrapping") throw new Error("Provider занят; обновите состояние")
    const current = await readProviderRegistry(peer, graph, providerRef)
    const configurationRevision = current.registry.settings.configuration?.revision ?? 0
    if ("configure" in operation && operation.configure.revision !== configurationRevision) throw new Error("Конфигурация изменилась; обновите настройки")
    return {frontier, graph, owner, configurationRevision, massRef: owner.mass.find(mass => mass.key === "registry" && mass.format === "json")!.ref}
  }
  const initial = await observe()
  const {graph, owner} = initial
  let attempt = initial
  for (let retries = 0; ; retries++) {
    if (attempt.graph.root !== graph.root || attempt.owner.ref !== owner.ref || attempt.owner.meta !== owner.meta || attempt.massRef !== initial.massRef) throw new Error("Владелец Provider изменился; запрос не принят")
    if (attempt.configurationRevision !== initial.configurationRevision) throw new Error("Конфигурация изменилась; запрос не принят")
    signal.throwIfAborted()
    try {
      await peer.call("dark", META_FIELD_VALUE_APPLY_METHOD, {contractVersion: 1,
        atom: {root: graph.root, ref: owner.ref, meta: owner.meta}, field: "discoveryRequest", value: encoded, expectedFrontier: attempt.frontier.frontier})
      break
    } catch (error) {
      if (retries >= 3 || !(error instanceof OracleRpcRemoteError) || error.code !== "admission_refused" ||
          !isMetaFieldValueApplyRefusal(error.data) || error.data.reason !== "frontier_mismatch") throw error
      await new Promise(resolve => setTimeout(resolve, 50))
      attempt = await observe()
    }
  }
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    const next = await peer.call<Graph>("dark", "readGraph", {})
    const observed = indexAgentAtoms(next).atoms.get(providerRef)
    if (next.root !== graph.root || observed?.meta !== owner.meta || observed.values.registryMode === "executor") throw new Error("Владелец Provider изменился")
    if (observed.values.discoveryAck === true && observed.values.discoveryAckId === id) {
      if (observed.values.discoveryError) throw new Error("Provider отклонил изменение; обновите настройки")
      const saved = await readProviderRegistry(peer, next, providerRef)
      if (!saved.registry.requests.some(request => request.id === id)) throw new Error("Mass Provider ещё не подтверждена")
      return saved
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error("Исход операции Provider не подтверждён; обновите состояние перед повтором")
}
