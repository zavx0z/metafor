import {afterAll, describe, expect, test} from "bun:test"
import type {ServerWebSocket} from "bun"
import {
  MONAD_RPC_VERSION,
  isMonadRpcCall,
  isMonadRpcResponse,
  type MonadRpcResponse,
} from "../../protocol/monad/rpc.ts"
import type {MonadChannel} from "./channel.ts"
import {MonadRpcPeer} from "./peer.ts"
import {
  MonadWebSocketTransport,
  createMonadWebSocketChannelRegistry,
  readMonadWebSocketData,
  type MonadWebSocketData,
} from "./socket.ts"

const opened: MonadChannel[] = []
const closed: MonadChannel[] = []
const serverResponses: MonadRpcResponse[] = []
const registry = createMonadWebSocketChannelRegistry({
  opened(channel) {
    opened.push(channel)
    channel.subscribe(async (message) => {
      if (isMonadRpcCall(message)) {
        await channel.send({
          version: MONAD_RPC_VERSION,
          id: message.id,
          ok: true,
          result: {source: "dark", method: message.method},
        })
      } else if (isMonadRpcResponse(message)) {
        serverResponses.push(message)
      }
    })
  },
  closed(channel) {
    closed.push(channel)
  },
})

const server = Bun.serve<MonadWebSocketData>({
  port: 0,
  fetch(request, current) {
    if (new URL(request.url).pathname !== "/monad/ws") {
      return new Response("Not found", {status: 404})
    }
    const data = readMonadWebSocketData(request)
    if (data === null) return new Response("Invalid Monad identity", {status: 400})
    return current.upgrade(request, {data})
      ? undefined
      : new Response("WebSocket upgrade failed", {status: 426})
  },
  websocket: {
    async message(socket, message) {
      await registry.receive(
        socket as ServerWebSocket<MonadWebSocketData>,
        message,
      )
    },
    async close(socket) {
      await registry.closed(socket as ServerWebSocket<MonadWebSocketData>)
    },
  },
})

afterAll(async () => {
  await registry.closeAll()
  server.stop(true)
})

describe("duplex Monad WebSocket transport", () => {
  test("carries RPC calls and exposed methods in both directions", async () => {
    const address = new URL("/monad/ws", server.url)
    address.protocol = "ws:"
    const transport = new MonadWebSocketTransport("matrix", address)
    const peer = new MonadRpcPeer(transport.channel)
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
      version: MONAD_RPC_VERSION,
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
      version: MONAD_RPC_VERSION,
      id: "dark-to-matrix",
      ok: true,
      result: {source: "dark", ready: true},
    }])

    await opened[0]!.send({
      version: MONAD_RPC_VERSION,
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
      version: MONAD_RPC_VERSION,
      id: "dark-to-matrix-nested",
      ok: true,
      result: {source: "dark", method: "dark.nested.read"},
    })

    await opened[0]!.send({
      version: MONAD_RPC_VERSION,
      id: "dark-to-matrix-outer",
      source: "dark",
      target: "matrix",
      method: "matrix.outer.read",
      params: {},
    })
    await opened[0]!.send({
      version: MONAD_RPC_VERSION,
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
