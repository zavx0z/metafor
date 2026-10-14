import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createClientRegistry, type ClientSocketData} from "../server/clients"
import {createCosmosConversations} from "../server/conversations"
import {isClientConversationSnapshot, type ClientOutbound} from "../shared/clients"

const NativeWebSocket = WebSocket as unknown as {new(url: string, options: {headers: Record<string, string>}): WebSocket}
const wait = async (check: () => boolean) => {
  for (let count = 0; count < 300; count++) {if (check()) return; await Bun.sleep(2)}
  throw Error("Stream condition timed out")
}

test("Window socket streams real Session snapshots; unsubscribe and disconnect preserve the running model", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cosmos-conversation-stream-"))
  const scope = {verseId: "test-verse", atomRef: "atom:1", agentRef: "atom:6"}
  const finish = Promise.withResolvers<void>()
  let prompts = 0, cancelled = false, opened = 0, detached = 0
  const service = createCosmosConversations({directory, authorize() {}, validAtom: () => true,
    validParticipant: value => value.verseId === scope.verseId && value.agentRef === scope.agentRef ? {name: "Agent"} : null,
    async resolveExecution({selection}) {return {selection, executorSelection: {}, effective: {connectionId: "test"}, sources: {connectionId: "general"}, connections: [{id: "test", provider: "codex", label: "Test", enabled: true}]}},
    async connect(input) {
      input.signal.addEventListener("abort", () => {cancelled = true})
      return {sessionId: "native", capabilities: {}, configOptions: [], async setConfigOption() {return []}, async cancel() {cancelled = true}, async dispose() {},
        async prompt() {
          prompts++
          await input.onUpdate({sessionUpdate: "agent_message_chunk", content: {type: "text", text: "Первая часть"}})
          await finish.promise
          await input.onUpdate({sessionUpdate: "agent_message_chunk", content: {type: "text", text: ". Готово."}})
          return {stopReason: "end_turn"}
        }}
    }})
  const clients = createClientRegistry({world: async () => ({root: "test", cutId: "cut"}), heartbeatMs: 10000,
    async observeConversation(...args) {
      opened++
      const stop = await service.subscribe(...args)
      return () => {detached++; stop()}
    }})
  const server = Bun.serve<ClientSocketData>({hostname: "127.0.0.1", port: 0, websocket: clients.websocket,
    fetch: (request, host) => clients.fetch(request, host)})
  const origin = server.url.origin
  const ws = new NativeWebSocket(origin.replace("http:", "ws:") + "/clients/socket", {headers: {Origin: origin}})
  const events: ClientOutbound[] = []
  ws.addEventListener("message", event => events.push(JSON.parse(String(event.data))))
  const post = async (action: string, extra: Record<string, unknown> = {}) => {
    const response = await service.handleRequest(new Request(origin + "/conversations", {method: "POST", body: JSON.stringify({action, scope, ...extra})}))
    const value = await response!.json()
    expect(value.ok).toBe(true)
    return value.result
  }
  try {
    const session = await post("create")
    await wait(() => ws.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({type: "hello", version: 1, clientId: null, kind: "Window", capabilities: [], status: {visible: true, focused: false, boot: {phase: "ready", trace: []}}}))
    await wait(() => events.some(value => value.type === "registered"))
    const registered = events.find(value => value.type === "registered") as Extract<ClientOutbound, {type: "registered"}>
    const connectionId = registered.client.connectionId
    const subscribe = (subscriptionId: string, selected = scope) => ws.send(JSON.stringify({type: "conversation.subscribe", connectionId, subscriptionId, scope: selected, sessionId: session.id}))
    subscribe("observe")
    await wait(() => events.some(value => value.type === "conversation.snapshot"))
    const first = events.find(value => value.type === "conversation.snapshot") as Extract<ClientOutbound, {type: "conversation.snapshot"}>
    expect(isClientConversationSnapshot(first.snapshot)).toBe(true)
    expect(prompts).toBe(0)
    expect(first.snapshot.history).toBeDefined()
    expect(Object.hasOwn(first.snapshot, "messages")).toBe(false)
    await post("prompt", {sessionId: session.id, text: "Проверка", requestId: "stream-request"})
    await wait(() => events.some(value => value.type === "conversation.snapshot" && value.snapshot.status === "running"))
    ws.send(JSON.stringify({type: "conversation.unsubscribe", connectionId, subscriptionId: "observe"}))
    await wait(() => detached === 1)
    expect(cancelled).toBe(false)
    subscribe("second")
    await wait(() => events.some(value => value.type === "conversation.snapshot" && value.subscriptionId === "second"))
    ws.close()
    await wait(() => detached === 2)
    expect(cancelled).toBe(false)
    finish.resolve()
    for (let count = 0; count < 100; count++) {if ((await post("read", {sessionId: session.id})).status === "idle") break; await Bun.sleep(2)}
    expect((await post("read", {sessionId: session.id})).status).toBe("idle")
    expect(prompts).toBe(1)
    expect(opened).toBe(2)
    const history = await post("displayHistory", {sessionId: session.id})
    expect(history.bodies.some((body: {entry: {role?: string; content?: Array<{type: string; text?: string}>}}) => body.entry.role === "assistant" && body.entry.content?.some(part => part.text?.includes("Готово.")))).toBe(true)
    await expect(service.subscribe({...scope, verseId: "foreign"}, session.id, () => {})).rejects.toThrow("недоступен")
  } finally {finish.resolve(); ws.close(); clients.close(); await service.dispose(); await server.stop(true); await rm(directory, {recursive: true, force: true})}
})

