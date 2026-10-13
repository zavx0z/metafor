/** Chat owns transcript and delegates every model effect to its own Provider Atom. @packageDocumentation */
import type {ProviderBinding as ChatProviderBinding} from "@metafor/types/metafor/providers"
import {parseProviderBinding, parseProviderTurnRequest, parseProviderTurnResult, providerAtomRef} from "@metafor/provider/protocol"
import {parseChatRequest, readChatSession} from "./session"
import type {ChatActionResult, ChatReceiveInput, ChatResult, ChatSendInput} from "./types"
import {parseAgentFeedbackRequest, type AgentFeedbackReceipt} from "@metafor/types/metafor/agents"
import {pendingServiceFeedback, serviceFeedbackPrompt} from "./feedback"
export type {ChatRequest, ChatResult, ChatSession, ChatSendInput} from "./types"

const writers = new WeakSet<object>()
const empty = (result: ChatResult, ack: boolean, providerRequest: string | null = null): ChatActionResult => ({...result, ack, providerRequest,
  providerAck: false, providerAckId: "", providerResponse: null, providerError: null, providerSessionId: null, providerOutcome: null, providerBindingDescriptor: null})
const sameBinding = (a: ChatProviderBinding, b: ChatProviderBinding) =>
  (["id", "service", "host", "remotePeerId", "executorId", "assignmentId"] as const).every(key => a[key] === b[key])
const identity = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value)
/**
Persists literal human text and one exact child request before proposing its
shared Fields. Replayed pending requests keep their original envelope; native
idempotence and uncertainty belong to Provider's durable turns Mass. This action
never reads native configuration, opens a connection or invokes a model.
*/
export default async function send(input: ChatSendInput): Promise<ChatActionResult> {
  const request = parseChatRequest(input.request)
  input.signal.throwIfAborted()
  const handle = input.mass.session
  if (writers.has(handle)) throw new Error("Chat session already has a writer")
  writers.add(handle)
  try {
    const session = await readChatSession(handle)
    if (!providerAtomRef(input.providerRef)) throw new Error("Chat has no observed owning Provider identity")
    const selected = input.binding ?? null
    if (Object.hasOwn(session, "bindingId") && session.bindingId !== selected || session.providerRef !== undefined && session.providerRef !== input.providerRef)
      throw new Error("Chat cannot replace its retained Provider Atom or assignment")
    const previous = session.requests.find(row => row.id === request.id)
    if (previous && previous.prompt !== request.prompt) throw new Error("Chat request id уже принадлежит другому содержимому")
    if (previous?.state === "completed" || previous?.state === "failed") return empty(structuredClone(previous.result), true)
    if (previous?.state === "pending") {
      if (!previous.providerRequest) return empty({ackId: request.id, response: null, error: "Исход прежнего Chat prompt неопределён; автоматическая повторная отправка запрещена", sessionId: session.sessionId}, true)
      return empty({ackId: request.id, response: null, error: null, sessionId: session.sessionId}, false, previous.providerRequest)
    }
    if (session.requests.some(row => row.state === "pending")) return empty({ackId: request.id, response: null, error: "Исход прежнего Chat prompt неопределён; автоматическая повторная отправка запрещена", sessionId: session.sessionId}, true)
    const feedback = pendingServiceFeedback(request.prompt, session.feedback ?? [])
    const providerPrompt = serviceFeedbackPrompt(request.prompt, feedback)
    const providerRequest = JSON.stringify(parseProviderTurnRequest({id: request.id, prompt: providerPrompt, sessionId: session.sessionId, providerRef: session.providerRef ?? input.providerRef, expectedBinding: session.binding ?? null}))
    session.bindingId = selected
    session.providerRef = input.providerRef
    session.requests.push({...request, providerRequest, ...(feedback.length ? {providerPrompt, feedbackIds: feedback.map(record => record.id)} : {}), state: "pending"})
    for (const record of feedback) record.includedIn = request.id
    session.messages.push({requestId: request.id, role: "user", content: request.prompt})
    await handle.write(session)
    input.signal.throwIfAborted()
    return empty({ackId: request.id, response: null, error: null, sessionId: session.sessionId}, false, providerRequest)
  } finally {writers.delete(handle)}
}

