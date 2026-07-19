import {afterAll, afterEach, beforeAll, describe, expect, test} from "bun:test"
import type {ForceMessage} from "@metafor/types/force/message"

describe.skip("Legacy Force server replay contract", () => {

type ForceSocketData = {domain?: string; id?: string}

const ingressError = "body must be one supported unsourced Inflaton with a valid path and ts"
let previousPort: string | undefined
let server: Bun.Server<ForceSocketData>
const sockets = new Set<WebSocket>()

const nextMatchingMessage = (
  socket: WebSocket,
  predicate: (message: ForceMessage) => boolean,
): Promise<ForceMessage> => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    socket.removeEventListener("message", onMessage)
    reject(new Error("Timed out waiting for matching Force message"))
  }, 1_000)
  const onMessage = (event: MessageEvent) => {
    const value = JSON.parse(String(event.data)) as unknown
    if (typeof value !== "object" || value === null || !Array.isArray((value as {parts?: unknown}).parts)) return
    const message = value as ForceMessage
    if (!predicate(message)) return
    clearTimeout(timeout)
    socket.removeEventListener("message", onMessage)
    resolve(message)
  }
  socket.addEventListener("message", onMessage)
})

const watchFor = (socket: WebSocket, predicate: (message: ForceMessage) => boolean): (() => boolean) => {
  let seen = false
  socket.addEventListener("message", (event) => {
    const value = JSON.parse(String(event.data)) as ForceMessage
    if (predicate(value)) seen = true
  })
  return () => seen
}

const connect = (domain: string, id: string): Promise<WebSocket> => new Promise((resolve, reject) => {
  const address = new URL("/ws", server.url)
  address.protocol = "ws:"
  const socket = new WebSocket(address)
  sockets.add(socket)
  const timeout = setTimeout(() => reject(new Error(`Timed out connecting Force client: ${domain}`)), 1_000)
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({type: "register", domain, id}))
    setTimeout(() => {
      clearTimeout(timeout)
      resolve(socket)
    }, 10)
  }, {once: true})
  socket.addEventListener("error", () => {
    clearTimeout(timeout)
    reject(new Error(`Failed connecting Force client: ${domain}`))
  }, {once: true})
})

const postIngress = (body: unknown): Promise<Response> => fetch(new URL("/force", server.url), {
  method: "POST",
  headers: {"content-type": "application/json"},
  body: JSON.stringify(body),
})

const getHealth = async (): Promise<unknown> => (await fetch(new URL("/health", server.url))).json()

beforeAll(async () => {
  previousPort = Bun.env.PORT
  Bun.env.PORT = "0"
  server = (await import("./server.ts")).server
})

afterEach(async () => {
  for (const socket of sockets) socket.close()
  sockets.clear()
  await Bun.sleep(20)
})

afterAll(() => {
  server.stop(true)
  if (previousPort === undefined) delete Bun.env.PORT
  else Bun.env.PORT = previousPort
})

describe("Force trusted ingress", () => {
  test("reports only currently connected domains", async () => {
    const dark = await connect("dark", "dark-health")
    await connect("bulk", "bulk-health")

    expect(await getHealth()).toEqual({
      ok: true,
      domain: "force",
      connectedDomains: ["bulk", "dark"],
    })

    dark.close()
    await Bun.sleep(20)
    expect(await getHealth()).toEqual({
      ok: true,
      domain: "force",
      connectedDomains: ["bulk"],
    })
  })

  test("requires Dark and Bulk before accepting an external Particle", async () => {
    await connect("dark", "dark-only")
    const response = await postIngress({
      parts: [{part: "inflaton", op: "add", path: "wimp", ts: 1_700_000_000_000, value: {src: "capsule", name: "Capsule"}}],
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ok: false, error: "required Force domains are unavailable: bulk"})
  })

  test("marks an external Inflaton as agent and routes raw only to Dark and Bulk", async () => {
    const [dark, bulk, boundary, matrix] = await Promise.all([
      connect("dark", "dark-ingress"),
      connect("bulk", "bulk-ingress"),
      connect("boundary", "boundary-ingress"),
      connect("matrix", "matrix-ingress"),
    ])
    await Bun.sleep(20)
    const ts = 1_700_000_000_001
    const isCapsule = (message: ForceMessage) => message.parts[0]?.path === "wimp" && message.parts[0].ts === ts
    const darkDelivery = nextMatchingMessage(dark, isCapsule)
    const bulkDelivery = nextMatchingMessage(bulk, isCapsule)
    const reachedBoundary = watchFor(boundary, isCapsule)
    const reachedMatrix = watchFor(matrix, isCapsule)

    const response = await postIngress({
      parts: [{part: "inflaton", op: "add", path: "wimp", ts, value: {src: "capsule", name: "Capsule"}}],
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      parts: 1,
      delivered: ["bulk", "dark"],
      particle: {part: "inflaton", op: "add", path: "wimp", ts, value: {src: "capsule", name: "Capsule"}, by: "agent"},
    })
    const expected: ForceMessage = {parts: [{part: "inflaton", op: "add", path: "wimp", ts, value: {src: "capsule", name: "Capsule"}, by: "agent"}]}
    expect(await darkDelivery).toEqual(expected)
    expect(await bulkDelivery).toEqual(expected)
    await Bun.sleep(25)
    expect(reachedBoundary()).toBe(false)
    expect(reachedMatrix()).toBe(false)
  })

  test("accepts a root Meta read trigger and routes it only to Dark and Bulk", async () => {
    const [dark, bulk, boundary] = await Promise.all([
      connect("dark", "dark-meta-read"),
      connect("bulk", "bulk-meta-read"),
      connect("boundary", "boundary-meta-read"),
    ])
    await Bun.sleep(20)
    const ts = 1_700_000_000_003
    const matches = (message: ForceMessage) => message.parts[0]?.path === "owner/root" && message.parts[0].ts === ts
    const darkDelivery = nextMatchingMessage(dark, matches)
    const bulkDelivery = nextMatchingMessage(bulk, matches)
    const reachedBoundary = watchFor(boundary, matches)

    const response = await postIngress({
      parts: [{part: "inflaton", op: "test", path: "owner/root", ts}],
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      parts: 1,
      delivered: ["bulk", "dark"],
      particle: {part: "inflaton", op: "test", path: "owner/root", ts, by: "agent"},
    })
    const expected: ForceMessage = {
      parts: [{part: "inflaton", op: "test", path: "owner/root", ts, by: "agent"}],
    }
    expect(await darkDelivery).toEqual(expected)
    expect(await bulkDelivery).toEqual(expected)
    await Bun.sleep(25)
    expect(reachedBoundary()).toBe(false)
  })

  test("rejects caller-supplied sources and every unsupported ingress shape", async () => {
    for (const body of [
      null,
      {parts: [{part: "inflaton", op: "add", path: "wimp", by: "dark", ts: 1, value: {src: "capsule", name: "Capsule"}}]},
      {parts: [{part: "inflaton", op: "replace", path: "wimp", ts: 1, value: {src: "capsule", name: "Capsule"}}]},
      {parts: [{part: "inflaton", op: "add", path: "capsule/fields/name", ts: 1, value: {name: "Capsule"}}]},
      {parts: [{part: "inflaton", op: "add", path: "wimp", value: {src: "capsule", name: "Capsule"}}]},
      {parts: [{part: "inflaton", op: "add", path: "wimp", ts: 1, value: {src: "capsule", name: ""}}]},
      {parts: [{part: "inflaton", op: "add", path: "wimp", ts: 1, value: {src: "", name: "Capsule"}}]},
      {parts: [{part: "inflaton", op: "test", path: "../outside", ts: 1}]},
      {parts: [{part: "inflaton", op: "test", path: "owner/root", ts: 1, value: {}}]},
      {parts: [
        {part: "inflaton", op: "add", path: "wimp", ts: 1, value: {src: "capsule", name: "Capsule"}},
        {part: "inflaton", op: "add", path: "wimp", ts: 1, value: {src: "other", name: "Other"}},
      ]},
    ]) {
      const response = await postIngress(body)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ok: false, error: ingressError})
    }
  })
})

