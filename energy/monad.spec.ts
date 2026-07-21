import {describe, expect, test} from "bun:test"
import {BOUNDARY_INITIAL_PROJECTION_METHOD} from "@metafor/types/boundary/initial"
import {EnergyMonad} from "./monad.ts"

describe("Energy Monad", () => {
  test("hydrates only the Energy-local catalog through Boundary RPC", async () => {
    const calls: unknown[] = []
    const monad = new EnergyMonad()
    const summary = await monad.onServerStarted({
      async call(target: string, method: string, params: unknown, options: unknown) {
        calls.push({target, method, params, options})
        return {
          version: 1,
          entries: [
            {
              part: "graviton", op: "add", path: "atom/1",
              value: {
                atom: {id: 1, parentAtom: null, parentTopology: null, wimp: "owner/root", position: 0},
                values: [], valueRecords: [], valueItems: [], state: null,
              },
            },
            {
              part: "graviton", op: "add", path: "topology/4",
              value: {id: 4, parentAtom: 1, parentTopology: null, wimp: "owner/root", position: 0},
            },
            {
              part: "graviton", op: "add", path: "atom/2",
              value: {
                atom: {id: 2, parentAtom: null, parentTopology: 4, wimp: "owner/child", position: 0},
                continuation: {
                  massBinding: {data: "/mass"},
                  energyBinding: {data: "/energy"},
                },
                values: [], valueRecords: [], valueItems: [], state: null,
              },
            },
            {
              part: "graviton", op: "add", path: "field",
              value: {
                id: 5, localId: 1, wimp: "owner/child", key: "mode", type: "enum",
                required: true, label: null, default: "idle",
              },
            },
            {
              part: "graviton", op: "add", path: "variant",
              value: {
                id: 6, localId: 1, wimp: "owner/child", field: 5, position: 0, itemValue: "idle",
              },
            },
            {
              part: "graviton", op: "add", path: "process",
              value: {
                id: 9, localId: 1, wimp: "owner/child", state: "ready",
                descriptor: {
                  type: "action", key: "ready", env: ["server"],
                  action: {src: "data:text/javascript,export default async()=>{}", readFields: []},
                },
              },
            },
          ],
        }
      },
    } as never)

    expect(calls).toEqual([{
      target: "boundary",
      method: BOUNDARY_INITIAL_PROJECTION_METHOD,
      params: {},
      options: {waitMs: 30_000},
    }])
    expect(summary).toEqual({atoms: 2, topologies: 1, fields: 1, variants: 1, processes: 1, continuations: 1})
    expect(monad.catalog.fieldSchema("owner/child")).toEqual({
      mode: {type: "enum", required: true, default: "idle", values: ["idle"]},
    })
    expect(monad.catalog.parentAtom(2)?.id).toBe(1)
    expect(monad.catalog.continuation(2)).toEqual({
      massBinding: {data: "/mass"},
      energyBinding: {data: "/energy"},
    })
    expect(await monad.onHealthRequested().json()).toMatchObject({initialized: false, rpc: "prepared"})
  })

  test("does not accept an invalid Boundary projection", async () => {
    const monad = new EnergyMonad()
    await expect(monad.onServerStarted({async call() { return {version: 2, entries: []} }} as never))
      .rejects.toThrow("invalid initial Energy projection")
    expect(await monad.onHealthRequested().json()).toMatchObject({ok: false, rpc: "error"})
  })
})
