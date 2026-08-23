import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {existsSync, mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import type {ForceMessage} from "shared/protocol/force/message"
import {DOMAIN_HEALTH_READ_METHOD} from "shared/protocol/oracle/health"
import {
  ORACLE_RPC_VERSION,
  isRoutedOracleRpcCall,
  type RoutedOracleRpcCall,
} from "shared/protocol/oracle/rpc"
import {READ_GRAPH_METHOD} from "@metafor/types/metafor/graph"
import type {RemoteForceDomain} from "./force/store.ts"

type ConnectedClient = {
  socket: WebSocket
  messages: ForceMessage[]
}

let previousPort: string | undefined
let previousForceHistory: string | undefined
let previousCutId: string | undefined
let previousCheckpointSideband: string | undefined
let server: Bun.Server<unknown>
let stopDark: () => Promise<void>
let forceHistory: {status(): {sequence: number}}
let providerServer: Bun.Server<unknown>
let directory: string
const rpcCalls: RoutedOracleRpcCall[] = []
const clients: ConnectedClient[] = []
const oracleClients: WebSocket[] = []

const waitFor = async (predicate: () => boolean | Promise<boolean>): Promise<void> => {
  const deadline = Date.now() + 1_000
  while (!await predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for Dark server event")
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

const connectOracle = (identity: RemoteForceDomain): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const address = new URL("/oracle/ws", server.url)
    address.protocol = "ws:"
    address.searchParams.set("identity", identity)
    address.searchParams.set("id", `${identity}-oracle-test`)
    const socket = new WebSocket(address)
    oracleClients.push(socket)
    const timeout = setTimeout(
      () => reject(new Error(`Timed out connecting Oracle domain: ${identity}`)),
      1_000,
    )
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        kind: "oracle.open",
        version: ORACLE_RPC_VERSION,
        identity,
        methods: [DOMAIN_HEALTH_READ_METHOD],
      }))
    })
    socket.addEventListener("message", (event) => {
      const value = JSON.parse(String(event.data)) as unknown
      if (
        typeof value === "object" &&
        value !== null &&
        "kind" in value &&
        value.kind === "oracle.opened"
      ) {
        clearTimeout(timeout)
        resolve(socket)
        return
      }
      if (
        isRoutedOracleRpcCall(value) &&
        value.method === DOMAIN_HEALTH_READ_METHOD
      ) {
        socket.send(JSON.stringify({
          version: ORACLE_RPC_VERSION,
          id: value.id,
          ok: true,
          result: {
            ok: true,
            domain: identity,
            initialized: true,
            rpc: "ready",
            error: null,
          },
        }))
      }
    })
    socket.addEventListener("error", () => {
      clearTimeout(timeout)
      reject(new Error(`Could not connect Oracle domain: ${identity}`))
    }, {once: true})
  })

const openOracleChannel = async (
  identity: string,
  methods: readonly string[] = [],
  endpoint?: URL,
): Promise<string> => {
  const response = await fetch(new URL("/oracle/channels", server.url), {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
      version: ORACLE_RPC_VERSION,
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

const oracleRequest = (
  path: "/oracle/rpc" | "/oracle/channel",
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
          const call = await request.json() as RoutedOracleRpcCall
          rpcCalls.push(call)
          if ((call.params as {fail?: unknown}).fail === true) {
            return Response.json({
              version: ORACLE_RPC_VERSION,
              id: call.id,
              ok: false,
              error: {code: "method_error", message: "Boundary read failed"},
            }, {status: 500})
          }
          return Response.json({
            version: ORACLE_RPC_VERSION,
            id: call.id,
            ok: true,
            result: {version: 1, atoms: [], declarations: []},
          })
        },
      },
    },
  })
  previousPort = Bun.env.PORT
  previousForceHistory = Bun.env.DARK_FORCE_HISTORY_PATH
  previousCutId = Bun.env.DARK_FORCE_HISTORY_CUT_ID
  previousCheckpointSideband = Bun.env.DARK_CHECKPOINT_SIDEBAND
  Bun.env.PORT = "0"
  Bun.env.DARK_FORCE_HISTORY_PATH = join(directory, "force-history", "v1")
  Bun.env.DARK_FORCE_HISTORY_CUT_ID = "server-spec-cut"
  Bun.env.DARK_CHECKPOINT_SIDEBAND = "0"
  const module = await import(`./server.ts?test=${crypto.randomUUID()}`)
  server = module.server
  stopDark = module.stop
  forceHistory = module.forceHistory
})

