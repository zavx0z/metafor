import {parseProviderBinding, sameProviderBinding} from "@metafor/provider/protocol"
import {resolveProviderBinding} from "@metafor/provider/catalog"
import type {OracleRpcPeer} from "shared/transport/oracle"
import type {Graph, RuntimeAtom} from "@metafor/types/metafor/graph"
import {resolveAgentProvider, readAgentProvider} from "./agent-provider"
import type {EnergyMassResultReadReceipt, DarkForceHistoryReadReceipt} from "shared/protocol/metafor/observation"

/**
 * Настройки читает и применяет тот же Provider Process для exact binding и уже
 * общей с Chat native identity. Каждый read получает текущий ACP-каталог;
 * сохранённые receipts принадлежат только повтору своей request identity.
 * Новая native сессия и prompt здесь не допускаются.
 * [Проверки](../spec/provider-settings.spec.ts) покрывают fresh read и смену scope.
 */
export async function providerSettings(peer: Pick<OracleRpcPeer, "call">, agentRef: string, selection: {model?: string; reasoning?: string}, signal: AbortSignal) {
  const graph = await peer.call<Graph>("dark", "readGraph", {})
  const scope = resolveAgentProvider(graph, agentRef)
  if (!["idle", "done", "failed"].includes(scope.agent.state ?? "") || scope.executor.state === "turning") throw new Error("Agent или Provider занят")
  const registry = await readAgentProvider(peer, graph, agentRef)
  const binding = registry.registry.entries.find(entry => entry.id === (scope.agent.values.providerBinding ?? registry.registry.settings.selectedId))
  if (!binding) throw new Error("Назначение Provider отсутствует")
  const assigned = resolveProviderBinding(registry.registry, binding.id)
  const ledger = await peer.call<EnergyMassResultReadReceipt>("energy", "energy.mass.result.read", {contractVersion: 1,
    atom: {root: graph.root, ref: scope.executor.ref, meta: scope.executor.meta}, key: "turns", maxBytes: 4 * 1024 * 1024})
  if (ledger.atom.root !== graph.root || ledger.atom.ref !== scope.executor.ref || ledger.atom.meta !== scope.executor.meta || ledger.key !== "turns" || ledger.resolution !== "exact" || !Number.isSafeInteger(ledger.bytes) || ledger.bytes < 0 || ledger.bytes > 4 * 1024 * 1024) throw new Error("Журнал Provider не подтверждён")
  const state = ledger.content.format === "json" && ledger.content.present ? ledger.content.value as {sessionId?: string; binding?: unknown; requests?: Array<{request: {operation?: string}; result?: {outcome?: string; response?: string} | null}>} | null : null
  if (!state?.sessionId) throw new Error("У Provider ещё нет сохранённой native session")
  const chat = await peer.call<EnergyMassResultReadReceipt>("energy", "energy.mass.result.read", {contractVersion: 1,
    atom: {root: graph.root, ref: scope.chat.ref, meta: scope.chat.meta}, key: "session", maxBytes: 4 * 1024 * 1024})
  const session = chat.content.format === "json" && chat.content.present ? chat.content.value as {sessionId?: string; binding?: unknown} | null : null
  if (chat.atom.root !== graph.root || chat.atom.ref !== scope.chat.ref || chat.atom.meta !== scope.chat.meta || chat.key !== "session" || chat.resolution !== "exact" || !Number.isSafeInteger(chat.bytes) || chat.bytes < 0 || chat.bytes > 4 * 1024 * 1024 ||
      !session || session.sessionId !== state.sessionId || !session.binding || !sameProviderBinding(parseProviderBinding(session.binding), assigned)) throw new Error("Chat не подтвердил identity сохранённой native session")
  if (!state.binding || !sameProviderBinding(parseProviderBinding(state.binding), assigned)) throw new Error("Назначение сохранённой native session изменилось")
  const id = `settings-${crypto.randomUUID()}`
  const request = {id, operation: "settings", selection, prompt: "", sessionId: state.sessionId, providerRef: scope.executor.ref, expectedBinding: state.binding ?? null}
  const encoded = JSON.stringify(request)
  const apply = async (field: string, value: unknown) => {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted()
      const receipt = await peer.call<DarkForceHistoryReadReceipt>("dark", "dark.force.history.read", {contractVersion: 1, query: {kind: "frontier"}})
      const current = resolveAgentProvider(await peer.call<Graph>("dark", "readGraph", {}), agentRef)
      if (current.owner.ref !== scope.owner.ref || current.executor.ref !== scope.executor.ref || current.agent.values.providerBinding !== scope.agent.values.providerBinding ||
          current.executor.values.request !== (field === "request" ? scope.executor.values.request : encoded)) throw new Error("Запрос или назначение Provider изменились")
      try {
        return await peer.call("dark", "meta.field.value.apply", {contractVersion: 1, atom: {root: graph.root, ref: scope.executor.ref, meta: scope.executor.meta}, field, value, expectedFrontier: receipt.frontier})
      } catch (error) {
        const refusal = error as {code?: string; data?: {reason?: string}}
        if (attempt >= 3 || refusal.code !== "admission_refused" || refusal.data?.reason !== "frontier_mismatch") throw error
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }
  }
  await apply("request", encoded)
  if (scope.executor.values.ack !== false) await apply("ack", false)
  const deadline = Date.now() + 55000
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    const next = await peer.call<Graph>("dark", "readGraph", {})
    const executor: RuntimeAtom = resolveAgentProvider(next, agentRef).executor
    if (executor.ref !== scope.executor.ref) throw new Error("Provider изменился")
    if (executor.values.ack === true && executor.values.ackId === id) {
      if (executor.values.error || executor.values.outcome !== "completed") throw new Error(String(executor.values.error ?? "Настройки не подтверждены"))
      return {settings: JSON.parse(String(executor.values.response))}
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error("Исход настройки не подтверждён; проверьте Provider перед повтором")
}
