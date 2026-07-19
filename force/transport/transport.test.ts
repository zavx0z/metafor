import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {ForceMessage, ForceMessageInput} from "@metafor/types/force/message"

describe.skip("Legacy Force transport replay contract", () => {

type ForceConstructor = new (domain: string) => {
  readonly connected: boolean
  onConnectionChange: (connected: boolean) => void
  onImpulse: (message: ForceMessage) => void | Promise<void>
  impulse: (message: ForceMessageInput) => void
}

const sockets: FakeWebSocket[] = []
const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location")
const originalWebSocket = Object.getOwnPropertyDescriptor(globalThis, "WebSocket")

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = FakeWebSocket.CONNECTING
  onopen: ((event: Event) => unknown) | null = null
  onmessage: ((event: MessageEvent) => unknown) | null = null
  onclose: ((event: CloseEvent) => unknown) | null = null
  onerror: ((event: Event) => unknown) | null = null
  readonly sent: unknown[] = []

  constructor(readonly url: string | URL) {
    sockets.push(this)
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN
      this.onopen?.(new Event("open"))
    })
  }

  send(data: unknown): void {
    this.sent.push(JSON.parse(String(data)) as unknown)
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED
  }

  receive(payload: unknown): void {
    this.onmessage?.({data: JSON.stringify(payload)} as MessageEvent)
  }
}

let BrowserForce: ForceConstructor
let BunForce: ForceConstructor

beforeAll(async () => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: new URL("http://force.test"),
  })
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    value: FakeWebSocket,
  })
  BrowserForce = (await import("./browser.ts")).Force
  BunForce = (await import("./bun.ts")).Force
})

afterAll(() => {
  if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation)
  else Reflect.deleteProperty(globalThis, "location")
  if (originalWebSocket) Object.defineProperty(globalThis, "WebSocket", originalWebSocket)
  else Reflect.deleteProperty(globalThis, "WebSocket")
})

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1_000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for Force transport event")
    await Bun.sleep(0)
  }
}

const verifyRawOrderedTransport = async (Force: ForceConstructor, domain: string): Promise<void> => {
  const force = new Force(domain)
  const socket = sockets.at(-1)!
  const connectionStates: boolean[] = []
  force.onConnectionChange = (connected) => connectionStates.push(connected)
  const order: string[] = []
  let releaseFirst!: () => void
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })

  force.onImpulse = async (message) => {
    const path = Number(message.parts[0].path)
    order.push(`impulse:${path}:start`)
    if (path === 1) await first
    order.push(`impulse:${path}:end`)
  }

  await waitFor(() => socket.sent.length === 2)
  expect(force.connected).toBe(true)
  expect(connectionStates).toEqual([false, true])
  expect(socket.sent).toEqual([
    {type: "register", domain, id: `${domain}-${domain.startsWith("browser") ? "web" : "local"}`},
    {parts: [{part: "z", op: "test", path: `force/replay/${domain}/${domain}-${domain.startsWith("browser") ? "web" : "local"}`, by: domain, ts: expect.any(Number)}]},
  ])

  socket.receive({type: "force", parts: [{part: "photon", op: "test", path: 1, by: "matrix", ts: 1}]})
  socket.receive({type: "snapshot", revision: 0})
  socket.receive({type: "create", snapshot: {revision: 0}})
  socket.receive({type: "error", error: "legacy"})
  socket.receive({parts: [{part: "photon", op: "test", path: 9}]})
  await Bun.sleep(0)
  expect(order).toEqual([])

  socket.receive({parts: [{part: "photon", op: "test", path: 1, by: "matrix", ts: 1}]})
  socket.receive({parts: [{part: "photon", op: "test", path: 2, by: "matrix", ts: 2}]})

  await waitFor(() => order.includes("impulse:1:start"))
  await Bun.sleep(0)
  expect(order).toEqual(["impulse:1:start"])

  releaseFirst()
  await waitFor(() => order.includes("impulse:2:end"))
  expect(order).toEqual([
    "impulse:1:start",
    "impulse:1:end",
    "impulse:2:start",
    "impulse:2:end",
  ])
}

