import {createHistoryResidencyBudget, createHistoryWindow, type HistoryController, type HistoryBody} from "@zavx0z/chat/history"
import type {HistoryGroup, HistoryOccurrence, StorybookChatSession} from "@zavx0z/storybook-chat-session"
import type {StorybookChatView} from "@zavx0z/storybook-chat-view"
import type {CosmosConversationClient, CosmosConversationSnapshot} from "./agent-workspace-types"

type Store = StorybookChatSession.Output
type Result<Key extends keyof Store> = Store[Key] extends (...args: never[]) => infer Value ? Awaited<Value> : never
type Window = StorybookChatView.Input["history"]
type Header = Result<"displayHistory">["items"][number]
type Body = NonNullable<Window["rows"][number]["body"]>
type Evidence = Result<"historyEvidence">["items"][number]

/** Только derived bounded окна public Chat: один общий byte budget верхнего списка и раскрытых групп. */
export function createCosmosConversationHistory(client: CosmosConversationClient) {
  const listeners = new Set<() => void>(), groups = new Set<{dispose(): void; setActive(active: boolean): void}>()
  const budget = createHistoryResidencyBudget()
  let selected: CosmosConversationSnapshot | null = null, active = true, disposed = false
  let notification = false
  const changed = () => {
    if (notification || disposed) return
    notification = true
    queueMicrotask(() => {notification = false; if (!disposed) for (const listener of listeners) listener()})
  }
  const displayBody = (body: Result<"historyItem">, sourceId = body.id, evidenceId?: string): Body => body.detail && !body.terminal
    ? {kind: "detail", id: body.id, sourceId, ...(evidenceId === undefined ? {} : {evidenceId}), detail: body.detail}
    : {...body.entry, historyRevision: body.revision, ...(body.continuation === undefined ? {} : {continuation: body.continuation}),
      ...(body.sourceBytes === undefined ? {} : {sourceBytes: body.sourceBytes}), ...(body.terminal === undefined ? {} : {terminal: body.terminal}),
      ...(body.copyRequiresSource ? {copyRequiresSource: true} : {})}
  const body = async (id: string, header: Header | HistoryOccurrence, signal: AbortSignal, groupId?: string): Promise<HistoryBody<Body>> => {
    if (header.kind === "group") return {conversationId: id, id: header.id, revision: header.revision, bytes: 0, entry: {kind: "group" as const, id: header.id}, evidenceCount: 0}
    const sourceId = "entryId" in header ? header.entryId : header.id
    const evidenceId = "evidenceId" in header ? header.evidenceId : undefined
    if (header.bodyBytes > 512 * 1024 && header.kind !== "tool" && (evidenceId !== undefined || header.kind !== "message" && header.kind !== "context")) {
      const detail = await client.historyDetail(id, sourceId, evidenceId === undefined ? {} : {evidenceId}, signal)
      return {conversationId: id, id: header.id, revision: header.revision, bytes: detail.bytes,
        entry: {kind: "detail" as const, id: header.id, sourceId, ...(evidenceId === undefined ? {} : {evidenceId}), detail}, evidenceCount: 0}
    }
    const result = groupId ? await client.groupHistoryItem(id, groupId, header.id, signal) : await client.historyItem(id, header.id, signal)
    if (result.chatId !== id) throw new Error("Получена история другой беседы")
    return {...result, conversationId: id, entry: displayBody(result, sourceId, evidenceId)}
  }
  const controller: HistoryController<Header, Body, Evidence> = createHistoryWindow<Header, Body, Evidence>({residencyBudget: budget, refreshDelayMs: 100, changed,
    isOrdinary: header => header.kind === "message" && header.role !== "thought" && header.purpose !== "command",
    source: {
      async readPage(id, query, signal) {
        const page = await client.displayHistory(id, query, signal)
        if (page.chatId !== id) throw new Error("Получена страница другой беседы")
        return {...page, conversationId: id, bodies: (page.bodies ?? []).map(value => ({...value, conversationId: id, entry: displayBody(value)}))}
      },
      async readBody(id, entryId, signal) {
        const header = controller.getSnapshot().rows.find(row => row.header.id === entryId)?.header
        if (!header) throw new Error("Заголовок истории больше не виден")
        return await body(id, header, signal)
      },
      async readEvidence(id, entryId, query, signal) {
        const page = await client.historyEvidence(id, entryId, query, signal)
        return {...page, conversationId: page.chatId}
      },
    },
  })
  let previous: ReturnType<typeof controller.getSnapshot> | undefined, view: Window | undefined
  return {
    ...controller,
    subscribe(listener: () => void) {listeners.add(listener); return () => {listeners.delete(listener)}},
    accept(snapshot: CosmosConversationSnapshot) {
      if (selected?.id !== snapshot.id || selected.executorId !== snapshot.executorId) {for (const group of groups) group.dispose(); groups.clear()}
      selected = snapshot
      controller.accept({id: snapshot.id, scope: snapshot.executorId, history: snapshot.displayHistory ?? snapshot.history})
    },
    getSnapshot(): Window {
      const next = controller.getSnapshot()
      if (previous === next && view) return view
      previous = next
      const {conversationId, rows, ...rest} = next
      const projected: Window = {...rest, chatId: conversationId, rows: rows.map(({evidence, ...row}) => ({...row,
        ...(evidence === undefined ? {} : {evidence: {...evidence, chatId: evidence.conversationId}})}))}
      view = projected
      return projected
    },
    setActive(value: boolean) {active = value; controller.setActive(value); for (const group of groups) group.setActive(value)},
    createGroupHistory(group: HistoryGroup): HistoryController<HistoryOccurrence, Body, unknown> & {subscribe(listener: () => void): () => void} {
      if (!selected) throw new Error("Беседа не выбрана")
      const id = selected.id, scope = `${selected.executorId}:${group.id}`, local = new Set<() => void>()
      let released = false, queued = false
      const notify = () => {
        if (released || queued) return
        queued = true
        queueMicrotask(() => {queued = false; if (!released) for (const listener of local) listener()})
      }
      const nested: HistoryController<HistoryOccurrence, Body, unknown> = createHistoryWindow<HistoryOccurrence, Body, unknown>({residencyBudget: budget, pageSize: 16, maxPages: 2, refreshDelayMs: 100, changed: notify, isOrdinary: () => false,
        source: {
          async readPage(chatId, query, signal) {
            const page = await client.groupHistory(chatId, group.id, query.before === undefined && query.after === undefined && query.around === undefined ? {...query, before: Number.MAX_SAFE_INTEGER} : query, signal)
            return {...page, conversationId: page.chatId}
          },
          async readBody(chatId, occurrence, signal) {
            const header = nested.getSnapshot().rows.find(row => row.header.id === occurrence)?.header
            if (!header) throw new Error("Событие группы больше не видно")
            return await body(chatId, header, signal, group.id)
          },
          async readEvidence(chatId, occurrence) {return {conversationId: chatId, id: occurrence, revision: 0, total: 0, start: 0, items: [], before: null, after: null}},
        },
      })
      const owned = {...nested, subscribe(listener: () => void) {local.add(listener); return () => {local.delete(listener)}},
        accept(value: Parameters<typeof nested.accept>[0]) {if (!released) {groups.add(owned); nested.setActive(active); nested.accept({...value, id, scope})}},
        dispose() {released = true; nested.dispose(); local.clear(); groups.delete(owned)},
      }
      return owned
    },
    dispose() {disposed = true; controller.dispose(); for (const group of groups) group.dispose(); groups.clear(); listeners.clear(); selected = null},
  }
}
