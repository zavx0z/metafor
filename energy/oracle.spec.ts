import {describe, expect, test} from "bun:test"
import {BOUNDARY_INITIAL_PROJECTION_METHOD} from "@metafor/types/boundary/initial"
import {EnergyOracle} from "./oracle.ts"
import type {EnergyMassHandle} from "./mass.ts"
import {
  DARK_FORCE_HISTORY_READ_METHOD,
  ENERGY_MASS_RESULT_READ_METHOD,
} from "@metafor/types/metafor/observation"

describe("Energy Oracle", () => {
  test("hydrates only the Energy-local catalog through Boundary RPC", async () => {
    const calls: unknown[] = []
    const oracle = new EnergyOracle()
    const summary = await oracle.onServerStarted({
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
                  massBinding: {data: "/mass", directMass: {kind: "whole"}},
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
    expect(oracle.catalog.fieldSchema("owner/child")).toEqual({
      mode: {type: "enum", required: true, default: "idle", values: ["idle"]},
    })
    expect(oracle.catalog.parentAtom(2)?.id).toBe(1)
    expect(oracle.catalog.continuation(2)).toEqual({
      massBinding: {data: "/mass", directMass: {kind: "whole"}},
      energyBinding: {data: "/energy"},
    })
    expect(await oracle.onHealthRequested().json()).toMatchObject({initialized: false, rpc: "prepared"})
  })

  test("does not accept an invalid Boundary projection", async () => {
    const oracle = new EnergyOracle()
    await expect(oracle.onServerStarted({async call() { return {version: 2, entries: []} }} as never))
      .rejects.toThrow("invalid initial Energy projection")
    expect(await oracle.onHealthRequested().json()).toMatchObject({ok: false, rpc: "error"})
  })

  test("registers exact Mass fence methods before opening and gates their handles", async () => {
    const handlers = new Map<string, (request: unknown) => Promise<unknown>>()
    const oracle = new EnergyOracle()
    oracle.onServerStarting({
      expose(method: string, handler: unknown) { handlers.set(method, handler as (request: unknown) => Promise<unknown>) },
      async call(_target: string, method: string) {
        expect(method).toBe(DARK_FORCE_HISTORY_READ_METHOD)
        return {
          contractVersion: 1,
          resolution: "exact",
          frontier: {cutId: "energy-test", throughSequence: 1, retroactiveComplete: false},
          range: null,
          entries: [],
        }
      },
    } as never)
    const key = "33333333-3333-4333-8333-333333333333"
    oracle.catalog.apply({
      part: "graviton", op: "add", path: "atom/2", ts: 0,
      value: {
        atom: {id: 2, parentAtom: 1, parentTopology: null, wimp: "owner/child", position: 0},
        mass: [{id: 7, key: "profile", keyId: key, format: "json", label: null, description: null}],
        values: [], valueRecords: [], valueItems: [], state: null,
      },
    })
    const artifact = oracle.catalog.mass(2)
    oracle.massStore.authorize?.({energyId: "energy", atomId: 2, wimp: "owner/child", state: ""}, artifact)
    const child = oracle.massStore.get({energyId: "energy", atomId: 2, wimp: "owner/child", state: ""}).profile as EnergyMassHandle

    expect([...handlers.keys()].sort()).toEqual([
      "energy.mass.fence",
      "energy.mass.release",
      ENERGY_MASS_RESULT_READ_METHOD,
    ])
    await handlers.get("energy.mass.fence")!({atom: 2, declaration: 7, key})
    await expect(child.readBytes()).rejects.toThrow("not live")
    await handlers.get("energy.mass.release")!({atom: 2, declaration: 7, key})
    await expect(child.readBytes()).resolves.toBeInstanceOf(Uint8Array)
    await expect(handlers.get("energy.mass.fence")!({atom: 2, declaration: 7, key: "wrong"})).rejects.toThrow("stale")
  })
})
