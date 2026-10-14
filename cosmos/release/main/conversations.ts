import {COSMOS_CONVERSATIONS_PATH, type CosmosConversationRequest, type CosmosConversationScope, type CosmosConversationSelection,
  type CosmosConversationSnapshot, type CosmosConversationStore, type CosmosConversationAgent, type CosmosAtomConversationScope, type CosmosLegacyConversation} from "@metafor/types/cosmos/conversations"
import type {CosmosAgentProfile, CosmosAgentProfileUpdate} from "@metafor/types/cosmos/agent-profile"
import type {CosmosRoomGroups, CosmosRoomScope} from "@metafor/types/cosmos/conversation-groups"
import type {ClientConversationObserver} from "@metafor/types/cosmos/client"
import {projectAgentChatMessages} from "./agent-chat"

type Store = CosmosConversationStore
type Result<Key extends keyof Store> = Store[Key] extends (...args: never[]) => infer Value ? Awaited<Value> : never
const MAX_REPLY = 16 * 1024 * 1024
const legacyView = (record: CosmosLegacyConversation | null) => {
  if (record === null) return null
  const session = record.session
  if (!session || typeof session !== "object" || Array.isArray(session) || !Array.isArray(Reflect.get(session, "requests")) || !Array.isArray(Reflect.get(session, "messages"))) throw new Error("Архив прежней беседы имеет неподдерживаемый формат")
  return {record, messages: projectAgentChatMessages(session as Record<string, unknown>)}
}

/**
Прямой same-origin HTTP клиент [бесед Cosmos](../../README.md#беседы-и-представление-агентов).
Не хранит canonical историю и не перенаправляет запросы в Workbench или Quantum.
Каждый вызов ограничен по bytes; dispose отзывает только чтение/ожидание HTTP,
а не уже принятое исполнение. Неизвестный исход mutation не повторяется.
*/
type ClientOptions = {fetcher?: typeof fetch; signal?: AbortSignal; observeConversation?: ClientConversationObserver}

function createTransport(options: ClientOptions) {
  const lifetime = new AbortController()
  const fetcher = options.fetcher ?? globalThis.fetch
  const call = async <Value>(request: CosmosConversationRequest, inputSignal?: AbortSignal): Promise<Value> => {
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(90_000), ...(options.signal ? [options.signal] : []), ...(inputSignal ? [inputSignal] : [])])
    signal.throwIfAborted()
    const response = await fetcher(COSMOS_CONVERSATIONS_PATH, {method: "POST", credentials: "same-origin", mode: "same-origin", redirect: "error",
      headers: {"content-type": "application/json"}, body: JSON.stringify(request), signal})
    if (!response.body) throw new Error("Ответ беседы отсутствует")
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let bytes = 0
    try {
      for (;;) {
        signal.throwIfAborted()
        const item = await reader.read()
        if (item.done) break
        bytes += item.value.byteLength
        if (bytes > MAX_REPLY) throw new Error("Ответ беседы превысил допустимый размер")
        chunks.push(item.value)
      }
    } catch (error) {await reader.cancel().catch(() => {}); throw error}
    finally {reader.releaseLock()}
    signal.throwIfAborted()
    const data = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) {data.set(chunk, offset); offset += chunk.byteLength}
    const reply = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(data)) as {ok?: boolean; result?: Value; error?: {code?: string; message?: string}}
    if (!response.ok || reply.ok !== true || !Object.hasOwn(reply, "result")) throw Object.assign(new Error(
      typeof reply.error?.message === "string" ? reply.error.message.slice(0, 1024) : `Беседа недоступна (HTTP ${response.status})`), {code: reply.error?.code ?? "unavailable"})
    return reply.result as Value
  }
  return {call, signal: lifetime.signal, dispose() {lifetime.abort(new Error("Просмотр беседы закрыт"))}}
}

