import {createHistoryWindow, type HistoryBody} from "@zavx0z/chat/history"
import type {StorybookChatView} from "@zavx0z/storybook-chat-view"
import type {AtomChatMessage} from "./atom"

type Header = StorybookChatView.Timeline["history"]["rows"][number]["header"]
type Body = NonNullable<StorybookChatView.Timeline["history"]["rows"][number]["body"]>
type Evidence = NonNullable<StorybookChatView.Timeline["history"]["rows"][number]["evidence"]>["items"][number]
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const same = (left: AtomChatMessage | undefined, right: AtomChatMessage) => left?.id === right.id && left.role === right.role && left.content === right.content && JSON.stringify(left.tool) === JSON.stringify(right.tool)

/** Frontend pages уже полученного Chat Mass; tool bodies читаются только по раскрытию, backend не выдумывается. */
export function createAgentChatHistory() {
  let messages: readonly AtomChatMessage[] = [], revision = 0
  let previousTimelineSource: unknown, previousTimeline: StorybookChatView.Timeline | undefined
  const bodyRevisions = new Map<string, {message: AtomChatMessage; revision: number}>(), listeners = new Set<() => void>()
  const entry = (message: AtomChatMessage, ordinal: number): Body => {
    const base = {id: message.id, sequence: ordinal + 1, origin: "local" as const}
    if (!message.tool) return {...base, kind: "message", role: message.role === "service" ? "system" : message.role, content: [{type: "text", text: message.content}]}
    const tool = message.tool, output = tool.output
    const result = object(output) ? typeof output.error === "string" && output.error ? output.error : typeof output.result === "string" ? output.result : null : null
    return {...base, kind: "tool", toolCallId: tool.id, updates: [], call: {
      sessionUpdate: "tool_call", toolCallId: tool.id, title: tool.name, kind: "execute", status: tool.status,
      rawInput: tool.input, ...(output !== undefined ? {rawOutput: output} : {}),
      ...(result ? {content: [{type: "content" as const, content: {type: "text" as const, text: result}}]} : {}),
    }}
  }
  const body = (conversationId: string, id: string): HistoryBody<Body> => {
    const ordinal = messages.findIndex(message => message.id === id), message = messages[ordinal]
    if (!message) throw new Error("Chat message no longer observed")
    const value = entry(message, ordinal)
    return {conversationId, id, revision: bodyRevisions.get(id)?.revision ?? 1, bytes: new TextEncoder().encode(JSON.stringify(value)).byteLength, entry: value, evidenceCount: 0}
  }
  const ordinary = (header: Header) => header.kind === "message" && header.role !== "thought" && header.purpose !== "command" && header.bodyBytes <= 128 * 1024
  const controller = createHistoryWindow<Header, Body, Evidence>({isOrdinary: ordinary,
    changed() {for (const listener of listeners) listener()},
    source: {
      async readPage(conversationId, query, signal) {
        signal.throwIfAborted()
        const limit = Math.min(32, query.limit ?? 32)
        const start = query.before !== undefined ? Math.max(0, query.before - limit) : query.after !== undefined ? query.after + 1 : query.around !== undefined ? Math.max(0, query.around - Math.floor(limit / 2)) : Math.max(0, messages.length - limit)
        const items: Header[] = messages.slice(start, start + limit).map((message, index) => ({id: message.id, ordinal: start + index, sequence: start + index + 1,
          origin: "local", revision: bodyRevisions.get(message.id)!.revision, bodyBytes: body(conversationId, message.id).bytes, evidenceCount: 0,
          ...(message.tool ? {kind: "tool" as const, title: message.tool.name, status: message.tool.status} : {kind: "message" as const, role: message.role === "service" ? "system" as const : message.role})}))
        let bytes = 0
        const bodies = items.flatMap(header => {if (!ordinary(header)) return []; const value = body(conversationId, header.id); if (bytes + value.bytes > 128 * 1024) return []; bytes += value.bytes; return [value]})
        return {conversationId, revision, total: messages.length, start, items, bodies, before: start > 0 ? start : null, after: start + items.length < messages.length ? start + items.length - 1 : null}
      },
      async readBody(conversationId, id, signal) {signal.throwIfAborted(); return body(conversationId, id)},
      async readEvidence() {throw new Error("Native ACP evidence is not exposed by this Chat Mass snapshot")},
    },
  })
  return {...controller, subscribe(listener: () => void) {listeners.add(listener); return () => {listeners.delete(listener)}},
    present(identity: string, next: readonly AtomChatMessage[]) {
      if (next.length !== messages.length || next.some((message, index) => !same(messages[index], message))) revision++
      messages = next
      const live = new Set(next.map(message => message.id))
      for (const id of bodyRevisions.keys()) if (!live.has(id)) bodyRevisions.delete(id)
      for (const message of next) {const old = bodyRevisions.get(message.id); bodyRevisions.set(message.id, {message, revision: same(old?.message, message) ? old!.revision : (old?.revision ?? 0) + 1})}
      controller.accept({id: identity, history: {revision, total: messages.length}})
    },
    timeline(snapshot = controller.getSnapshot()): StorybookChatView.Timeline {
      if (previousTimelineSource === snapshot && previousTimeline) return previousTimeline
      const {conversationId, ...history} = snapshot
      const rows = history.rows.map(({evidence, ...row}) => ({...row, ...(evidence ? {evidence: {...evidence, chatId: evidence.conversationId}} : {})}))
      previousTimelineSource = snapshot
      return previousTimeline = {history: {...history, rows, chatId: conversationId}, onHistoryViewport: controller.viewport, onHistoryVisible: controller.setActive,
        onHistoryExpand: controller.expand, onHistoryRetry: controller.retry, onHistoryRetryPage: controller.retryPage, onHistoryEvidence: (id, after) => {void controller.evidence(id, after)}, onHistoryTail: controller.tail}
    },
    dispose() {controller.dispose(); listeners.clear(); messages = []; bodyRevisions.clear()},
  }
}