describe("Force domain routing", () => {
  test("accepts Dark re-emission, preserves ts, and routes it only to Boundary and Bulk", async () => {
    const [dark, bulk, boundary, matrix] = await Promise.all([
      connect("dark", "dark-reemit"),
      connect("bulk", "bulk-reemit"),
      connect("boundary", "boundary-reemit"),
      connect("matrix", "matrix-reemit"),
    ])
    await Bun.sleep(20)
    const ts = 1_700_000_000_002
    const message: ForceMessage = {
      parts: [{part: "inflaton", op: "add", path: "wimp", by: "dark", ts, value: {src: "capsule", name: "Capsule"}}],
    }
    const matches = (candidate: ForceMessage) => candidate.parts[0]?.path === "wimp" && candidate.parts[0].ts === ts
    const boundaryDelivery = nextMatchingMessage(boundary, matches)
    const bulkDelivery = nextMatchingMessage(bulk, matches)
    const reachedMatrix = watchFor(matrix, matches)

    dark.send(JSON.stringify(message))

    expect(await boundaryDelivery).toEqual(message)
    expect(await bulkDelivery).toEqual(message)
    await Bun.sleep(25)
    expect(reachedMatrix()).toBe(false)
  })

  test("drops a domain message whose by does not match the registered origin", async () => {
    const [dark, bulk] = await Promise.all([
      connect("dark", "dark-spoof"),
      connect("bulk", "bulk-spoof"),
    ])
    await Bun.sleep(20)
    const spoofed = {parts: [{part: "inflaton", op: "add", path: "wimp", by: "agent", ts: 7, value: {src: "spoof", name: "Spoof"}}]}
    const reachedBulk = watchFor(bulk, (message) => message.parts[0]?.path === "wimp")

    dark.send(JSON.stringify(spoofed))
    await Bun.sleep(25)

    expect(reachedBulk()).toBe(false)
  })

  test("routes uncommitted Field mutations only to Boundary", async () => {
    const [boundary, matrix, bulk] = await Promise.all([
      connect("boundary", "boundary-fields"),
      connect("matrix", "matrix-fields"),
      connect("bulk", "bulk-fields"),
    ])
    await Bun.sleep(20)
    const input: ForceMessage = {
      parts: [{part: "gluon", op: "replace", path: 17, by: "matrix", ts: 8, value: {fields: {101: 1}}}],
    }
    const boundaryDelivery = nextMatchingMessage(boundary, (message) => message.parts[0]?.path === 17)
    const reachedBulk = watchFor(bulk, (message) => message.parts[0]?.path === 17 && message.parts[0].from === undefined)

    matrix.send(JSON.stringify(input))

    expect(await boundaryDelivery).toEqual(input)
    await Bun.sleep(25)
    expect(reachedBulk()).toBe(false)
  })

  test("marks Force replay requests with by force", async () => {
    const boundary = await connect("boundary", "boundary-replay")
    const replay = nextMatchingMessage(boundary, (message) =>
      message.parts[0]?.path === "force/replay/matrix/matrix-replay",
    )

    await connect("matrix", "matrix-replay")

    expect(await replay).toEqual({
      parts: [{part: "z", op: "test", path: "force/replay/matrix/matrix-replay", by: "force", ts: expect.any(Number)}],
    })
  })
})
})
