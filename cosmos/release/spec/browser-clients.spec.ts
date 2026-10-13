import {expect, test} from "bun:test"
import {createBrowserClient} from "../main/clients"
import {createClientLogRecorder} from "../main/client-logs"
import {isClientAction, isClientResult, parseClientInbound} from "../shared/clients"
import type {ClientViewAction} from "@metafor/types/cosmos/client"

class Surface extends EventTarget {
  callbacks = new Map<string, Set<EventListenerOrEventListenerObject>>()
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    super.addEventListener(type, callback, options)
    if (callback) {let values = this.callbacks.get(type); if (!values) {values = new Set(); this.callbacks.set(type, values)}; values.add(callback)}
  }
  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    super.removeEventListener(type, callback, options)
    if (callback) this.callbacks.get(type)?.delete(callback)
  }
  human(type: string) {
    const event = {type, isTrusted: true} as Event
    for (const callback of this.callbacks.get(type) ?? []) typeof callback === "function" ? callback(event) : callback.handleEvent(event)
  }
}
class FakeWindow extends Surface {innerWidth = 1200; innerHeight = 800; devicePixelRatio = 2}
class FakeDocument extends Surface {visibilityState = "visible"; focused = true; hasFocus() {return this.focused}}
class FakeSocket extends EventTarget {
  readyState: 0 | 1 | 2 | 3 = 0
  bufferedAmount = 0
  messages: Record<string, unknown>[] = []
  send(text: string) {
    const value: unknown = JSON.parse(text)
    const parsed = parseClientInbound(value)
    expect(parsed).not.toBeNull()
    if (parsed?.type === "reply" && parsed.ok) {
      const schema = parsed.value.schema
      const operation = schema === "cosmos/client-inspection/v1" ? "inspect" : schema === "cosmos/client-logs/v1" ? "logs" : schema === "cosmos/client-cache/v1" ? "cache" : "act"
      expect(isClientResult(operation, parsed.value)).toBe(true)
    }
    this.messages.push(value as Record<string, unknown>)
  }
  open() {this.readyState = 1; this.dispatchEvent(new Event("open"))}
  receive(value: unknown) {this.dispatchEvent(new MessageEvent("message", {data: JSON.stringify(value)}))}
  close() {this.readyState = 3; this.dispatchEvent(new Event("close"))}
}
function quietConsole() {
  const calls: unknown[][] = []
  const output = Object.fromEntries(["log", "debug", "info", "warn", "error"].map(level => [level, (...args: unknown[]) => {calls.push([level, ...args])}])) as unknown as Console
  return {output, calls}
}
function fixture(inspect: (signal: AbortSignal) => Promise<null> | null = () => null, act: (action: ClientViewAction, signal: AbortSignal) => unknown = () => {}) {
  const window = new FakeWindow(), document = new FakeDocument(), sockets: FakeSocket[] = []
  const console = quietConsole()
  let acts = 0
  const runtime = createBrowserClient({window, document, console: console.output, url: "http://client.test/clients/socket", heartbeatMs: 20, reconnectMs: 10,
    socket(url) {expect(url).toBe("ws://client.test/clients/socket"); const value = new FakeSocket(); sockets.push(value); return value},
    inspect, act(action, signal) {acts++; return act(action, signal)},
  })
  runtime.start()
  const socket = sockets[0]!
  socket.open()
  const register = (value: FakeSocket, connectionId = "connection-1") => value.receive({type: "registered", version: 1, client: {id: "client-1", connectionId, world: {root: "@metafor/environment", cutId: "cut-1"}}})
  register(socket)
  const command = (requestId: string, rest: Record<string, unknown>) => socket.receive({type: "command", connectionId: "connection-1", requestId, deadline: Date.now() + 1000, ...rest})
  return {runtime, socket, window, document, sockets, register, command, console, acts: () => acts}
}
const tick = async () => {await Bun.sleep(1)}

test("Atom selection is a closed canonical ref action advertised and dispatched through the existing Window channel", async () => {
  const actions: ClientViewAction[] = []
  const f = fixture(undefined, action => {actions.push(action)})
  try {
    expect(f.socket.messages[0]?.capabilities).toContain("atom.select")
    expect(isClientAction({type: "atom.select", atomRef: "atom:42"})).toBeTrue()
    for (const input of [
      {type: "atom.select", atomRef: "assistant"}, {type: "atom.select", atomRef: "42"}, {type: "atom.select", atomRef: "atom:0"},
      {type: "atom.select", atomRef: "atom:01"}, {type: "atom.select", atomRef: "atom:42", url: "/other/42"},
      {type: "atom.select", atomRef: "atom:42", verseId: "other-world"}, {type: "atom.select", atomRef: "atom:42/other"},
      {type: "atom.select", atomRef: "atom:42\n"}, {type: "atom.select", atomRef: `atom:${"1".repeat(256)}`},
    ]) expect(isClientAction(input)).toBeFalse()
    const activity = f.socket.messages.filter(message => message.type === "activity").length
    f.command("select-atom", {operation: "act", action: {type: "atom.select", atomRef: "atom:42"}})
    await tick()
    expect(actions).toEqual([{type: "atom.select", atomRef: "atom:42"}])
    expect(f.socket.messages.find(message => message.requestId === "select-atom")).toMatchObject({ok: true, value: {status: "dispatched"}})
    expect(f.socket.messages.filter(message => message.type === "activity")).toHaveLength(activity)
  } finally {f.runtime.dispose()}
  const unsupported = fixture(undefined, () => {throw Object.assign(new Error("Scene is unavailable"), {code: "unsupported"})})
  try {
    unsupported.command("no-scene", {operation: "act", action: {type: "atom.select", atomRef: "atom:42"}})
    await tick()
    expect(unsupported.socket.messages.find(message => message.requestId === "no-scene")).toMatchObject({ok: false, error: {code: "unsupported"}})
    expect(unsupported.acts()).toBe(1)
  } finally {unsupported.runtime.dispose()}
})

