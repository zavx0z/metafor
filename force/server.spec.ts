import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {ForceMessage} from "@metafor/types/force/message"
import type {ForceMonad} from "./monad.ts"
import type {ForceDomain} from "./store.ts"

type ConnectedClient = {
  socket: WebSocket
  messages: ForceMessage[]
}

let previousPort: string | undefined
let server: Bun.Server<unknown>
let monad: ForceMonad
const clients: ConnectedClient[] = []

const waitFor = async (predicate: () => boolean | Promise<boolean>): Promise<void> => {
  const deadline = Date.now() + 1_000
  while (!await predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for Force server event")
    await Bun.sleep(1)
  }
}

const connect = (domain: ForceDomain): Promise<ConnectedClient> => new Promise((resolve, reject) => {
  const address = new URL("/ws", server.url)
  address.protocol = "ws:"
  address.searchParams.set("domain", domain)
  address.searchParams.set("id", `${domain}-test`)
  const socket = new WebSocket(address)
  const messages: ForceMessage[] = []
  const client = {socket, messages}
  clients.push(client)
  const timeout = setTimeout(() => reject(new Error(`Timed out connecting Force domain: ${domain}`)), 1_000)
  socket.addEventListener("message", (event) => {
    messages.push(JSON.parse(String(event.data)) as ForceMessage)
  })
  socket.addEventListener("open", () => {
    clearTimeout(timeout)
    resolve(client)
  }, {once: true})
  socket.addEventListener("error", () => {
    clearTimeout(timeout)
    reject(new Error(`Could not connect Force domain: ${domain}`))
  }, {once: true})
})

beforeAll(async () => {
  previousPort = Bun.env.PORT
  Bun.env.PORT = "0"
  const module = await import(`./server.ts?test=${crypto.randomUUID()}`)
  server = module.server
  monad = module.monad
})

afterAll(() => {
  monad.onServerStopping()
  for (const client of clients) client.socket.close()
  server.stop(true)
  if (previousPort === undefined) delete Bun.env.PORT
  else Bun.env.PORT = previousPort
})

describe("Force server transport and relay", () => {
  test("builds five channels through HTTP Upgrade and relays only Particle frames", async () => {
    const before = await fetch(new URL("/health", server.url))
    expect(before.status).toBe(503)
    expect(await before.json()).toMatchObject({state: "starting", connectedDomains: []})

    const connected = Object.fromEntries(await Promise.all(
      (["dark", "boundary", "matrix", "energy", "bulk"] as const).map(async (domain) => [domain, await connect(domain)]),
    )) as Record<ForceDomain, ConnectedClient>

    await waitFor(async () => (await fetch(new URL("/health", server.url))).status === 200)
    await Bun.sleep(10)
    for (const domain of ["dark", "boundary", "matrix", "energy", "bulk"] as const) {
      expect(connected[domain].messages).toEqual([])
    }

    const response = await fetch(new URL("/force", server.url), {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({
        parts: [{
          part: "inflaton",
          op: "add",
          path: "wimp",
          ts: 7,
          value: {src: "capsule", name: "Capsule"},
        }],
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ok: true, delivered: ["dark", "bulk"]})
    await waitFor(() => connected.dark.messages.length === 1 && connected.bulk.messages.length === 1)
    expect(connected.dark.messages[0]).toEqual({
      parts: [{
        part: "inflaton",
        op: "add",
        path: "wimp",
        by: "agent",
        ts: 7,
        value: {src: "capsule", name: "Capsule"},
      }],
    })
    expect(connected.boundary.messages).toEqual([])
    expect(connected.matrix.messages).toEqual([])
    expect(connected.energy.messages).toEqual([])

    connected.matrix.socket.close()
    await waitFor(async () => (await fetch(new URL("/health", server.url))).status === 503)
    const failed = await fetch(new URL("/health", server.url))
    expect(await failed.json()).toMatchObject({
      state: "error",
      error: "Force stopped: matrix channel was destroyed: WebSocket closed",
    })
  })
})
