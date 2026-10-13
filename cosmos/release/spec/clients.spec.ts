import {expect, test} from "bun:test"
import {createClientOracle, type ClientSocketData} from "../server/clients"
import {CLIENTS_READ_METHOD, CLIENT_CACHE_METHOD, CLIENT_CAPTURE_METHOD, CLIENT_DIAGNOSTICS_METHOD, CLIENT_ACT_METHOD, CLIENT_INSPECT_METHOD, CLIENT_EVENTS_METHOD, CLIENT_LOGS_METHOD, type ClientOutbound} from "../shared/clients"
import type {ClientCommandReceipt, ClientStatus, ClientsReceipt, ClientEvents, ClientCapability} from "@metafor/types/cosmos/client"
import {createHttpOracleChannelRegistry, readHttpOracleChannelOpening, OracleRpcPeer} from "shared/transport/oracle"
import {createLocalOracleChannelPair} from "../../../quantum/dark/oracle/local"
import {OracleRouter} from "../../../quantum/dark/oracle/router"

const status = (focused = false): ClientStatus => ({visible: true, focused, boot: {phase: "booting", trace: []}})
const waitFor = async (condition: () => boolean) => {for (let count = 0; count < 500; count++) {if (condition()) return; await Bun.sleep(2)}; throw new Error("Fixture condition timed out")}
async function fixture() {
  let world = {root: "@metafor/environment", cutId: "fixture-cut"}
  let gate: Promise<void> | undefined
  const clients = createClientOracle({world: async () => {await gate; return structuredClone(world)}, timeoutMs: 80, heartbeatMs: 1000})
  const router = new OracleRouter()
  router.attach(clients.channel)
  let darkPeer: OracleRpcPeer
  const dark = createLocalOracleChannelPair("dark", () => darkPeer.methods())
  darkPeer = new OracleRpcPeer(dark.peer)
  const feedbackFields: Record<string, unknown> = {feedbackRequest: null, feedbackAck: false, feedbackAckId: "", feedbackResponse: null, feedbackError: null, feedbackLastRequest: null}
  const feedbackWrites: string[] = []
  darkPeer.expose("readGraph", () => ({root: world.root, template: {}, runtime: {roots: [{kind: "atom", ref: "atom:17", meta: "@metafor/agent", values: feedbackFields, children: []}], reactions: []}}))
  darkPeer.expose("dark.force.history.read", () => ({frontier: {cutId: world.cutId, throughSequence: 1, retroactiveComplete: false}}))
  darkPeer.expose("meta.field.value.apply", (value, context) => {expect(context.source).toBe("cosmos-clients"); const request = value as {field: string; value: string}; expect(request.field).toBe("feedbackRequest"); feedbackFields.feedbackRequest = request.value; feedbackWrites.push(request.value); return {}})
  router.attach(dark.router)
  const http = createHttpOracleChannelRegistry({opened: channel => router.attach(channel), closed: channel => {router.detach(channel)}})
  const server = Bun.serve<ClientSocketData>({hostname: "127.0.0.1", port: 0, websocket: clients.websocket,
    async fetch(request, host) {
      const path = new URL(request.url).pathname
      if (path === "/clients/socket") return clients.fetch(request, host)
      if (path === "/oracle/channels" && request.method === "POST") {
        const opening = readHttpOracleChannelOpening(await request.json())
        if (!opening) return new Response(null, {status: 400})
        const session = await http.open(opening)
        return Response.json({version: 1, channel: session.token}, {status: 201})
      }
      if (path === "/oracle/rpc" && request.method === "POST") {
        const session = http.read(request)
        if (!session) return new Response(null, {status: 401})
        return Response.json(await http.receive(session, await request.json()))
      }
      return new Response(null, {status: 404})
    },
  })
  const origin = `http://127.0.0.1:${server.port}`
  const opening = await fetch(`${origin}/oracle/channels`, {method: "POST", body: JSON.stringify({version: 1, identity: "root-client-test", methods: []})})
  const {channel} = await opening.json() as {channel: string}
  let rpcSequence = 0
  const call = async <T>(method: string, params: unknown = {}): Promise<T> => {
    const response = await fetch(`${origin}/oracle/rpc`, {method: "POST", headers: {Authorization: `Bearer ${channel}`}, body: JSON.stringify({version: 1, id: `test-${++rpcSequence}`, target: "cosmos-clients", method, params})})
    const result = await response.json() as {ok: boolean; result: T; error?: {message: string}}
    if (!result.ok) throw new Error(result.error?.message)
    return result.result
  }
  const sockets: WebSocket[] = []
  const connect = async (clientId: string | null = null, capabilities: readonly ClientCapability[] = ["inspect", "logs", "cache", "view.change", "atom.select"]) => {
    const NativeWebSocket = WebSocket as unknown as {new(url: string, options: {headers: Record<string, string>}): WebSocket}
    const socket = new NativeWebSocket(origin.replace("http:", "ws:") + "/clients/socket", {headers: {Origin: origin}})
    sockets.push(socket)
    const messages: ClientOutbound[] = []
    socket.addEventListener("message", event => messages.push(JSON.parse(String(event.data))))
    await waitFor(() => socket.readyState === WebSocket.OPEN)
    const send = (value: unknown) => socket.send(JSON.stringify(value))
    send({type: "hello", version: 1, clientId, kind: "Window", capabilities, status: status()})
    await waitFor(() => messages.some(item => item.type === "registered"))
    const descriptor = (messages.find(item => item.type === "registered") as Extract<ClientOutbound, {type: "registered"}>).client
    const target = {clientId: descriptor.id, connectionId: descriptor.connectionId}
    return {socket, send, messages, target, activity(event = "pointer") {send({type: "activity", connectionId: target.connectionId, event, status: status(true)})},
      heartbeat(value = status(true)) {send({type: "heartbeat", connectionId: target.connectionId, status: value})},
      reply(requestId: string, value: unknown) {send({type: "reply", connectionId: target.connectionId, requestId, ok: true, value})}}
  }
  return {clients, router, call, connect, origin, feedbackWrites,
    ackFeedback() {const encoded = feedbackWrites.at(-1)!, request = JSON.parse(encoded); Object.assign(feedbackFields, {feedbackRequest: null, feedbackAck: true, feedbackAckId: request.id,
      feedbackResponse: JSON.stringify({id: request.id, accepted: true, replayed: false}), feedbackError: null, feedbackLastRequest: encoded})}, setGate(value?: Promise<void>) {gate = value}, changeWorld() {world = {...world, cutId: "next-cut"}},
    async close() {await clients.close(); for (const socket of sockets) socket.close(); await http.closeAll(); darkPeer.close(); await dark.peer.close(); await server.stop(true)}}
}

