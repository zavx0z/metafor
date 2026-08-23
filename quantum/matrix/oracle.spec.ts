import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {BOUNDARY_INITIAL_STATE_METHOD} from "@metafor/types/boundary/initial"
import {weak$} from "weak"
import {consumePreparedMatrixBirth} from "./birth.ts"
import {MatrixOracle} from "./oracle.ts"

const previousBackend = Bun.env.METAFOR_WEAK_BACKEND

beforeAll(() => {
  Bun.env.METAFOR_WEAK_BACKEND = "cpu"
})

afterAll(() => {
  weak$.dispose()
  if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
  else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
})

describe("Matrix Oracle", () => {
  test("requests Boundary through RPC and prepares before runtime birth", async () => {
    const calls: unknown[] = []
    const peer = {
      async call(target: string, method: string, params: unknown, options: unknown) {
        calls.push({target, method, params, options})
        return {version: 1, atoms: [], declarations: [], pendingProcessExecutions: []}
      },
    }
    const oracle = new MatrixOracle()

    await expect(oracle.onServerStarted(peer as never)).resolves.toEqual({atoms: 0, fields: 0, backend: "cpu"})
    expect(calls).toEqual([{
      target: "boundary",
      method: BOUNDARY_INITIAL_STATE_METHOD,
      params: {},
      options: {waitMs: 30_000},
    }])
    expect(await oracle.onHealthRequested().json()).toMatchObject({initialized: false, rpc: "prepared"})

    oracle.onRuntimeBorn()
    expect(await oracle.onHealthRequested().json()).toMatchObject({initialized: true, rpc: "ready", error: null})

    const runtime = weak$.runtime!
    const originalFault = runtime.fault
    runtime.fault = () => "Сбой WebGPU Matrix: контрольная ошибка"
    expect(await oracle.onHealthRequested().json()).toMatchObject({
      ok: false,
      initialized: false,
      rpc: "ready",
      error: "Сбой WebGPU Matrix: контрольная ошибка",
    })
    runtime.fault = originalFault

    expect(consumePreparedMatrixBirth()).toBe(true)
  })
})
