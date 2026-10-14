import {READ_GRAPH_DELTA_METHOD, validateGraph, type AtomRef} from "@metafor/types/metafor/graph"
import {parseProviderBinding, parseProviderTurnRequest, nativeIdentity, sameProviderBinding} from "@metafor/provider/protocol"
import {resolveProviderBinding} from "@metafor/provider/catalog"
import {ENERGY_MASS_RESULT_READ_METHOD, validateMetaGraphSnapshotIdentity, type EnergyMassResultReadReceipt, type ReadGraphDeltaReceipt} from "shared/protocol/metafor/observation"
import type {OracleRpcPeer} from "shared/transport/oracle"
import type {AtomFieldEditReceipt} from "../shared/atom-fields"
import {readProviderRegistry, resolveAgentProvider} from "./agent-provider"
import {AtomFieldEditError, createAtomFieldBridge} from "./atom-fields"
export {AtomFieldEditError} from "./atom-fields"

/** Исходный pending request выбранного Agent; caller не назначает Chat, Provider или native session. */
export interface AgentChatRecoveryRequest {agentRef: AtomRef; requestId: string}
type Peer = Pick<OracleRpcPeer, "call">
const maxSession = 4 * 1024 * 1024
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const conflict = () => new AtomFieldEditError(409, "conflict", "Исходный pending-запрос или его назначение изменились; обновите беседу")
const unavailable = () => new AtomFieldEditError(503, "world_unavailable", "Собственная беседа Agent недоступна")

function request(value: unknown): AgentChatRecoveryRequest {
  if (!object(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value, "agentRef") || !Object.hasOwn(value, "requestId") ||
      typeof value.agentRef !== "string" || !/^atom:[A-Za-z0-9._:-]{1,128}$/.test(value.agentRef) || !nativeIdentity(value.requestId)) {
    throw new AtomFieldEditError(400, "invalid_request", "Нужны выбранный Agent и identity его исходного запроса")
  }
  return {agentRef: value.agentRef as AtomRef, requestId: value.requestId}
}

function snapshot(value: ReadGraphDeltaReceipt) {
  if (!value || value.contractVersion !== 1 || value.resolution !== "exact" || value.kind !== "snapshot" ||
      !value.snapshot || !validateMetaGraphSnapshotIdentity(value.snapshot.identity, "").ok || !validateGraph(value.snapshot.graph).ok ||
      value.snapshot.identity.root !== value.snapshot.graph.root) throw unavailable()
  return value.snapshot
}

function currentRequest(value: unknown): {id: string; prompt: string} {
  if (typeof value !== "string" || value.length > 2 * 1024 * 1024) throw conflict()
  let parsed: unknown
  try {parsed = JSON.parse(value)} catch {throw conflict()}
  if (!object(parsed) || Object.keys(parsed).length !== 2 || !nativeIdentity(parsed.id) || typeof parsed.prompt !== "string" || !parsed.prompt.trim()) throw conflict()
  return {id: parsed.id, prompt: parsed.prompt}
}

function idle(scope: ReturnType<typeof resolveAgentProvider>) {
  if (scope.agent.values.task !== undefined && scope.agent.values.task !== null ||
      !["idle", "completed", "failed"].includes(String(scope.agent.values.status ?? "")) ||
      !["idle", "done", "failed"].includes(scope.agent.state ?? "") || scope.executor.state === "turning") {
    throw new AtomFieldEditError(409, "busy", "Agent или его Provider занят")
  }
}

/**
 * После локальной HTTP authorization проверяет [собственный Chat](../../../standard/chat/README.md)
 * выбранного Agent и его последний pending-запрос. Только Qwen с сохранённой
 * native identity допускает один обычный ack=false intent. Chat повторяет
 * сохранённый envelope, а [Provider](../../../standard/provider/README.md) только
 * читает strict native receipt. Adapter не записывает Mass и не изменяет задачу
 * Agent или native identity. Возвращённый admission ещё не подтверждает ответ;
 * результат наблюдается у Chat. Повторная scope-проверка относится к тому coherent snapshot,
 * который существующий Field bridge использует для Force admission.
 * [Проверки](../spec/agent-chat-recovery.spec.ts) покрывают чужой request и exact owner.
 */
