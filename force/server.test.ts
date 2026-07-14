import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {ForceMessage} from "@metafor/types/force/message"

type ForceSocketData = {domain?: string; id?: string}

let previousPort: string | undefined
let server: Bun.Server<ForceSocketData>
const sockets = new Set<WebSocket>()

const nextMessage = (socket: WebSocket): Promise<unknown> => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    socket.removeEventListener("message", onMessage)
    reject(new Error("Timed out waiting for Force message"))
  }, 1000)
  const onMessage = (event: MessageEvent) => {
    clearTimeout(timeout)
    resolve(JSON.parse(String(event.data)) as unknown)
  }
  socket.addEventListener("message", onMessage, {once: true})
})

const nextMatchingMessage = (
  socket: WebSocket,
  predicate: (message: ForceMessage) => boolean,
): Promise<ForceMessage> => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    socket.removeEventListener("message", onMessage)
    reject(new Error("Timed out waiting for matching Force message"))
  }, 1000)
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

const connect = (domain: string, id: string): Promise<WebSocket> => new Promise((resolve, reject) => {
  const address = new URL("/ws", server.url)
  address.protocol = "ws:"
  const socket = new WebSocket(address)
  sockets.add(socket)
  const timeout = setTimeout(() => reject(new Error(`Timed out connecting Force client: ${domain}`)), 1000)
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

beforeAll(async () => {
  previousPort = Bun.env.PORT
  Bun.env.PORT = "0"
  server = (await import("./server.ts")).server
})

afterAll(() => {
  for (const socket of sockets) socket.close()
  sockets.clear()
  server.stop(true)
  if (previousPort === undefined) delete Bun.env.PORT
  else Bun.env.PORT = previousPort
})

describe("Force transport", () => {
  test("is stateless and broadcasts one-particle ForceMessages over WS and HTTP", async () => {
    const [dark, boundary] = await Promise.all([
      connect("dark", "dark-test"),
      connect("boundary", "boundary-test"),
    ])
    const wsMessage: ForceMessage = {
      parts: [{part: "inflaton", op: "test", path: "owner/project"}],
    }
    const boundaryWsDelivery = nextMessage(boundary)
    let echoedToDark = false
    dark.addEventListener("message", () => {
      echoedToDark = true
    }, {once: true})

    dark.send(JSON.stringify(wsMessage))

    expect(await boundaryWsDelivery).toEqual(wsMessage)
    await Bun.sleep(25)
    expect(echoedToDark).toBe(false)

    const httpMessage: ForceMessage = {
      parts: [{part: "graviton", op: "replace", path: "owner/project", value: {actor: 17}}],
    }
    const darkHttpDelivery = nextMessage(dark)
    const boundaryHttpDelivery = nextMessage(boundary)
    const response = await fetch(new URL("/force", server.url), {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(httpMessage),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ok: true, parts: 1})
    expect(await darkHttpDelivery).toEqual(httpMessage)
    expect(await boundaryHttpDelivery).toEqual(httpMessage)

    const lateAddress = new URL("/ws", server.url)
    lateAddress.protocol = "ws:"
    const lateBoundary = new WebSocket(lateAddress)
    sockets.add(lateBoundary)
    const lifecycleDelivery = nextMessage(lateBoundary)
    await new Promise<void>((resolve, reject) => {
      lateBoundary.addEventListener("open", () => {
        lateBoundary.send(JSON.stringify({type: "register", domain: "boundary", id: "boundary-late"}))
        resolve()
      }, {once: true})
      lateBoundary.addEventListener("error", () => reject(new Error("Failed connecting late Force client")), {once: true})
    })
    const lifecycle = await lifecycleDelivery as ForceMessage
    expect(lifecycle.parts).toHaveLength(1)
    expect(lifecycle.parts[0]).toMatchObject({part: "z", op: "test"})
    expect(String(lifecycle.parts[0].path)).toStartWith("force/replay/")
    expect(lifecycle).not.toEqual(wsMessage)
    expect(lifecycle).not.toEqual(httpMessage)
  })

  test("routes uncommitted Field mutations only to Boundary", async () => {
    const [boundary, matrix] = await Promise.all([
      connect("boundary", "boundary-routing"),
      connect("matrix", "matrix-routing"),
    ])
    await Bun.sleep(25)

    const input: ForceMessage = {
      parts: [{part: "gluon", op: "replace", path: 17, value: {fields: {101: 1}}}],
    }
    const boundaryDelivery = nextMatchingMessage(boundary, (message) =>
      message.parts[0]?.part === "gluon" && message.parts[0].path === 17,
    )
    let uncommittedReachedMatrix = false
    const matrixListener = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as ForceMessage
      const part = message.parts[0]
      if (part?.part === "gluon" && part.path === 17 && part.from === undefined) uncommittedReachedMatrix = true
    }
    matrix.addEventListener("message", matrixListener)

    const response = await fetch(new URL("/force", server.url), {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(input),
    })
    expect(response.status).toBe(200)
    expect(await boundaryDelivery).toEqual(input)
    await Bun.sleep(25)
    expect(uncommittedReachedMatrix).toBe(false)

    const committed: ForceMessage = {
      parts: [{part: "gluon", op: "replace", path: 17, from: "boundary:test", value: {fields: {101: 1}}}],
    }
    const matrixDelivery = nextMatchingMessage(matrix, (message) => message.parts[0]?.from === "boundary:test")
    boundary.send(JSON.stringify(committed))
    expect(await matrixDelivery).toEqual(committed)
    matrix.removeEventListener("message", matrixListener)
  })

  test("notifies existing clients when a new domain requests replay", async () => {
    const boundary = await connect("boundary", "boundary-replay-order")
    const matrixReplay = nextMatchingMessage(boundary, (message) =>
      message.parts[0]?.part === "z" &&
      message.parts[0].op === "test" &&
      message.parts[0].path === "force/replay/matrix/matrix-replay-order",
    )

    await connect("matrix", "matrix-replay-order")

    expect(await matrixReplay).toEqual({
      parts: [{part: "z", op: "test", path: "force/replay/matrix/matrix-replay-order"}],
    })
  })

  test("rejects an HTTP payload without parts", async () => {
    const response = await fetch(new URL("/force", server.url), {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: "null",
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ok: false, error: "body must be a plain ForceMessage with exactly one minimal particle"})
  })

  test("rejects create, snapshots, batches, and non-minimal particles", async () => {
    for (const body of [
      {type: "create", domain: "matrix", snapshot: {}},
      {type: "snapshot", snapshot: {}},
      {parts: []},
      {parts: [
        {part: "photon", op: "test", path: 1},
        {part: "photon", op: "test", path: 2},
      ]},
      {parts: [{part: "photon", op: "test", path: 1, domain: "matrix"}]},
    ]) {
      const response = await fetch(`${server.url}force`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(body),
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        ok: false,
        error: "body must be a plain ForceMessage with exactly one minimal particle",
      })
    }
  })

  test("drops invalid WebSocket batches and create payloads", async () => {
    const [dark, boundary] = await Promise.all([
      connect("dark", "dark-invalid"),
      connect("boundary", "boundary-invalid"),
    ])
    const received: unknown[] = []
    boundary.addEventListener("message", (event) => received.push(JSON.parse(String(event.data)) as unknown))

    dark.send(JSON.stringify({parts: [
      {part: "inflaton", op: "add", path: "owner/a/meta", value: {name: "A"}},
      {part: "inflaton", op: "add", path: "owner/b/meta", value: {name: "B"}},
    ]}))
    dark.send(JSON.stringify({type: "create", domain: "boundary", snapshot: {world: true}}))

    await Bun.sleep(25)
    expect(received).toEqual([])
  })
})
