import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {BOUNDARY_INITIAL_STATE_METHOD} from "@metafor/types/boundary/initial"
import {MONAD_RPC_VERSION} from "shared/protocol/monad/rpc"
import {BoundaryMonad} from "./monad.ts"
import {open, type BoundaryDatabase} from "./sqlite.ts"

describe("Boundary Monad", () => {
  let boundary: BoundaryDatabase
  let monad: BoundaryMonad

  beforeEach(async () => {
    boundary = await open(":memory:")
    monad = new BoundaryMonad(boundary)
  })

  afterEach(async () => boundary.close())

  test("registers its canonical initial-state provider", async () => {
    const registrations: unknown[] = []
    const client = {
      async registerProvider(methods: readonly string[], endpoint: URL, options: unknown) {
        registrations.push({methods, endpoint: endpoint.href, options})
      },
    }

    await monad.onServerStarted(client as never, new URL("http://127.0.0.1:4001/monad/rpc"))

    expect(registrations).toEqual([{
      methods: [BOUNDARY_INITIAL_STATE_METHOD],
      endpoint: "http://127.0.0.1:4001/monad/rpc",
      options: {waitMs: 30_000},
    }])
  })

  test("returns canonical rows to a routed Matrix call", async () => {
    const response = await monad.onRpcRequested(new Request("http://boundary.test/monad/rpc", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({
        version: MONAD_RPC_VERSION,
        id: "matrix-birth",
        source: "matrix",
        target: "boundary",
        method: BOUNDARY_INITIAL_STATE_METHOD,
        params: {},
      }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      version: MONAD_RPC_VERSION,
      id: "matrix-birth",
      ok: true,
      result: {version: 1, atoms: [], declarations: []},
    })
  })
})