test("early Window registers and inspects boot before Visual; only observed/trusted focus changes activity", async () => {
  const f = fixture()
  try {
    expect(f.socket.messages[0]).toMatchObject({type: "hello", clientId: null, status: {boot: {phase: "booting"}}})
    expect(f.socket.messages.filter(value => value.type === "activity")).toMatchObject([{event: "observed-focus"}])
    f.window.dispatchEvent(new Event("pointerdown"))
    await Bun.sleep(25)
    expect(f.socket.messages.filter(value => value.type === "activity")).toHaveLength(1)
    expect(f.socket.messages.some(value => value.type === "heartbeat")).toBe(true)
    f.command("inspect-1", {operation: "inspect"})
    await tick()
    expect(f.socket.messages.find(value => value.type === "reply")).toMatchObject({requestId: "inspect-1", ok: true, value: {view: null, status: {boot: {phase: "booting"}}, viewport: {width: 1200, height: 800}}})
    f.runtime.setPhase("ready")
    f.document.focused = false
    f.document.visibilityState = "hidden"
    f.window.human("keydown")
    expect(f.socket.messages.filter(value => value.type === "activity")).toHaveLength(1)
  } finally {f.runtime.dispose()}
})

test("trusted activity is observed, heartbeat and typed actions never synthesize human activity", async () => {
  const f = fixture()
  try {
    await Bun.sleep(305)
    f.window.human("pointerdown")
    expect(f.socket.messages.filter(value => value.type === "activity")).toHaveLength(2)
    f.command("act-1", {operation: "act", action: {type: "view.change", view: "offices"}})
    f.command("act-1", {operation: "act", action: {type: "view.change", view: "offices"}})
    f.command("bad-1", {operation: "act", action: {type: "eval", source: "forbidden"}})
    await tick()
    expect(f.acts()).toBe(1)
    expect(f.socket.messages.filter(value => value.type === "activity")).toHaveLength(2)
    expect(f.socket.messages.find(value => value.requestId === "bad-1")).toMatchObject({ok: false})
  } finally {f.runtime.dispose()}
})

test("server cancel, timeout, pagehide and new connection abort pending work and suppress late replies", async () => {
  const waits: {resolve(value: null): void; signal: AbortSignal}[] = []
  const f = fixture(signal => new Promise<null>(resolve => waits.push({resolve, signal})))
  try {
    f.command("cancel-1", {operation: "inspect"})
    f.socket.receive({type: "cancel", connectionId: "connection-1", requestId: "cancel-1", reason: "timeout"})
    expect(waits[0]!.signal.aborted).toBe(true)
    waits[0]!.resolve(null)
    await tick()
    expect(f.socket.messages.some(value => value.requestId === "cancel-1")).toBe(false)
    f.command("timeout-1", {operation: "inspect", deadline: Date.now() + 15})
    await Bun.sleep(20)
    expect(waits[1]!.signal.aborted).toBe(true)
    expect(f.socket.messages.find(value => value.requestId === "timeout-1")).toMatchObject({ok: false, error: {code: "timeout"}})
    waits[1]!.resolve(null)
    f.command("hide-1", {operation: "inspect"})
    f.window.dispatchEvent(new Event("pagehide"))
    expect(waits[2]!.signal.aborted).toBe(true)
    expect(f.socket.readyState).toBe(3)
    waits[2]!.resolve(null)
    f.window.dispatchEvent(new Event("pageshow"))
    const restored = f.sockets[1]!
    restored.open()
    f.register(restored, "connection-2")
    expect(restored.messages[0]).toMatchObject({type: "hello", clientId: "client-1"})
    expect(restored.messages.some(value => value.type === "activity")).toBe(false)
    f.socket.receive({type: "registered", version: 1, client: {id: "foreign", connectionId: "foreign"}})
    restored.receive({type: "command", connectionId: "connection-1", requestId: "stale", operation: "inspect", deadline: Date.now() + 1000})
    await tick()
    expect(waits).toHaveLength(3)
    expect(f.runtime.getStatus().boot.trace.map(item => item.phase)).toContain("pagehide")
  } finally {f.runtime.dispose()}
})

