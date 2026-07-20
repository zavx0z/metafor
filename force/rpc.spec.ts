import {describe, expect, test} from "bun:test"
import {
  MONAD_RPC_VERSION,
  type MonadRpcResponse,
  type RoutedMonadRpcCall,
} from "shared/protocol/monad/rpc"
import type {MonadChannel} from "shared/transport/monad"
import {MonadRouter} from "./rpc.ts"

const call = {
  version: MONAD_RPC_VERSION,
  id: "matrix-birth-1",
  target: "boundary",
  method: "boundary.initialState.read",
  params: {},
} as const

describe("MonadRouter", () => {
  test("routes a typed call through a registered provider transport", async () => {
    const received: RoutedMonadRpcCall[] = []
    const channel: MonadChannel = {
      identity: "boundary",
      async invoke(request): Promise<MonadRpcResponse> {
        received.push(structuredClone(request))
        return {
          version: MONAD_RPC_VERSION,
          id: request.id,
          ok: true,
          result: {version: 1, atoms: [], declarations: []},
        }
      },
    }
    const router = new MonadRouter()
    router.register(channel, ["boundary.initialState.read"])

    await expect(router.route("interpreter", call)).resolves.toEqual({
      version: MONAD_RPC_VERSION,
      id: "matrix-birth-1",
      ok: true,
      result: {version: 1, atoms: [], declarations: []},
    })
    expect(received).toEqual([{...call, source: "interpreter"}])
  })

  test("keeps provider and method availability in the service plane", async () => {
    const router = new MonadRouter()

    await expect(router.route("matrix", call)).resolves.toMatchObject({
      ok: false,
      error: {code: "provider_unavailable"},
    })

    router.register({
      identity: "boundary",
      invoke: async () => ({version: MONAD_RPC_VERSION, id: call.id, ok: true, result: null}),
    }, ["boundary.health.read"])
    await expect(router.route("matrix", call)).resolves.toMatchObject({
      ok: false,
      error: {code: "method_unavailable"},
    })
  })

  test("rejects a provider response with a different correlation id", async () => {
    const router = new MonadRouter()
    router.register({
      identity: "boundary",
      invoke: async () => ({version: MONAD_RPC_VERSION, id: "wrong", ok: true, result: null}),
    }, [call.method])

    await expect(router.route("matrix", call)).resolves.toMatchObject({
      id: call.id,
      ok: false,
      error: {code: "invalid_response"},
    })
  })
})
