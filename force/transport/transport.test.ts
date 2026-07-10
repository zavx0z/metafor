import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {ForceMessage} from "@metafor/types/force/message"

type ForceConstructor = new (domain: string) => {
  onCreate: (snapshot: unknown) => void | Promise<void>
  onImpulse: (message: ForceMessage) => void | Promise<void>
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

  constructor(readonly url: string | URL) {
    sockets.push(this)
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN
      this.onopen?.(new Event("open"))
    })
  }

  send(_data: unknown): void {}

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
  const order: string[] = []
  let releaseFirst!: () => void
  let releaseSecond!: () => void
  const first = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const second = new Promise<void>((resolve) => {
    releaseSecond = resolve
  })

  force.onCreate = async (snapshot) => {
    const revision = (snapshot as {revision: number}).revision
    order.push(`create:${revision}:start`)
    await (revision === 1 ? first : second)
    order.push(`create:${revision}:end`)
  }
  force.onImpulse = () => {
    order.push("impulse")
  }

  socket.receive({type: "force", parts: [{part: "photon", op: "test", path: 1}]})
  socket.receive({type: "snapshot", revision: 0})
  socket.receive({type: "error", error: "legacy"})
  await Bun.sleep(0)
  expect(order).toEqual([])

  socket.receive({type: "create", snapshot: {revision: 1}})
  socket.receive({type: "create", snapshot: {revision: 2}})
  socket.receive({parts: [{part: "photon", op: "test", path: 1}]})

  await waitFor(() => order.includes("create:1:start"))
  await Bun.sleep(0)
  expect(order).toEqual(["create:1:start"])

  releaseFirst()
  await waitFor(() => order.includes("create:2:start"))
  expect(order).toEqual(["create:1:start", "create:1:end", "create:2:start"])

  releaseSecond()
  await waitFor(() => order.includes("impulse"))
  expect(order).toEqual([
    "create:1:start",
    "create:1:end",
    "create:2:start",
    "create:2:end",
    "impulse",
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

  socket.receive({parts: [{part: "photon", op: "test", path: 1}]})
  socket.receive({parts: [{part: "photon", op: "test", path: 2}]})

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

describe("Force runtime transports", () => {
  test("Bun serializes repeated create before a raw ForceMessage", async () => {
    await verifyRawOrderedTransport(BunForce, "bun-test")
  })

  test("browser serializes repeated create and rejects legacy wrappers", async () => {
    await verifyRawOrderedTransport(BrowserForce, "browser-test")
  })

  test("Bun serializes asynchronous ordinary ForceMessages", async () => {
    await verifyOrdinaryImpulseOrder(BunForce, "bun-ordinary-test")
  })

  test("browser serializes asynchronous ordinary ForceMessages", async () => {
    await verifyOrdinaryImpulseOrder(BrowserForce, "browser-ordinary-test")
  })
})