test("console and Window errors are copied without getters/toJSON; normal calls/restoration and paginated drops remain bounded", () => {
  const events = new Surface(), console = quietConsole(), original = console.output.log
  const log = createClientLogRecorder({console: console.output, events})
  let getters = 0, serializers = 0
  const dangerous = {get value() {getters++; throw new Error("getter")}, toJSON() {serializers++; throw new Error("toJSON")}, token: "private"}
  try {
    console.output.log("data", dangerous, new Error("actual failure"))
    const error = Object.assign(new Event("error"), {error: new Error("window failure")})
    events.dispatchEvent(error)
    events.dispatchEvent(Object.assign(new Event("unhandledrejection"), {reason: "rejected"}))
    expect(getters).toBe(0)
    expect(serializers).toBe(0)
    expect(console.calls).toHaveLength(1)
    for (const level of ["log", "debug", "info", "warn", "error"] as const) console.output[level](level)
    expect(log.read().entries.map(item => item.level)).toEqual(["log", "error", "error", "log", "debug", "info", "warn", "error"])
    const first = log.read(0, 1)
    expect(first.entries[0]).toMatchObject({level: "log"})
    expect(first.entries[0]!.values?.[1]).toMatchObject({value: "[accessor]", token: "[redacted]"})
    expect(first.entries[0]!.values?.[2]).toHaveProperty("stack")
    expect(first.entries[0]!.message).toContain("actual failure")
    expect(log.read(first.cursor, 2).entries).toHaveLength(2)
    console.output.warn("control byte \u0000")
    expect(isClientResult("logs", log.read())).toBe(true)
    for (let index = 0; index < 300; index++) console.output.debug("bounded", index)
    const result = log.read(0, 128)
    expect(result.entries).toHaveLength(128)
    expect(result.dropped).toBeGreaterThan(0)
    expect(result.cursor).toBe(result.entries.at(-1)!.sequence)
    expect(() => log.read(-1)).toThrow()
  } finally {log.dispose()}
  expect(console.output.log).toBe(original)
  expect(events.callbacks.get("error")?.size).toBe(0)
})

test("early fatal initialization and logs stay inspectable without Visual or browser automation", async () => {
  const f = fixture()
  try {
    f.runtime.fail(new Error("font startup failed"))
    f.command("logs-1", {operation: "logs", afterSequence: 0, limit: 10})
    f.command("fatal-inspect", {operation: "inspect"})
    await tick()
    expect(f.socket.messages.find(value => value.requestId === "logs-1")).toMatchObject({ok: true, value: {from: "release-main", entries: [{level: "error"}]}})
    expect(f.socket.messages.find(value => value.requestId === "fatal-inspect")).toMatchObject({ok: true, value: {view: null, status: {boot: {phase: "failed"}}}})
  } finally {f.runtime.dispose()}
})


test("stale control failure is typed and the action is never retried", async () => {
  const f = fixture(undefined, () => {throw Object.assign(new Error("Stale fixture control"), {code: "stale_control"})})
  try {
    f.command("stale-control", {operation: "act", action: {type: "control.activate", controlId: "obsolete-control"}})
    await tick()
    expect(f.socket.messages.find(value => value.requestId === "stale-control")).toMatchObject({ok: false, error: {code: "stale_control"}})
    expect(f.acts()).toBe(1)
  } finally {f.runtime.dispose()}
})


test("service feedback reconnect keeps its id, payload, original correlation and pinned Agent until durable receipt", async () => {
  const f = fixture()
  const lifetime = new AbortController()
  const input: import("@metafor/types/cosmos/client").ClientAnnotationFeedback = {agentRef: "atom:17", world: {root: "@metafor/environment", cutId: "cut-1"},
    request: {id: "feedback-1", text: "service-observation-data", correlation: {clientId: "client-1", connectionId: "connection-1", annotationId: "semantic:selection-1"}}}
  try {
    const waiting = f.runtime.feedback(input, lifetime.signal)
    expect(f.runtime.feedback(input, lifetime.signal)).toBe(waiting)
    expect(f.socket.messages.filter(message => message.type === "feedback")).toHaveLength(1)
    f.socket.close()
    await Bun.sleep(15)
    const socket = f.sockets[1]!
    socket.open(); f.register(socket, "connection-2")
    const delivered = socket.messages.find(message => message.type === "feedback")
    expect(delivered).toEqual({type: "feedback", connectionId: "connection-2", feedback: input})
    await expect(f.runtime.feedback({...input, request: {...input.request, text: "different"}}, lifetime.signal)).rejects.toThrow("immutable payload")
    socket.receive({type: "feedback-receipt", connectionId: "connection-2", id: "feedback-1", ok: true, receipt: {id: "feedback-1", accepted: true, replayed: true}})
    expect(await waiting).toEqual({id: "feedback-1", accepted: true, replayed: true})
    expect(socket.messages.filter(message => message.type === "activity")).toHaveLength(0)
  } finally {lifetime.abort(); f.runtime.dispose()}
})
