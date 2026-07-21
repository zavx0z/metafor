import {afterAll, describe, expect, test} from "bun:test"
import {
  MONAD_RPC_VERSION,
  type MonadRpcCall,
} from "../../protocol/monad/rpc.ts"
import {MonadRpcPeer, MonadTransport} from "./server.ts"

const received: Array<{method: string; path: string; authorization: string | null; body: unknown}> = []
let transportFailures = 0
const force = Bun.serve({
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname
    const body = request.method === "DELETE" ? null : await request.json()
    const authorization = request.headers.get("authorization")
    received.push({method: request.method, path, authorization, body})
    if (path === "/monad/channels") {
      const identity = (body as {identity: string}).identity
      return Response.json({version: MONAD_RPC_VERSION, channel: `${identity}-channel`}, {status: 201})
    }
    if (path === "/monad/channel" && request.method === "DELETE") return Response.json({ok: true})
    const call = body as MonadRpcCall
    if (call.method === "boundary.retry" && transportFailures++ === 0) {
      return Response.json({
        version: MONAD_RPC_VERSION,
        id: call.id,
        ok: false,
        error: {code: "provider_unavailable", message: "Boundary is starting"},
      }, {status: 503})
    }
    return Response.json({
      version: MONAD_RPC_VERSION,
      id: call.id,
      ok: true,
      result: {version: 1, atoms: [], declarations: []},
    })
  },
})

afterAll(() => force.stop(true))

describe("REST Monad transport", () => {
  test("produces an identity-bound channel used by a transport-neutral peer", async () => {
    const transport = new MonadTransport("matrix", force.url)
    const peer = new MonadRpcPeer(transport.channel)
    await transport.open()

    await expect(peer.call("boundary", "boundary.initialState.read", {})).resolves.toEqual({
      version: 1,
      atoms: [],
      declarations: [],
    })

    expect(received[0]).toEqual({
      method: "POST",
      path: "/monad/channels",
      authorization: null,
      body: {version: MONAD_RPC_VERSION, identity: "matrix", methods: []},
    })
    expect(received[1]?.path).toBe("/monad/rpc")
    expect(received[1]?.authorization).toBe("Bearer matrix-channel")
    expect(received[1]?.body).toMatchObject({
      version: MONAD_RPC_VERSION,
      target: "boundary",
      method: "boundary.initialState.read",
      params: {},
    })

    await transport.close()
    expect(received.at(-1)).toEqual({
      method: "DELETE",
      path: "/monad/channel",
      authorization: "Bearer matrix-channel",
      body: null,
    })
  })

  test("retries a temporarily unavailable target above the same channel", async () => {
    const transport = new MonadTransport("interpreter", force.url)
    const peer = new MonadRpcPeer(transport.channel)
    await transport.open()

    await expect(peer.call(
      "boundary",
      "boundary.retry",
      {},
      {waitMs: 100, retryMs: 1},
    )).resolves.toEqual({version: 1, atoms: [], declarations: []})
    expect(transportFailures).toBe(2)
    await transport.close()
  })

  test("adapts an incoming HTTP request to a channel subscription", async () => {
    const transport = new MonadTransport("boundary", force.url)
    const peer = new MonadRpcPeer(transport.channel)
    peer.expose("boundary.initialState.read", async (_params, context) => ({source: context.source}))
    await transport.open({
      methods: peer.methods(),
      endpoint: "http://127.0.0.1:4001/monad/channel",
    })
    const opening = received.find((entry) =>
      entry.path === "/monad/channels" && (entry.body as {identity?: string}).identity === "boundary"
    )?.body as {callback: string}

    const response = await transport.receive(new Request("http://boundary.test/monad/channel", {
      method: "POST",
      headers: {
        authorization: `Bearer ${opening.callback}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        version: MONAD_RPC_VERSION,
        id: "matrix-birth",
        source: "matrix",
        target: "boundary",
        method: "boundary.initialState.read",
        params: {},
      }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      version: MONAD_RPC_VERSION,
      id: "matrix-birth",
      ok: true,
      result: {source: "matrix"},
    })
    await transport.close()
  })
})