const verifyOrdinaryImpulseOrder = async (Force: ForceConstructor, domain: string): Promise<void> => {
  const force = new Force(domain)
  const socket = sockets.at(-1)!
  const order: string[] = []
  let releaseFirst!: () => void
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })

  force.onImpulse = async (message) => {
    const path = Number(message.parts[0]?.path)
    order.push(`impulse:${path}:start`)
    if (path === 1) await first
    order.push(`impulse:${path}:end`)
  }

  socket.receive({parts: [{part: "photon", op: "test", path: 1, by: "matrix", ts: 1}]})
  socket.receive({parts: [{part: "photon", op: "test", path: 2, by: "matrix", ts: 2}]})

  await waitFor(() => order.includes("impulse:1:start"))
  await Bun.sleep(0)
  expect(order).toEqual(["impulse:1:start"])

  releaseFirst()
  await waitFor(() => order.includes("impulse:2:end"))
  expect(order).toEqual([
    "impulse:1:start",
    "impulse:1:end",
    "impulse:2:start",
    "impulse:2:end",
  ])
}

const verifyEarlyReplayBuffer = async (Force: ForceConstructor, domain: string): Promise<void> => {
  const force = new Force(domain)
  const socket = sockets.at(-1)!
  const replay: ForceMessage = {
    parts: [{part: "z", op: "test", path: `force/replay/${domain}/peer`, by: "force", ts: 1}],
  }
  const received: ForceMessage[] = []

  socket.receive(replay)
  await Bun.sleep(0)
  expect(received).toEqual([])

  force.onImpulse = (message) => {
    received.push(message)
  }

  await waitFor(() => received.length === 1)
  expect(received).toEqual([replay])
}

const verifyOutgoingSource = async (Force: ForceConstructor, domain: string): Promise<void> => {
  const force = new Force(domain)
  const socket = sockets.at(-1)!
  await waitFor(() => socket.sent.length === 2)

  force.impulse({parts: [{part: "inflaton", op: "add", path: "wimp", ts: 42, value: {src: "capsule", name: "Capsule"}}]})

  await waitFor(() => socket.sent.length === 3)
  expect(socket.sent[2]).toEqual({
    parts: [{part: "inflaton", op: "add", path: "wimp", by: domain, ts: 42, value: {src: "capsule", name: "Capsule"}}],
  })
}

describe("Force runtime transports", () => {
  test("Bun requests replay and serializes raw ForceMessages", async () => {
    await verifyRawOrderedTransport(BunForce, "bun-test")
  })

  test("browser requests replay, serializes particles, and rejects legacy wrappers", async () => {
    await verifyRawOrderedTransport(BrowserForce, "browser-test")
  })

  test("Bun serializes asynchronous ordinary ForceMessages", async () => {
    await verifyOrdinaryImpulseOrder(BunForce, "bun-ordinary-test")
  })

  test("browser serializes asynchronous ordinary ForceMessages", async () => {
    await verifyOrdinaryImpulseOrder(BrowserForce, "browser-ordinary-test")
  })

  test("Bun buffers replay received before runtime installs its handler", async () => {
    await verifyEarlyReplayBuffer(BunForce, "bun-early-replay")
  })

  test("browser buffers replay received before runtime installs its handler", async () => {
    await verifyEarlyReplayBuffer(BrowserForce, "browser-early-replay")
  })

  test("Bun assigns its domain while preserving the outgoing timestamp", async () => {
    await verifyOutgoingSource(BunForce, "dark")
  })

  test("browser assigns its domain while preserving the outgoing timestamp", async () => {
    await verifyOutgoingSource(BrowserForce, "bulk")
  })
})
})
