import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {BOUNDARY_INITIAL_STATE_METHOD} from "@metafor/types/boundary/initial"
import {weak$} from "@matrix/weak"
import {consumePreparedMatrixBirth} from "./birth.ts"
import {MatrixMonad} from "./monad.ts"

const previousBackend = Bun.env.METAFOR_WEAK_BACKEND

beforeAll(() => {
  Bun.env.METAFOR_WEAK_BACKEND = "cpu"
})

afterAll(() => {
  weak$.dispose()
  if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
  else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
})

describe("Matrix Monad", () => {
  test("requests Boundary through RPC and prepares before runtime birth", async () => {
    const calls: unknown[] = []
    const peer = {
      async call(target: string, method: string, params: unknown, options: unknown) {
        calls.push({target, method, params, options})
        return {version: 1, atoms: [], declarations: []}
      },
    }
    const monad = new MatrixMonad()

    await expect(monad.onServerStarted(peer as never)).resolves.toEqual({atoms: 0, fields: 0, backend: "cpu"})
    expect(calls).toEqual([{
      target: "boundary",
      method: BOUNDARY_INITIAL_STATE_METHOD,
      params: {},
      options: {waitMs: 30_000},
    }])
    expect(await monad.onHealthRequested().json()).toMatchObject({initialized: false, rpc: "prepared"})

    monad.onRuntimeBorn()
    expect(await monad.onHealthRequested().json()).toMatchObject({initialized: true, rpc: "ready", error: null})
    expect(consumePreparedMatrixBirth()).toBe(true)
  })
})