/** Consumes only the owned Provider's correlated receipt and persists transcript before ack Fields. */
export async function receive(input: ChatReceiveInput): Promise<ChatActionResult> {
  const request = parseChatRequest(input.request)
  input.signal.throwIfAborted()
  const handle = input.mass.session
  if (writers.has(handle)) throw new Error("Chat session already has a writer")
  writers.add(handle)
  try {
    const session = await readChatSession(handle)
    const row = session.requests.find(row => row.id === request.id)
    if (!row || row.prompt !== request.prompt) throw new Error("Chat Provider receipt has no retained request")
    if (row.state === "completed" || row.state === "failed") return empty(structuredClone(row.result), true)
    const result = {ackId: request.id, response: null as string | null, error: input.providerError, sessionId: session.sessionId}
    const correlated = input.providerAck && input.providerAckId === request.id && typeof input.providerRef === "string" && /^atom:[1-9][0-9]*$/.test(input.providerRef)
    if (!correlated) return empty({...result, error: input.providerError ?? "Provider acknowledgement is not correlated"}, true)
    if (session.providerRef !== undefined && session.providerRef !== input.providerRef) throw new Error("Provider Atom changed for the retained Chat")
    parseProviderTurnResult({ack: input.providerAck, ackId: input.providerAckId, response: input.providerResponse, error: input.providerError,
      sessionId: input.providerSessionId, outcome: input.providerOutcome, providerRef: input.providerRef, bindingDescriptor: input.providerBindingDescriptor})
    const binding = input.providerBindingDescriptor === null ? null : parseProviderBinding(JSON.parse(input.providerBindingDescriptor))
    if (session.bindingId && binding && session.bindingId !== binding.id) throw new Error("Provider receipt does not match the selected canonical entry")
    if (session.binding && binding && !sameBinding(session.binding, binding)) throw new Error("Provider binding changed for the retained Chat")
    if (input.providerSessionId !== null && (!identity(input.providerSessionId) || session.sessionId !== null && session.sessionId !== input.providerSessionId)) throw new Error("Provider изменил сохранённую Chat session identity")
    session.providerRef = input.providerRef!
    if (binding) {session.binding = binding; session.provider = binding.service}
    if (input.providerSessionId !== null) session.sessionId = input.providerSessionId
    result.sessionId = session.sessionId
    if (input.providerOutcome === "completed") {
      if (!binding || !session.sessionId || result.error !== null || typeof input.providerResponse !== "string" || !input.providerResponse.trim()) throw new Error("Provider returned no verified final response")
      result.response = input.providerResponse
      session.requests[session.requests.indexOf(row)] = {...row, state: "completed", result}
      session.messages.push({requestId: request.id, role: "assistant", content: result.response})
    } else if (input.providerOutcome === "not-sent") {
      if (!result.error) throw new Error("Provider not-sent receipt has no refusal")
      session.requests[session.requests.indexOf(row)] = {...row, state: "failed", result}
      for (const feedback of session.feedback ?? []) if (feedback.includedIn === request.id) feedback.includedIn = null
    } else result.error ??= "Provider prompt outcome is uncertain; automatic resend is forbidden"
    await handle.write(session)
    input.signal.throwIfAborted()
    return empty(result, true)
  } finally {writers.delete(handle)}
}

/**
Отдельный Chat Process сохраняет служебное наблюдение без model turn. Identity
неизменна вместе с текстом и исходной корреляцией; ack появляется после Mass.
Проверки — [feedback tests](./test/feedback.test.ts).
*/
export async function feedback(input: Pick<ChatSendInput, "mass" | "signal"> & {request: string | null}) {
  let ackId = "", lastRequest: string | null = null
  const handle = input.mass.session
  let writing = false
  try {
    input.signal.throwIfAborted()
    if (typeof input.request !== "string" || input.request.length > 300000) throw new TypeError("Invalid Agent service feedback")
    const request = parseAgentFeedbackRequest(JSON.parse(input.request))
    ackId = request.id; lastRequest = JSON.stringify(request)
    if (writers.has(handle)) throw new Error("Chat session already has a writer")
    writers.add(handle); writing = true
    const session = await readChatSession(handle)
    const previous = session.feedback?.find(record => record.id === request.id)
    if (previous && JSON.stringify({id: previous.id, text: previous.text, correlation: previous.correlation}) !== lastRequest) throw new Error("Agent feedback identity already binds different immutable payload")
    if (!previous) {
      const records = session.feedback ?? []
      if (records.length >= 512 || JSON.stringify([...records, request]).length > 4 * 1024 * 1024) throw new Error("Chat service feedback ledger capacity exceeded")
      records.push({...request, role: "service", includedIn: null})
      session.feedback = records
      await handle.write(session)
      input.signal.throwIfAborted()
    }
    const receipt: AgentFeedbackReceipt = {id: request.id, accepted: true, replayed: previous !== undefined}
    return {feedbackRequest: null, feedbackAck: true, feedbackAckId: ackId, feedbackResponse: JSON.stringify(receipt), feedbackError: null, feedbackLastRequest: lastRequest}
  } catch (error) {
    return {feedbackRequest: null, feedbackAck: true, feedbackAckId: ackId, feedbackResponse: null, feedbackError: error instanceof Error ? error.message : "Agent service feedback failed", feedbackLastRequest: lastRequest}
  } finally {if (writing) writers.delete(handle)}
}