test("real HTTP Oracle router advertises client methods; human activity alone chooses one of two real WS Windows", async () => {
  const f = await fixture()
  try {
    expect(f.router.channels().find(item => item.identity === "cosmos-clients")?.methods).toEqual([CLIENT_ACT_METHOD, CLIENT_EVENTS_METHOD, CLIENT_INSPECT_METHOD, CLIENT_LOGS_METHOD, CLIENTS_READ_METHOD, CLIENT_CACHE_METHOD, CLIENT_CAPTURE_METHOD, CLIENT_DIAGNOSTICS_METHOD].sort())
    const a = await f.connect(), b = await f.connect()
    expect((await f.call<ClientsReceipt>(CLIENTS_READ_METHOD)).lastActive).toBeNull()
    a.activity("observed-focus")
    await waitFor(() => f.clients.events({}).entries.some(event => event.type === "activity"))
    b.heartbeat()
    expect((await f.call<ClientsReceipt>(CLIENTS_READ_METHOD)).lastActive).toEqual(a.target)
    const work = f.call<ClientCommandReceipt>(CLIENT_INSPECT_METHOD)
    await waitFor(() => a.messages.some(item => item.type === "command"))
    const message = a.messages.find(item => item.type === "command") as Extract<ClientOutbound, {type: "command"}>
    a.reply(message.requestId, {schema: "cosmos/client-inspection/v1", version: 1, status: status(), viewport: {width: 1, height: 1, devicePixelRatio: 1}, view: null})
    expect(await work).toMatchObject({ok: true, target: a.target})
    expect((await f.call<ClientsReceipt>(CLIENTS_READ_METHOD)).lastActive).toEqual(a.target)
    expect(b.messages.some(item => item.type === "command")).toBe(false)
    b.activity("keyboard")
    await waitFor(() => f.clients.events({}).entries.filter(event => event.type === "activity").length === 2)
    expect((await f.call<ClientsReceipt>(CLIENTS_READ_METHOD)).lastActive).toEqual(b.target)
    await expect(f.call(CLIENT_ACT_METHOD, {action: {type: "eval", source: "invalid"}})).rejects.toThrow("Invalid closed")
    expect((await fetch(`${f.origin}/oracle/rpc`, {method: "POST", body: "{}"})).status).toBe(401)
    expect((await fetch(`${f.origin}/clients/socket`, {headers: {Origin: "https://outsider.invalid"}})).status).toBe(403)
    expect((await fetch(`${f.origin}/clients/socket?forbidden=1`, {headers: {Origin: f.origin}})).status).toBe(400)
  } finally {await f.close()}
})

