import {afterAll, describe, expect, test} from "bun:test"
import {MONAD_RPC_VERSION, type MonadRpcCall} from "../../protocol/monad/rpc.ts"
import {MonadRpcClient} from "./server.ts"

const received: Array<{path: string; body: unknown}> = []
let transportFailures = 0
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname
    const body = await request.json()
    received.push({path, body})
    if (path === "/monad/providers/boundary") return Response.json({ok: true})
    const call = body as MonadRpcCall
    if (call.method === "boundary.retry" && transportFailures++ === 0) {
      return Response.json({
        version: MONAD_RPC_VERSION,
        id: call.id,
        ok: false,
        error: {code: "transport_error", message: "Boundary is restarting"},
      }, {status: 502})
    }
    return Response.json({
      version: MONAD_RPC_VERSION,
      id: call.id,
      ok: true,
      result: {version: 1, atoms: [], declarations: []},
    })
  },
})

afterAll(() => server.stop(true))

describe("REST Monad RPC client", () => {
  test("registers a provider and invokes through a source-specific Force endpoint", async () => {
    const boundary = new MonadRpcClient("boundary", server.url)
    await boundary.registerProvider(["boundary.initialState.read"], "http://127.0.0.1:4001/monad/rpc")

    const matrix = new MonadRpcClient("matrix", server.url)
    await expect(matrix.invoke("boundary", "boundary.initialState.read", {})).resolves.toEqual({
      version: 1,
      atoms: [],
      declarations: [],
    })

    expect(received[0]).toEqual({
      path: "/monad/providers/boundary",
      body: {
        version: MONAD_RPC_VERSION,
        methods: ["boundary.initialState.read"],
        endpoint: "http://127.0.0.1:4001/monad/rpc",
      },
    })
    expect(received[1]?.path).toBe("/monad/rpc/matrix")
    expect(received[1]?.body).toMatchObject({
      version: MONAD_RPC_VERSION,
      target: "boundary",
      method: "boundary.initialState.read",
      params: {},
    })
    expect((received[1]?.body as MonadRpcCall).id).toBeString()
  })

  test("retries a temporarily unavailable registered provider", async () => {
    const matrix = new MonadRpcClient("matrix", server.url)
    await expect(matrix.invoke(
      "boundary",
      "boundary.retry",
      {},
      {waitMs: 100, retryMs: 1},
    )).resolves.toEqual({version: 1, atoms: [], declarations: []})
    expect(transportFailures).toBe(2)
  })
})
