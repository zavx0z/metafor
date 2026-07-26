import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import type {ForceMessage} from "shared/protocol/force/message"
import {MONAD_RPC_VERSION, type RoutedMonadRpcCall} from "shared/protocol/monad/rpc"
import {READ_META_JSON_METHOD} from "@metafor/types/metafor/meta-json"
import type {RemoteForceDomain} from "./force/store.ts"

type ConnectedClient = {
  socket: WebSocket
  messages: ForceMessage[]
}

let previousPort: string | undefined
let previousCompatPort: string | undefined
let previousLegacyHistory: string | undefined
let previousForceHistory: string | undefined
let previousCutId: string | undefined
let server: Bun.Server<unknown>
let stopDark: () => Promise<void>
let forceHistory: {status(): {sequence: number}}
let providerServer: Bun.Server<unknown>
let directory: string
const rpcCalls: RoutedMonadRpcCall[] = []
const clients: ConnectedClient[] = []

const waitFor = async (predicate: () => boolean | Promise<boolean>): Promise<void> => {
  const deadline = Date.now() + 1_000
  while (!await predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for Force server event")
    await Bun.sleep(1)
  }
}

const connect = (domain: RemoteForceDomain): Promise<ConnectedClient> => new Promise((resolve, reject) => {
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

const openMonadChannel = async (
  identity: string,
  methods: readonly string[] = [],
  endpoint?: URL,
): Promise<string> => {
  const response = await fetch(new URL("/monad/channels", server.url), {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
      version: MONAD_RPC_VERSION,
      identity,
      methods,
      ...(endpoint === undefined ? {} : {endpoint, callback: `${identity}-callback`}),
    }),
  })
  expect(response.status).toBe(201)
  const payload = await response.json() as {channel: string}
  expect(payload.channel).toBeString()
  return payload.channel
}

const monadRequest = (
  path: "/monad/rpc" | "/monad/channel",
  channel: string,
  method: "POST" | "DELETE",
  body?: unknown,
): Promise<Response> => {
  const init: RequestInit = {
    method,
    headers: {
      authorization: `Bearer ${channel}`,
      ...(body === undefined ? {} : {"content-type": "application/json"}),
    },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  return fetch(new URL(path, server.url), init)
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "metafor-dark-server-"))
  providerServer = Bun.serve({
    port: 0,
    routes: {
      "/rpc": {
        async POST(request) {
          const call = await request.json() as RoutedMonadRpcCall
          rpcCalls.push(call)
          if ((call.params as {fail?: unknown}).fail === true) {
            return Response.json({
              version: MONAD_RPC_VERSION,
              id: call.id,
              ok: false,
              error: {code: "method_error", message: "Boundary read failed"},
            }, {status: 500})
          }
          return Response.json({
            version: MONAD_RPC_VERSION,
            id: call.id,
            ok: true,
            result: {version: 1, atoms: [], declarations: []},
          })
        },
      },
    },
  })
  previousPort = Bun.env.PORT
  previousCompatPort = Bun.env.DARK_COMPAT_PORT
  previousLegacyHistory = Bun.env.DARK_HISTORY_PATH
  previousForceHistory = Bun.env.DARK_FORCE_HISTORY_PATH
  previousCutId = Bun.env.DARK_FORCE_HISTORY_CUT_ID
  Bun.env.PORT = "0"
  Bun.env.DARK_COMPAT_PORT = "0"
  Bun.env.DARK_HISTORY_PATH = join(directory, "legacy.jsonl")
  Bun.env.DARK_FORCE_HISTORY_PATH = join(directory, "force-history", "v1")
  Bun.env.DARK_FORCE_HISTORY_CUT_ID = "server-spec-cut"
  const module = await import(`./server.ts?test=${crypto.randomUUID()}`)
  server = module.server
  stopDark = module.stop
  forceHistory = module.forceHistory
})

afterAll(async () => {
  for (const client of clients) client.socket.close()
  await stopDark()
  providerServer.stop(true)
  if (previousPort === undefined) delete Bun.env.PORT
  else Bun.env.PORT = previousPort
  if (previousCompatPort === undefined) delete Bun.env.DARK_COMPAT_PORT
  else Bun.env.DARK_COMPAT_PORT = previousCompatPort
  if (previousLegacyHistory === undefined) delete Bun.env.DARK_HISTORY_PATH
  else Bun.env.DARK_HISTORY_PATH = previousLegacyHistory
  if (previousForceHistory === undefined) delete Bun.env.DARK_FORCE_HISTORY_PATH
  else Bun.env.DARK_FORCE_HISTORY_PATH = previousForceHistory
  if (previousCutId === undefined) delete Bun.env.DARK_FORCE_HISTORY_CUT_ID
  else Bun.env.DARK_FORCE_HISTORY_CUT_ID = previousCutId
  rmSync(directory, {recursive: true, force: true})
})