test("admitted action pins its original target through focus, disconnect and reconnect without retry", async () => {
  const f = await fixture()
  const gate = Promise.withResolvers<void>()
  try {
    const a = await f.connect(), b = await f.connect()
    a.activity(); await waitFor(() => f.clients.events({}).entries.some(event => event.type === "activity"))
    f.setGate(gate.promise)
    const work = f.clients.act({action: {type: "view.change", view: "network"}})
    b.activity(); await waitFor(() => f.clients.events({}).entries.filter(event => event.type === "activity").length === 2)
    a.socket.close(); await waitFor(() => a.socket.readyState === WebSocket.CLOSED)
    expect(await work).toMatchObject({ok: false, target: a.target, error: {code: "disconnected"}})
    gate.resolve(); f.setGate()
    const next = await f.connect(a.target.clientId)
    expect(next.target.connectionId).not.toBe(a.target.connectionId)
    expect((await f.call<ClientsReceipt>(CLIENTS_READ_METHOD)).lastActive).toEqual(b.target)
    expect(await f.call<ClientCommandReceipt>(CLIENT_ACT_METHOD, {target: a.target, action: {type: "view.change", view: "offices"}})).toMatchObject({ok: false, error: {code: "no_active_client"}})
    expect(b.messages.some(item => item.type === "command")).toBe(false)
    expect(next.messages.some(item => item.type === "command")).toBe(false)
  } finally {gate.resolve(); await f.close()}
})

test("Atom route selection crosses the same real Oracle and WS channel with a pinned ref and no caller URL", async () => {
  const f = await fixture()
  try {
    const a = await f.connect(), legacy = await f.connect(null, ["inspect", "view.change"])
    const work = f.call<ClientCommandReceipt>(CLIENT_ACT_METHOD, {target: a.target, action: {type: "atom.select", atomRef: "atom:42"}})
    await waitFor(() => a.messages.some(message => message.type === "command"))
    const command = a.messages.find(message => message.type === "command") as Extract<ClientOutbound, {type: "command"}>
    expect(command).toMatchObject({operation: "act", action: {type: "atom.select", atomRef: "atom:42"}})
    expect(Object.keys(command).sort()).toEqual(["type", "connectionId", "requestId", "deadline", "operation", "action"].sort())
    a.reply(command.requestId, {schema: "cosmos/client-action-result/v1", version: 1, status: "dispatched"})
    expect(await work).toMatchObject({ok: true, target: a.target})
    expect((await f.call<ClientsReceipt>(CLIENTS_READ_METHOD)).lastActive).toBeNull()
    expect(legacy.messages.some(message => message.type === "command")).toBeFalse()
    expect(await f.call<ClientCommandReceipt>(CLIENT_ACT_METHOD, {target: legacy.target, action: {type: "atom.select", atomRef: "atom:42"}})).toMatchObject({ok: false, target: legacy.target, error: {code: "unsupported"}})
    for (const action of [
      {type: "atom.select", atomRef: "assistant"}, {type: "atom.select", atomRef: "atom:42", url: "/injected/42"},
      {type: "atom.select", atomRef: "atom:42", verseId: "unassigned"},
    ]) await expect(f.call(CLIENT_ACT_METHOD, {target: a.target, action})).rejects.toThrow("Invalid closed")
    expect(a.messages.filter(message => message.type === "command")).toHaveLength(1)
  } finally {await f.close()}
})