test("conversation wire limits subscriptions and snapshots, and closes a late subscribe after unsubscribe", async () => {
  const gate = Promise.withResolvers<void>()
  let detached = 0
  const listeners = new Map<string, (snapshot: import("@metafor/types/cosmos/conversations").CosmosConversationSnapshot) => void>()
  const snapshot = {id: "session", sessionId: "session", executorId: "executor", executorLabel: "Agent", sessionLabel: "Chat", address: "scope", label: "Agent", history: {total: 0}, pending: [], permissions: [], status: "idle", error: null, version: 1} as unknown as import("@metafor/types/cosmos/conversations").CosmosConversationSnapshot
  const clients = createClientRegistry({world: async () => ({root: "test", cutId: "cut"}), heartbeatMs: 10000,
    async observeConversation(scope, sessionId, listener) {
      if (scope.verseId !== "allowed") throw Error("Participant unavailable")
      if (sessionId === "late") await gate.promise
      listeners.set(sessionId!, listener)
      listener(snapshot)
      return () => {detached++; listeners.delete(sessionId!)}
    }})
  const server = Bun.serve<ClientSocketData>({hostname: "127.0.0.1", port: 0, websocket: clients.websocket, fetch: (request, host) => clients.fetch(request, host)})
  const ws = new NativeWebSocket(server.url.href.replace("http:", "ws:") + "clients/socket", {headers: {Origin: server.url.origin}})
  const events: ClientOutbound[] = []
  ws.addEventListener("message", event => events.push(JSON.parse(String(event.data))))
  try {
    await wait(() => ws.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({type: "hello", version: 1, clientId: null, kind: "Window", capabilities: [], status: {visible: true, focused: false, boot: {phase: "ready", trace: []}}}))
    await wait(() => events.some(value => value.type === "registered"))
    const connectionId = (events.find(value => value.type === "registered") as Extract<ClientOutbound, {type: "registered"}>).client.connectionId
    const scope = {verseId: "allowed", atomRef: "atom:1", agentRef: "atom:6"}
    const send = (id: string, sessionId = id, verseId = "allowed") => ws.send(JSON.stringify({type: "conversation.subscribe", connectionId, subscriptionId: id, scope: {...scope, verseId}, sessionId}))
    send("denied", "denied", "foreign")
    await wait(() => events.some(value => value.type === "conversation.error" && value.subscriptionId === "denied"))
    send("late")
    ws.send(JSON.stringify({type: "conversation.unsubscribe", connectionId, subscriptionId: "late"}))
    await Bun.sleep(10)
    gate.resolve()
    await wait(() => detached === 1)
    expect(events.some(value => value.type === "conversation.snapshot" && value.subscriptionId === "late")).toBe(false)
    for (let index = 0; index < 16; index++) send(`observer-${index}`)
    await wait(() => listeners.size === 16)
    send("over-limit")
    await wait(() => events.some(value => value.type === "conversation.error" && value.subscriptionId === "over-limit"))
    expect(listeners.size).toBe(16)
    listeners.get("observer-0")!({...snapshot, error: "x".repeat(256 * 1024)})
    await wait(() => events.some(value => value.type === "conversation.error" && value.subscriptionId === "observer-0"))
    expect(listeners.size).toBe(15)
    ws.close()
    await wait(() => listeners.size === 0)
    expect(detached).toBe(17)
  } finally {gate.resolve(); ws.close(); clients.close(); await server.stop(true)}
})

test("workspace wire forwards compact global/room hints once and detaches on unsubscribe and disconnect", async () => {
  let listener: ((room?: import("@metafor/types/cosmos/conversation-groups").CosmosRoomScope) => void) | undefined
  let attached = 0, detached = 0
  const clients = createClientRegistry({world: async () => ({root: "test", cutId: "cut"}), heartbeatMs: 10000,
    observeWorkspace(callback) {
      attached++
      listener = callback
      callback()
      return () => {detached++; listener = undefined}
    }})
  const server = Bun.serve<ClientSocketData>({hostname: "127.0.0.1", port: 0, websocket: clients.websocket, fetch: (request, host) => clients.fetch(request, host)})
  const ws = new NativeWebSocket(server.url.href.replace("http:", "ws:") + "clients/socket", {headers: {Origin: server.url.origin}})
  const events: ClientOutbound[] = []
  ws.addEventListener("message", event => events.push(JSON.parse(String(event.data))))
  try {
    await wait(() => ws.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({type: "hello", version: 1, clientId: null, kind: "Window", capabilities: [], status: {visible: true, focused: false, boot: {phase: "ready", trace: []}}}))
    await wait(() => events.some(value => value.type === "registered"))
    const connectionId = (events.find(value => value.type === "registered") as Extract<ClientOutbound, {type: "registered"}>).client.connectionId
    const send = (type: string) => ws.send(JSON.stringify({type, connectionId}))
    send("workspace.subscribe")
    send("workspace.subscribe")
    await wait(() => events.some(value => value.type === "workspace.changed"))
    expect(attached).toBe(1)
    const room = {verseId: "test-verse", atomRef: "atom:1"}
    listener!(room)
    await wait(() => events.filter(value => value.type === "workspace.changed").length === 2)
    expect(events.filter(value => value.type === "workspace.changed")).toEqual([
      {type: "workspace.changed", connectionId}, {type: "workspace.changed", connectionId, room},
    ])
    send("workspace.unsubscribe")
    await wait(() => detached === 1)
    send("workspace.subscribe")
    await wait(() => attached === 2)
    ws.close()
    await wait(() => detached === 2)
  } finally {ws.close(); clients.close(); await server.stop(true)}
})
