import type {MassHandle} from "@metafor/types/metafor/mass"
import type {ChatRequest, ChatSession} from "./types"
import {parseProviderTurnRequest, sameProviderBinding} from "@metafor/provider/protocol"
import {parseAgentFeedbackRequest} from "@metafor/types/metafor/agents"
import {serviceFeedbackPrompt} from "./feedback"

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key)) && keys.every(key => Object.hasOwn(value, key))
const identity = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256 && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value)

/** Закрытый вход запроса; malformed JSON и подмена identity отклоняются до любого эффекта. */
export function parseChatRequest(value: string | null): ChatRequest {
  if (typeof value !== "string" || value.length > 2 * 1024 * 1024) throw new TypeError("Chat request должен быть ограниченным JSON-текстом")
  let parsed: unknown
  try {parsed = JSON.parse(value)} catch {throw new TypeError("Chat request не является JSON-объектом")}
  if (!record(parsed) || !exact(parsed, ["id", "prompt"]) || !identity(parsed.id) || typeof parsed.prompt !== "string" || !parsed.prompt.trim()) {
    throw new TypeError("Chat request требует только непустые id и prompt")
  }
  return {id: parsed.id, prompt: parsed.prompt}
}

/** Читает собственный Mass; пустой key означает новую беседу, повреждённый документ не заменяется пустым. */
export async function readChatSession(handle: MassHandle): Promise<ChatSession> {
  const text = await handle.readText()
  if (text === "") return {version: 1, provider: null, sessionId: null, messages: [], requests: []}
  let value: unknown
  try {value = JSON.parse(text)} catch {throw new TypeError("Chat session Mass не является JSON-документом")}
  if (!record(value) || !exact(value, ["version", "provider", "sessionId", "messages", "requests", ...(Object.hasOwn(value, "binding") ? ["binding"] : []), ...(Object.hasOwn(value, "providerRef") ? ["providerRef"] : []), ...(Object.hasOwn(value, "bindingId") ? ["bindingId"] : []), ...(Object.hasOwn(value, "feedback") ? ["feedback"] : [])])
    || value.version !== 1 || !(value.provider === null || identity(value.provider)) || !(value.sessionId === null || identity(value.sessionId))
    || !Array.isArray(value.messages) || !Array.isArray(value.requests)) throw new TypeError("Недопустимый Chat session Mass")
  if (value.binding !== undefined) {
    const binding = value.binding
    if (!record(binding) || !exact(binding, ["id", "service", "host", "remotePeerId", "executorId", ...(Object.hasOwn(binding, "assignmentId") ? ["assignmentId"] : [])]) ||
        ![binding.id, binding.service, binding.host, binding.remotePeerId, binding.executorId].every(identity) ||
        binding.service !== value.provider || binding.assignmentId !== undefined && !identity(binding.assignmentId)) throw new TypeError("Недопустимая Chat provider binding")
  } else if (value.provider !== null && value.provider !== "codex") throw new TypeError("Chat provider требует явную сохранённую binding")
  if (value.providerRef !== undefined && (typeof value.providerRef !== "string" || !/^atom:[1-9][0-9]*$/.test(value.providerRef)) ||
      Object.hasOwn(value, "bindingId") && value.bindingId !== null && !identity(value.bindingId)) throw new TypeError("Недопустимая Chat Provider reference")
  const requests = value.requests
  const messages = value.messages
  if (value.feedback !== undefined) {
    if (!Array.isArray(value.feedback) || value.feedback.length > 512 || JSON.stringify(value.feedback).length > 4 * 1024 * 1024) throw new TypeError("Invalid Chat service feedback ledger")
    const feedbackIds = new Set<string>()
    for (const entry of value.feedback) {
      if (!record(entry) || !exact(entry, ["id", "text", "correlation", "role", "includedIn"]) || entry.role !== "service" || !(entry.includedIn === null || identity(entry.includedIn))) throw new TypeError("Invalid Chat service feedback record")
      const parsed = parseAgentFeedbackRequest({id: entry.id, text: entry.text, correlation: entry.correlation})
      if (feedbackIds.has(parsed.id)) throw new TypeError("Duplicate Chat service feedback identity")
      feedbackIds.add(parsed.id)
    }
  }
  const ids = new Set<string>()
  for (const request of requests) {
    if (!record(request) || !identity(request.id) || ids.has(request.id) || typeof request.prompt !== "string" || !request.prompt.trim()
      || (request.state !== "pending" && request.state !== "completed" && request.state !== "failed")
      || !exact(request, [...(request.state === "pending" ? ["id", "prompt", "state"] : ["id", "prompt", "state", "result"]), ...(Object.hasOwn(request, "providerRequest") ? ["providerRequest"] : []), ...(Object.hasOwn(request, "providerPrompt") ? ["providerPrompt", "feedbackIds"] : [])]) ||
      request.providerRequest !== undefined && (typeof request.providerRequest !== "string" || request.providerRequest.length > 3 * 1024 * 1024)) throw new TypeError("Недопустимый Chat request ledger")
    ids.add(request.id)
    if (request.providerPrompt !== undefined) {
      if (typeof request.providerPrompt !== "string" || request.providerPrompt.length > 2 * 1024 * 1024 || !Array.isArray(request.feedbackIds) || !request.feedbackIds.length || request.feedbackIds.length > 16 ||
          new Set(request.feedbackIds).size !== request.feedbackIds.length) throw new TypeError("Invalid Chat feedback envelope")
      const records = request.feedbackIds.map(id => (value.feedback as ChatSession["feedback"])?.find(record => record.id === id))
      if (records.some(record => record === undefined) || request.providerPrompt !== serviceFeedbackPrompt(request.prompt, records as NonNullable<ChatSession["feedback"]>)) throw new TypeError("Chat feedback envelope does not match retained observations")
    }
    if (typeof request.providerRequest === "string") {
      const envelope = parseProviderTurnRequest(JSON.parse(request.providerRequest))
      if (envelope.id !== request.id || envelope.prompt !== (request.providerPrompt ?? request.prompt) ||
          envelope.sessionId !== null && envelope.sessionId !== value.sessionId ||
          value.providerRef !== undefined && envelope.providerRef !== value.providerRef ||
          envelope.expectedBinding !== null && value.binding !== undefined && !sameProviderBinding(envelope.expectedBinding, value.binding as ChatSession["binding"] & {}))
        throw new TypeError("Chat retained Provider envelope does not match its request or owner")
    }
    if (request.state === "completed" || request.state === "failed") {
      const result = request.result
      if (!record(result) || !exact(result, ["ackId", "response", "error", "sessionId"]) || result.ackId !== request.id
        || (request.state === "completed" ? typeof result.response !== "string" || result.error !== null || !identity(result.sessionId)
          : result.response !== null || typeof result.error !== "string" || !result.error || !(result.sessionId === null || identity(result.sessionId)))) throw new TypeError("Недопустимый завершённый Chat result")
    }
  }
  for (const message of messages) {
    if (!record(message) || !exact(message, ["requestId", "role", "content"]) || typeof message.requestId !== "string" || !ids.has(message.requestId)
      || (message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") throw new TypeError("Недопустимый Chat transcript")
  }
  if (requests.filter(request => request.state === "pending").length > 1) throw new TypeError("Chat имеет больше одного неопределённого запроса")
  const expected = requests.flatMap(request => [{requestId: request.id, role: "user", content: request.prompt},
    ...(request.state === "completed" ? [{requestId: request.id, role: "assistant", content: request.result.response}] : [])])
  if (expected.length !== messages.length || expected.some((message, index) => {
    const actual = messages[index]
    return message.requestId !== actual.requestId || message.role !== actual.role || message.content !== actual.content
  })) throw new TypeError("Chat transcript расходится с журналом запросов")
  if (requests.some(request => request.state === "completed") && value.sessionId === null) throw new TypeError("Chat потерял native identity завершённой беседы")
  if (requests.some(request => request.state === "completed" && request.result.sessionId !== value.sessionId)) throw new TypeError("Chat ledger содержит другую native identity")
  if (requests.some(request => request.state === "failed" && request.result.sessionId !== null && request.result.sessionId !== value.sessionId)) throw new TypeError("Chat failed ledger содержит другую native identity")
  if (requests.some((request, index) => request.state === "pending" && index !== requests.length - 1)) throw new TypeError("Неопределённый Chat запрос должен быть последним")
  if ((value.feedback as ChatSession["feedback"])?.some(entry => entry.includedIn !== null && !requests.some(request => request.id === entry.includedIn && Array.isArray(request.feedbackIds) && request.feedbackIds.includes(entry.id)))) throw new TypeError("Chat feedback references an unavailable model turn")
  return value as unknown as ChatSession
}