test("boot failure and Window errors become bounded server events; pagination never skips records", async () => {
  const f = await fixture()
  try {
    const a = await f.connect()
    a.heartbeat({visible: true, focused: true, boot: {phase: "failed", trace: [{sequence: 1, phase: "failed", message: "font failed"}, {sequence: 2, phase: "window.error"}, {sequence: 3, phase: "window.unhandledrejection"}]}})
    await waitFor(() => f.clients.events({}).entries.some(event => event.type === "boot.failed"))
    const collected: ClientEvents["entries"] = []
    let cursor = 0
    for (let count = 0; count < 10; count++) {
      const page = await f.call<ClientEvents>(CLIENT_EVENTS_METHOD, {afterSequence: cursor, limit: 1})
      if (!page.entries.length) break
      collected.push(...page.entries); cursor = page.cursor
    }
    expect(collected.map(item => item.type)).toEqual(["registered", "boot.phase", "boot.failed", "window.error", "window.unhandledrejection"])
    expect(collected.find(item => item.type === "boot.failed")).toMatchObject({target: a.target, message: "font failed"})
    expect((await f.call<ClientsReceipt>(CLIENTS_READ_METHOD)).lastActive).toBeNull()
    a.heartbeat({visible: true, focused: true, boot: {phase: "failed", trace: [{sequence: 3, phase: "window.unhandledrejection"}]}})
    await Bun.sleep(3)
    expect((await f.call<ClientEvents>(CLIENT_EVENTS_METHOD)).entries).toHaveLength(5)
    for (let index = 0; index < 300; index++) a.heartbeat({visible: true, focused: true, boot: {phase: `bounded-${index}`, trace: []}})
    await waitFor(() => f.clients.events({}).dropped >= 49)
    const bounded = await f.call<ClientEvents>(CLIENT_EVENTS_METHOD, {limit: 128})
    expect(bounded.entries).toHaveLength(128)
    expect(bounded.dropped).toBeGreaterThan(0)
    expect(bounded.cursor).toBe(bounded.entries.at(-1)!.sequence)
  } finally {await f.close()}
})

test("invalid reply, timeout, changed world and registry shutdown fail closed and clean pending commands", async () => {
  const f = await fixture()
  try {
    const a = await f.connect()
    const invalid = f.call<ClientCommandReceipt>(CLIENT_INSPECT_METHOD, {target: a.target})
    await waitFor(() => a.messages.some(item => item.type === "command"))
    const message = a.messages.find(item => item.type === "command") as Extract<ClientOutbound, {type: "command"}>
    a.reply(message.requestId, {unexpected: true})
    expect(await invalid).toMatchObject({ok: false, error: {code: "invalid_reply"}})
    expect(await f.call<ClientCommandReceipt>(CLIENT_INSPECT_METHOD, {target: a.target})).toMatchObject({ok: false, error: {code: "timeout"}})
    expect(a.messages.some(item => item.type === "cancel")).toBe(true)
    const pending = f.clients.inspect({target: a.target})
    await f.clients.close()
    expect(await pending).toMatchObject({ok: false, error: {code: "disconnected"}})
    await waitFor(() => a.socket.readyState === WebSocket.CLOSED)
    await expect(f.clients.read({})).rejects.toThrow("unavailable")
  } finally {await f.close()}
  const changed = await fixture()
  try {
    const a = await changed.connect()
    changed.changeWorld()
    expect(await changed.call<ClientCommandReceipt>(CLIENT_INSPECT_METHOD, {target: a.target})).toMatchObject({ok: false, error: {code: "disconnected"}})
    expect((await changed.call<ClientsReceipt>(CLIENTS_READ_METHOD)).clients).toEqual([])
  } finally {await changed.close()}
})