export async function recoverAgentChat(peer: Peer, value: unknown): Promise<AtomFieldEditReceipt> {
  const input = request(value)
  let fields: ReturnType<typeof createAtomFieldBridge> | undefined
  try {
    const initial = snapshot(await peer.call<ReadGraphDeltaReceipt>("dark", READ_GRAPH_DELTA_METHOD, {contractVersion: 1, base: null}))
    const scope = resolveAgentProvider(initial.graph, input.agentRef)
    idle(scope)
    if (currentRequest(scope.chat.values.request).id !== input.requestId) throw conflict()
    const registry = await readProviderRegistry(peer, initial.graph, scope.owner.ref)
    const selected = typeof scope.agent.values.providerBinding === "string" ? scope.agent.values.providerBinding : registry.registry.settings.selectedId
    if (!selected) throw conflict()
    const binding = resolveProviderBinding(registry.registry, selected)
    if (binding.service !== "qwen") throw new AtomFieldEditError(409, "conflict", "Strict восстановление доступно только назначенному Qwen")
    const read = await peer.call<EnergyMassResultReadReceipt>("energy", ENERGY_MASS_RESULT_READ_METHOD,
      {contractVersion: 1, atom: {root: initial.graph.root, ref: scope.chat.ref, meta: scope.chat.meta}, key: "session", maxBytes: maxSession})
    if (!read || read.resolution !== "exact" || read.atom?.root !== initial.graph.root || read.atom.ref !== scope.chat.ref || read.atom.meta !== scope.chat.meta ||
        read.key !== "session" || !Number.isSafeInteger(read.bytes) || read.bytes < 0 || read.bytes > maxSession || read.content.format !== "json" || !read.content.present) throw unavailable()
    const session = read.content.value
    if (!object(session) || session.version !== 1 || session.provider !== "qwen" || !nativeIdentity(session.sessionId) || session.providerRef !== scope.executor.ref ||
        !Array.isArray(session.requests) || !session.requests.length || !sameProviderBinding(parseProviderBinding(session.binding), binding) ||
        Object.hasOwn(session, "bindingId") && session.bindingId !== (scope.chat.values.binding ?? null)) throw conflict()
    const last: unknown = session.requests.at(-1)
    if (!object(last) || last.state !== "pending" || last.id !== input.requestId || typeof last.prompt !== "string" || !last.prompt.trim() ||
        typeof last.providerRequest !== "string" || last.providerRequest.length > 3 * 1024 * 1024 || session.requests.slice(0, -1).some(row => !object(row) || row.state === "pending")) throw conflict()
    const retained = parseProviderTurnRequest(JSON.parse(last.providerRequest))
    if (retained.operation !== undefined || retained.id !== last.id || retained.prompt !== (last.providerPrompt ?? last.prompt) ||
        retained.providerRef !== scope.executor.ref || retained.sessionId !== null && retained.sessionId !== session.sessionId ||
        retained.expectedBinding !== null && !sameProviderBinding(retained.expectedBinding, binding)) throw conflict()
    const validateScope = (observed: ReturnType<typeof snapshot>) => {
      const current = resolveAgentProvider(observed.graph, input.agentRef)
      idle(current)
      const intent = currentRequest(current.chat.values.request)
      if (observed.graph.root !== initial.graph.root || current.chat.ref !== scope.chat.ref || current.executor.ref !== scope.executor.ref || current.owner.ref !== scope.owner.ref ||
          current.agent.values.providerBinding !== scope.agent.values.providerBinding || current.chat.values.binding !== scope.chat.values.binding ||
          current.chat.values.providerRef !== scope.executor.ref || current.chat.values.sessionId !== session.sessionId || current.executor.values.sessionId !== session.sessionId ||
          intent.id !== input.requestId || intent.prompt !== last.prompt || current.chat.values.ack !== true) throw conflict()
    }
    validateScope(initial)
    fields = createAtomFieldBridge({peer: {async call<T>(target: string, method: string, params: unknown): Promise<T> {
      const result = await peer.call<T>(target, method, params)
      if (target === "dark" && method === READ_GRAPH_DELTA_METHOD) validateScope(snapshot(result as unknown as ReadGraphDeltaReceipt))
      return result
    }}})
    return await fields.editField({atomRef: scope.chat.ref, field: "ack", value: false, expectedValue: true, expectedFrontier: initial.identity.frontier})
  } catch (error) {
    if (error instanceof AtomFieldEditError) throw error
    throw unavailable()
  } finally {fields?.close()}
}
