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
  test("registers clients, delivers create, and broadcasts plain ForceMessage over WS and HTTP", async () => {
    const [dark, boundary] = await Promise.all([
      connect("dark", "dark-test"),
      connect("boundary", "boundary-test"),
    ])
    const wsMessage: ForceMessage = {
      parts: [{part: "inflaton", op: "test", path: "zavx0z/git"}],
    }
    const darkWsDelivery = nextMessage(dark)
    const boundaryWsDelivery = nextMessage(boundary)

    dark.send(JSON.stringify(wsMessage))

    expect(await darkWsDelivery).toEqual(wsMessage)
    expect(await boundaryWsDelivery).toEqual(wsMessage)

    const httpMessage: ForceMessage = {
      parts: [{part: "graviton", op: "replace", path: "zavx0z/git", value: {actor: 17}}],
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

    const snapshot = {version: 1, runtime: {actors: [17]}}
    const createDelivery = nextMessage(boundary)
    dark.send(JSON.stringify({type: "create", domain: "boundary", snapshot}))

    expect(await createDelivery).toEqual({type: "create", snapshot})

    const lateAddress = new URL("/ws", server.url)
    lateAddress.protocol = "ws:"
    const lateBoundary = new WebSocket(lateAddress)
    sockets.add(lateBoundary)
    const lateCreate = nextMessage(lateBoundary)
    await new Promise<void>((resolve, reject) => {
      lateBoundary.addEventListener("open", () => {
        lateBoundary.send(JSON.stringify({type: "register", domain: "boundary", id: "boundary-late"}))
        resolve()
      }, {once: true})
      lateBoundary.addEventListener("error", () => reject(new Error("Failed connecting late Force client")), {once: true})
    })

    expect(await lateCreate).toEqual({type: "create", snapshot})
  })

  test("rejects an HTTP payload without parts", async () => {
    const response = await fetch(new URL("/force", server.url), {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: "null",
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ok: false, error: "body must be a plain ForceMessage with parts array"})
  })

  test("rejects a legacy typed ForceMessage wrapper over HTTP", async () => {
    const response = await fetch(`${server.url}force`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({type: "force", parts: []}),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ok: false, error: "body must be a plain ForceMessage with parts array"})
  })
})