test("real client feedback WS routes a service snapshot through Oracle and acknowledges only after canonical durable ack", async () => {
  const f = await fixture()
  try {
    const a = await f.connect()
    const input = {agentRef: "atom:17", world: {root: "@metafor/environment", cutId: "fixture-cut"}, request: {id: "annotation-1", text: "structured service observation",
      correlation: {clientId: a.target.clientId, connectionId: a.target.connectionId, annotationId: "semantic:node-1"}}}
    a.send({type: "feedback", connectionId: a.target.connectionId, feedback: input})
    await waitFor(() => f.feedbackWrites.length === 1)
    expect(a.messages.some(item => item.type === "feedback-receipt")).toBe(false)
    a.socket.close(); await waitFor(() => a.socket.readyState === WebSocket.CLOSED)
    const reconnected = await f.connect(a.target.clientId)
    reconnected.send({type: "feedback", connectionId: reconnected.target.connectionId, feedback: input})
    f.ackFeedback()
    await waitFor(() => reconnected.messages.some(item => item.type === "feedback-receipt"))
    expect(reconnected.messages.find(item => item.type === "feedback-receipt")).toMatchObject({connectionId: reconnected.target.connectionId, id: "annotation-1", ok: true, receipt: {accepted: true, replayed: true}})
    expect(f.feedbackWrites).toHaveLength(1)
    expect(JSON.parse(f.feedbackWrites[0]!)).toEqual(input.request)
    expect((await f.call<ClientEvents>(CLIENT_EVENTS_METHOD)).entries.filter(item => item.type === "feedback.accepted")).toHaveLength(1)
  } finally {await f.close()}
})

test("PNG chunks cross the real Oracle/WS channel and reject wrong sequence without retarget", async () => {
  const f = await fixture()
  try {
    const client = await f.connect(null, ["capture", "diagnostics"])
    const bytes = Buffer.alloc(300000)
    Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes)
    bytes.write("IHDR", 12)
    bytes.writeUInt32BE(13, 8)
    bytes.writeUInt32BE(1, 16)
    bytes.writeUInt32BE(1, 20)
    const encoded = bytes.toString("base64")
    const metadata = {schema: "cosmos/client-capture/v1", version: 1, mimeType: "image/png", width: 1, height: 1, byteLength: bytes.length, presentedBefore: 2, presentedAfter: 2, durationMs: 1} as const
    const pending = f.call<ClientCommandReceipt>(CLIENT_CAPTURE_METHOD, {target: client.target})
    await waitFor(() => client.messages.some(message => message.type === "command"))
    const command = client.messages.find(message => message.type === "command") as Extract<ClientOutbound, {type: "command"}>
    client.send({type: "capture-start", connectionId: client.target.connectionId, requestId: command.requestId, metadata, characters: encoded.length})
    for (let offset = 0; offset < encoded.length; offset += 48000) client.send({type: "capture-chunk", connectionId: client.target.connectionId, requestId: command.requestId, offset, data: encoded.slice(offset, offset + 48000)})
    client.send({type: "capture-end", connectionId: client.target.connectionId, requestId: command.requestId})
    const result = await pending
    expect(result.ok).toBeTrue()
    if (result.ok) expect(result.value).toEqual({...metadata, pngBase64: encoded})
    const rejected = f.call<ClientCommandReceipt>(CLIENT_CAPTURE_METHOD, {target: client.target})
    await waitFor(() => client.messages.filter(message => message.type === "command").length === 2)
    const next = client.messages.filter(message => message.type === "command").at(-1) as Extract<ClientOutbound, {type: "command"}>
    client.send({type: "capture-chunk", connectionId: client.target.connectionId, requestId: next.requestId, offset: 0, data: "AAAA"})
    expect(await rejected).toMatchObject({ok: false, error: {code: "invalid_reply"}, target: client.target})
    const legacy = await f.connect()
    expect(await f.call(CLIENT_CAPTURE_METHOD, {target: legacy.target})).toMatchObject({ok: false, error: {code: "unsupported"}})
    await expect(f.call(CLIENT_DIAGNOSTICS_METHOD, {target: client.target, sampleMs: 999999})).rejects.toThrow()
  } finally {await f.close()}
})