/** Scoped session capability; transport lifetime не владеет принятыми backend turns. */
export function createCosmosConversationClient(scope: CosmosConversationScope, options: ClientOptions = {}) {
  const transport = createTransport(options)
  const call = <Value>(action: CosmosConversationRequest["action"], sessionId?: string, fields: Record<string, unknown> = {}, signal?: AbortSignal) =>
    transport.call<Value>({action, scope, ...(sessionId === undefined ? {} : {sessionId}), ...fields} as CosmosConversationRequest, signal)
  return {
    scope,
    subscribe(sessionId: string, listener: (value: CosmosConversationSnapshot) => void, onError: (error: Error) => void) {
      const signal = AbortSignal.any([transport.signal, ...(options.signal ? [options.signal] : [])])
      signal.throwIfAborted()
      if (!options.observeConversation) throw new Error("Поток беседы не подключён")
      let active = true
      const release = options.observeConversation(scope, sessionId, value => {if (active) listener(value)}, error => {if (active) onError(error)})
      const close = () => {
        if (!active) return
        active = false
        signal.removeEventListener("abort", close)
        release()
      }
      signal.addEventListener("abort", close, {once: true})
      return close
    },
    list: (signal?: AbortSignal) => call<readonly CosmosConversationSnapshot[]>("list", undefined, {}, signal),
    read: (sessionId?: string, signal?: AbortSignal) => call<CosmosConversationSnapshot>("read", sessionId, {}, signal),
    readLegacy: (signal?: AbortSignal) => call<CosmosLegacyConversation | null>("legacy.read", undefined, {}, signal),
    legacy: async (signal?: AbortSignal) => legacyView(await call<CosmosLegacyConversation | null>("legacy.read", undefined, {}, signal)),
    create: (label?: string, signal?: AbortSignal) => call<CosmosConversationSnapshot>("create", undefined, {label}, signal),
    rename: (sessionId: string, label: string, signal?: AbortSignal) => call<CosmosConversationSnapshot>("rename", sessionId, {label}, signal),
    delete: (sessionId: string, signal?: AbortSignal) => call<void>("delete", sessionId, {}, signal),
    prepare: (sessionId: string, signal?: AbortSignal) => call<CosmosConversationSnapshot>("prepare", sessionId, {}, signal),
    cancel: (sessionId: string, signal?: AbortSignal) => call<CosmosConversationSnapshot>("cancel", sessionId, {}, signal),
    stop: (sessionId: string, signal?: AbortSignal) => call<CosmosConversationSnapshot>("stop", sessionId, {}, signal),
    permission: (sessionId: string, id: string, optionId: string, signal?: AbortSignal) => call<CosmosConversationSnapshot>("permission", sessionId, {id, optionId}, signal),
    configure: (sessionId: string, id: string, value: string, signal?: AbortSignal) => call<CosmosConversationSnapshot>("configure", sessionId, {id, value}, signal),
    configureExecution: (sessionId: string, selection: CosmosConversationSelection, signal?: AbortSignal) => call<CosmosConversationSnapshot>("configureExecution", sessionId, {selection}, signal),
    prompt: (sessionId: string, text: string, requestId: string, signal?: AbortSignal) => call<CosmosConversationSnapshot>("prompt", sessionId, {text, requestId}, signal),
    displayHistory: (sessionId: string, query?: Parameters<Store["displayHistory"]>[1], signal?: AbortSignal) => call<Result<"displayHistory">>("displayHistory", sessionId, {query}, signal),
    historyItem: (sessionId: string, id: string, signal?: AbortSignal) => call<Result<"historyItem">>("historyItem", sessionId, {id}, signal),
    groupHistory: (sessionId: string, groupId: string, query?: Parameters<Store["groupHistory"]>[2], signal?: AbortSignal) => call<Result<"groupHistory">>("groupHistory", sessionId, {groupId, query}, signal),
    groupHistoryItem: (sessionId: string, groupId: string, id: string, signal?: AbortSignal) => call<Result<"groupHistoryItem">>("groupHistoryItem", sessionId, {groupId, id}, signal),
    historyEvidence: (sessionId: string, id: string, query?: Parameters<Store["historyEvidence"]>[2], signal?: AbortSignal) => call<Result<"historyEvidence">>("historyEvidence", sessionId, {id, query}, signal),
    historyContent: (sessionId: string, id: string, query?: Parameters<Store["historyContent"]>[2], signal?: AbortSignal) => call<Result<"historyContent">>("historyContent", sessionId, {id, query}, signal),
    historyDetail: (sessionId: string, id: string, query?: Parameters<Store["historyDetail"]>[2], signal?: AbortSignal) => call<Result<"historyDetail">>("historyDetail", sessionId, {id, query}, signal),
    historyTerminal: (sessionId: string, id: string, query?: Parameters<Store["historyTerminal"]>[2], signal?: AbortSignal) => call<Result<"historyTerminal">>("historyTerminal", sessionId, {id, query}, signal),
    dispose: transport.dispose,
  }
}

export type CosmosConversationClient = ReturnType<typeof createCosmosConversationClient>


/** Каталог Cosmos actors/групп и profile CAS без фиктивного Agent до его явного создания. */
export function createCosmosConversationDirectoryClient(options: ClientOptions = {}) {
  const transport = createTransport(options)
  return {
    listAgents: (scope: CosmosAtomConversationScope, signal?: AbortSignal) => transport.call<readonly CosmosConversationAgent[]>({action: "agent.list", scope}, signal),
    createAgent: (scope: CosmosAtomConversationScope, name: string, signal?: AbortSignal) => transport.call<CosmosConversationAgent>({action: "agent.create", scope, name}, signal),
    ensureAgent: (scope: CosmosAtomConversationScope, name: string, signal?: AbortSignal) => transport.call<CosmosConversationAgent>({action: "agent.ensure", scope, name}, signal),
    readProfile: (scope: CosmosConversationScope, signal?: AbortSignal) => transport.call<CosmosAgentProfile>({action: "profile.read", scope}, signal),
    readLegacy: (scope: CosmosConversationScope, signal?: AbortSignal) => transport.call<CosmosLegacyConversation | null>({action: "legacy.read", scope}, signal),
    legacy: async (scope: CosmosConversationScope, signal?: AbortSignal) => legacyView(await transport.call<CosmosLegacyConversation | null>({action: "legacy.read", scope}, signal)),
    updateProfile: (scope: CosmosConversationScope, update: CosmosAgentProfileUpdate, signal?: AbortSignal) => transport.call<CosmosAgentProfile>({action: "profile.update", scope, update}, signal),
    listGroups: (scope: CosmosRoomScope, signal?: AbortSignal) => transport.call<CosmosRoomGroups>({action: "group.list", scope}, signal),
    createGroup: (scope: CosmosRoomScope, expectedRevision: number, title: string, members: readonly string[], signal?: AbortSignal) =>
      transport.call<CosmosRoomGroups>({action: "group.create", scope, expectedRevision, title, members}, signal),
    updateGroup: (scope: CosmosRoomScope, expectedRevision: number, id: string, title: string, members: readonly string[], signal?: AbortSignal) =>
      transport.call<CosmosRoomGroups>({action: "group.update", scope, expectedRevision, id, title, members}, signal),
    forActor: (scope: CosmosConversationScope) => createCosmosConversationClient(scope, {...options, signal: AbortSignal.any([transport.signal, ...(options.signal ? [options.signal] : [])])}),
    dispose: transport.dispose,
  }
}
