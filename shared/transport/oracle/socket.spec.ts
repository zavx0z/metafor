import {afterAll, describe, expect, test} from "bun:test"
import type {ServerWebSocket} from "bun"
import {
  ORACLE_RPC_VERSION,
  isOracleRpcCall,
  isOracleRpcResponse,
  type OracleRpcResponse,
} from "../../protocol/oracle/rpc.ts"
import type {OracleChannel} from "./channel.ts"
import {OracleRpcPeer} from "./peer.ts"
import {
  OracleWebSocketTransport,
  createOracleWebSocketChannelRegistry,
  readOracleWebSocketData,
  type OracleWebSocketData,
} from "./socket.ts"

const opened: OracleChannel[] = []
const closed: OracleChannel[] = []
const serverResponses: OracleRpcResponse[] = []
const registry = createOracleWebSocketChannelRegistry({
  opened(channel) {
    opened.push(channel)
    channel.subscribe(async (message) => {
      if (isOracleRpcCall(message)) {
        await channel.send({
          version: ORACLE_RPC_VERSION,
          id: message.id,
          ok: true,
          result: {source: "dark", method: message.method},
        })
      } else if (isOracleRpcResponse(message)) {
        serverResponses.push(message)
      }
    })
  },
  closed(channel) {
    closed.push(channel)
  },
})

const server = Bun.serve<OracleWebSocketData>({
  port: 0,
  fetch(request, current) {
    if (new URL(request.url).pathname !== "/oracle/ws") {
      return new Response("Not found", {status: 404})
    }
    const data = readOracleWebSocketData(request)
    if (data === null) return new Response("Invalid Oracle identity", {status: 400})
    return current.upgrade(request, {data})
      ? undefined
      : new Response("WebSocket upgrade failed", {status: 426})
  },
  websocket: {
    async message(socket, message) {
      await registry.receive(
        socket as ServerWebSocket<OracleWebSocketData>,
        message,
      )
    },
    async close(socket) {
      await registry.closed(socket as ServerWebSocket<OracleWebSocketData>)
    },
  },
})

afterAll(async () => {
  await registry.closeAll()
  server.stop(true)
})

describe("duplex Oracle WebSocket transport", () => {
  test("carries RPC calls and exposed methods in both directions", async () => {
    const address = new URL("/oracle/ws", server.url)
    address.protocol = "ws:"
    const transport = new OracleWebSocketTransport("matrix", address)
    const peer = new OracleRpcPeer(transport.channel)
    let releaseOuter!: () => void
    const outerMayFinish = new Promise<void>((resolve) => {
      releaseOuter = resolve
    })
    peer.expose("matrix.health.read", (_params, context) => ({
      source: context.source,
      ready: true,
    }))
    peer.expose("matrix.inner.read", () => {
      releaseOuter()
      return {inner: true}
    })
    peer.expose("matrix.nested.read", async () =>
      await peer.call("dark", "dark.nested.read", {}))
    peer.expose("matrix.outer.read", async () => {
      await outerMayFinish
      return {outer: true}
    })

    await transport.open({methods: peer.methods()})
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatchObject({
      identity: "matrix",
      methods: [
        "matrix.health.read",
        "matrix.inner.read",
        "matrix.nested.read",
        "matrix.outer.read",
      ],
    })

    await expect(peer.call("dark", "dark.force.status.read", {})).resolves.toEqual({
      source: "dark",
      method: "dark.force.status.read",
    })

    await opened[0]!.send({
      version: ORACLE_RPC_VERSION,
      id: "dark-to-matrix",
      source: "dark",
      target: "matrix",
      method: "matrix.health.read",
      params: {},
    })
    for (let attempt = 0; attempt < 100 && serverResponses.length === 0; attempt += 1) {
      await Bun.sleep(1)
    }
    expect(serverResponses).toEqual([{
      version: ORACLE_RPC_VERSION,
      id: "dark-to-matrix",
      ok: true,
      result: {source: "dark", ready: true},
    }])

    await opened[0]!.send({
      version: ORACLE_RPC_VERSION,
      id: "dark-to-matrix-nested",
      source: "dark",
      target: "matrix",
      method: "matrix.nested.read",
      params: {},
    })
    for (let attempt = 0; attempt < 100 && serverResponses.length < 2; attempt += 1) {
      await Bun.sleep(1)
    }
    expect(serverResponses[1]).toEqual({
      version: ORACLE_RPC_VERSION,
      id: "dark-to-matrix-nested",
      ok: true,
      result: {source: "dark", method: "dark.nested.read"},
    })

    await opened[0]!.send({
      version: ORACLE_RPC_VERSION,
      id: "dark-to-matrix-outer",
      source: "dark",
      target: "matrix",
      method: "matrix.outer.read",
      params: {},
    })
    await opened[0]!.send({
      version: ORACLE_RPC_VERSION,
      id: "dark-to-matrix-inner",
      source: "dark",
      target: "matrix",
      method: "matrix.inner.read",
      params: {},
    })
    for (let attempt = 0; attempt < 100 && serverResponses.length < 4; attempt += 1) {
      await Bun.sleep(1)
    }
    expect(serverResponses.slice(2).map(({id}) => id).sort()).toEqual([
      "dark-to-matrix-inner",
      "dark-to-matrix-outer",
    ])

    peer.close()
    await transport.close()
    for (let attempt = 0; attempt < 100 && closed.length === 0; attempt += 1) {
      await Bun.sleep(1)
    }
    expect(closed).toHaveLength(1)
  })
})