afterAll(async () => {
  for (const client of clients) client.socket.close()
  for (const socket of oracleClients) socket.close()
  await stopDark()
  providerServer.stop(true)
  if (previousPort === undefined) delete Bun.env.PORT
  else Bun.env.PORT = previousPort
  if (previousForceHistory === undefined) delete Bun.env.DARK_FORCE_HISTORY_PATH
  else Bun.env.DARK_FORCE_HISTORY_PATH = previousForceHistory
  if (previousCutId === undefined) delete Bun.env.DARK_FORCE_HISTORY_CUT_ID
  else Bun.env.DARK_FORCE_HISTORY_CUT_ID = previousCutId
  if (previousCheckpointSideband === undefined) delete Bun.env.DARK_CHECKPOINT_SIDEBAND
  else Bun.env.DARK_CHECKPOINT_SIDEBAND = previousCheckpointSideband
  rmSync(directory, {recursive: true, force: true})
})

describe("Dark server transport and relay", () => {
  test("does not create or expose the retired legacy Dark history", () => {
    expect(existsSync(join(directory, "dark-history.jsonl"))).toBe(false)
  })

  test("binds Oracle identity to one duplex REST channel and removes it on close", async () => {
    const boundaryChannel = await openOracleChannel(
      "boundary",
      ["boundary.initialState.read"],
      new URL("/rpc", providerServer.url),
    )
    const interpreterChannel = await openOracleChannel("interpreter")

    const liveGraph = await oracleRequest("/oracle/rpc", interpreterChannel, "POST", {
      version: ORACLE_RPC_VERSION,
      id: "live-graph",
      target: "dark",
      method: READ_GRAPH_METHOD,
      params: {root: "not-canonical"},
    })
    expect(liveGraph.status).toBe(502)
    expect(await liveGraph.json()).toMatchObject({
      ok: false,
      error: {
        code: "method_error",
        message: "Graph read params must be empty",
      },
    })

    const response = await oracleRequest("/oracle/rpc", interpreterChannel, "POST", {
        version: ORACLE_RPC_VERSION,
        id: "matrix-birth-server",
        source: "forged-source",
        target: "boundary",
        method: "boundary.initialState.read",
        params: {},
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      version: ORACLE_RPC_VERSION,
      id: "matrix-birth-server",
      ok: true,
      result: {version: 1, atoms: [], declarations: []},
    })
    expect(rpcCalls[0]).toEqual({
      version: ORACLE_RPC_VERSION,
      id: "matrix-birth-server",
      source: "interpreter",
      target: "boundary",
      method: "boundary.initialState.read",
      params: {},
    })

    await openOracleChannel(
      "administration",
      ["administration.health.read"],
      new URL("/rpc", providerServer.url),
    )

    const administrativeResponse = await oracleRequest("/oracle/rpc", interpreterChannel, "POST", {
        version: ORACLE_RPC_VERSION,
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

    const matrixChannel = await openOracleChannel("matrix")
    const failed = await oracleRequest("/oracle/rpc", matrixChannel, "POST", {
        version: ORACLE_RPC_VERSION,
        id: "matrix-birth-failed",
        target: "boundary",
        method: "boundary.initialState.read",
        params: {fail: true},
    })
    expect(failed.status).toBe(502)
    expect(await failed.json()).toEqual({
      version: ORACLE_RPC_VERSION,
      id: "matrix-birth-failed",
      ok: false,
      error: {code: "method_error", message: "Boundary read failed"},
    })

    const unauthorized = await fetch(new URL("/oracle/rpc", server.url), {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({
        version: ORACLE_RPC_VERSION,
        id: "forged",
        target: "boundary",
        method: "boundary.initialState.read",
        params: {},
      }),
    })
    expect(unauthorized.status).toBe(401)

    const closed = await oracleRequest("/oracle/channel", boundaryChannel, "DELETE")
    expect(closed.status).toBe(200)
    const unavailable = await oracleRequest("/oracle/rpc", interpreterChannel, "POST", {
      version: ORACLE_RPC_VERSION,
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

  test("combines one local Dark adapter with four Oracle and Force channel pairs", async () => {
    const before = await fetch(new URL("/health", server.url))
    expect(before.status).toBe(503)
    expect(await before.json()).toMatchObject({state: "starting", connectedDomains: ["dark"]})
    const selfWebSocket = await fetch(new URL("/ws?domain=dark&id=forbidden-self-socket", server.url))
    expect(selfWebSocket.status).toBe(400)

    await Promise.all(
      (["boundary", "matrix", "energy", "bulk"] as const).map(connectOracle),
    )
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