describe("Force server transport and relay", () => {
  test("binds Monad identity to one duplex REST channel and removes it on close", async () => {
    const boundaryChannel = await openMonadChannel(
      "boundary",
      ["boundary.initialState.read"],
      new URL("/rpc", providerServer.url),
    )
    const interpreterChannel = await openMonadChannel("interpreter")

    const liveMetaJSON = await monadRequest("/monad/rpc", interpreterChannel, "POST", {
      version: MONAD_RPC_VERSION,
      id: "live-metajson",
      target: "dark",
      method: READ_META_JSON_METHOD,
      params: {root: "not-canonical"},
    })
    expect(liveMetaJSON.status).toBe(502)
    expect(await liveMetaJSON.json()).toMatchObject({
      ok: false,
      error: {
        code: "method_error",
        message: "MetaJSON read root must be a canonical <owner>/<repository> address",
      },
    })

    const response = await monadRequest("/monad/rpc", interpreterChannel, "POST", {
        version: MONAD_RPC_VERSION,
        id: "matrix-birth-server",
        source: "forged-source",
        target: "boundary",
        method: "boundary.initialState.read",
        params: {},
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      version: MONAD_RPC_VERSION,
      id: "matrix-birth-server",
      ok: true,
      result: {version: 1, atoms: [], declarations: []},
    })
    expect(rpcCalls[0]).toEqual({
      version: MONAD_RPC_VERSION,
      id: "matrix-birth-server",
      source: "interpreter",
      target: "boundary",
      method: "boundary.initialState.read",
      params: {},
    })

    await openMonadChannel(
      "administration",
      ["administration.health.read"],
      new URL("/rpc", providerServer.url),
    )

    const administrativeResponse = await monadRequest("/monad/rpc", interpreterChannel, "POST", {
        version: MONAD_RPC_VERSION,
        id: "administration-health",
        target: "administration",
        method: "administration.health.read",
        params: {},
    })
    expect(administrativeResponse.status).toBe(200)
    expect(rpcCalls[1]).toMatchObject({
      id: "administration-health",
      source: "interpreter",
      target: "administration",
      method: "administration.health.read",
    })

    const matrixChannel = await openMonadChannel("matrix")
    const failed = await monadRequest("/monad/rpc", matrixChannel, "POST", {
        version: MONAD_RPC_VERSION,
        id: "matrix-birth-failed",
        target: "boundary",
        method: "boundary.initialState.read",
        params: {fail: true},
    })
    expect(failed.status).toBe(502)
    expect(await failed.json()).toEqual({
      version: MONAD_RPC_VERSION,
      id: "matrix-birth-failed",
      ok: false,
      error: {code: "method_error", message: "Boundary read failed"},
    })

    const unauthorized = await fetch(new URL("/monad/rpc", server.url), {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({
        version: MONAD_RPC_VERSION,
        id: "forged",
        target: "boundary",
        method: "boundary.initialState.read",
        params: {},
      }),
    })
    expect(unauthorized.status).toBe(401)

    const closed = await monadRequest("/monad/channel", boundaryChannel, "DELETE")
    expect(closed.status).toBe(200)
    const unavailable = await monadRequest("/monad/rpc", interpreterChannel, "POST", {
      version: MONAD_RPC_VERSION,
      id: "after-boundary-close",
      target: "boundary",
      method: "boundary.initialState.read",
      params: {},
    })
    expect(unavailable.status).toBe(503)
    expect(await unavailable.json()).toMatchObject({
      ok: false,
      error: {code: "provider_unavailable"},
    })

    const health = await fetch(new URL("/health", server.url))
    expect(health.status).toBe(503)
    expect(await health.json()).toMatchObject({state: "starting", connectedDomains: ["dark"]})
  })

  test("combines one local Dark adapter with four remote channels and relays only Particle frames", async () => {
    const before = await fetch(new URL("/health", server.url))
    expect(before.status).toBe(503)
    expect(await before.json()).toMatchObject({state: "starting", connectedDomains: ["dark"]})
    const selfWebSocket = await fetch(new URL("/ws?domain=dark&id=forbidden-self-socket", server.url))
    expect(selfWebSocket.status).toBe(400)

    const connected = Object.fromEntries(await Promise.all(
      (["boundary", "matrix", "energy", "bulk"] as const).map(async (domain) => [domain, await connect(domain)]),
    )) as Record<RemoteForceDomain, ConnectedClient>

    await waitFor(async () => (await fetch(new URL("/health", server.url))).status === 200)
    await Bun.sleep(10)
    for (const domain of ["boundary", "matrix", "energy", "bulk"] as const) {
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
          value: {src: "example/capsule", name: "Capsule"},
        }],
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ok: true, delivered: ["dark", "bulk"]})
    await waitFor(() => connected.boundary.messages.length === 1 && connected.bulk.messages.length === 2)
    expect(connected.bulk.messages[0]).toEqual({
      parts: [{
        part: "inflaton",
        op: "add",
        path: "wimp",
        by: "agent",
        ts: 7,
        value: {src: "example/capsule", name: "Capsule"},
      }],
    })
    expect(connected.boundary.messages[0]).toMatchObject({
      parts: [{
        part: "inflaton",
        op: "add",
        path: "wimp",
        by: "dark",
        ts: 7,
        value: {src: "example/capsule", name: "Capsule"},
      }],
    })
    expect(connected.matrix.messages).toEqual([])
    expect(connected.energy.messages).toEqual([])
    expect(forceHistory.status().sequence).toBe(2)

    connected.matrix.socket.close()
    await waitFor(async () => (await fetch(new URL("/health", server.url))).status === 503)
    const failed = await fetch(new URL("/health", server.url))
    expect(await failed.json()).toMatchObject({
      state: "error",
      error: "Force stopped: matrix channel was destroyed: WebSocket closed",
    })
  })
})
