import {describe, expect, test} from "bun:test"
import {BOUNDARY_INITIAL_PROJECTION_METHOD} from "@metafor/types/boundary/initial"
import {BulkMonad} from "./monad.ts"

describe("Bulk Monad", () => {
  test("loads the complete Boundary projection before preparing an observer package", async () => {
    const calls: unknown[] = []
    const peer = {
      async call(target: string, method: string, params: unknown, options: unknown) {
        calls.push({target, method, params, options})
        return {
          version: 1,
          entries: [
            {part: "graviton", op: "add", path: "wimp", value: {src: "owner/root", name: "Root"}},
            {
              part: "graviton", op: "add", path: "atom/7",
              value: {
                atom: {id: 7, parentAtom: null, parentTopology: null, wimp: "owner/root", position: 0},
                values: [], valueRecords: [], valueItems: [], state: null,
              },
            },
          ],
        }
      },
    }
    const monad = new BulkMonad()

    await monad.onServerStarted(peer as never)
    expect(calls).toEqual([{
      target: "boundary",
      method: BOUNDARY_INITIAL_PROJECTION_METHOD,
      params: {},
      options: {waitMs: 30_000},
    }])
    expect(() => monad.openObserver("before-force")).toThrow("not ready")

    monad.onRuntimeBorn()
    const initial = monad.openObserver("observer-1")

    expect(initial).toMatchObject({
      version: 1,
      session: "observer-1",
      throughTs: null,
      rootSrc: "owner/root",
      projection: {runtime: {atoms: [{id: 7, wimp: "owner/root"}]}},
      manifest: {rootSrc: "owner/root"},
    })
    expect(initial.manifest.darkParticles).toHaveLength(1)
  })

  test("advances the prepared Store with the unchanged realtime Particle", async () => {
    const peer = {
      async call() {
        return {version: 1, entries: []}
      },
    }
    const monad = new BulkMonad()
    await monad.onServerStarted(peer as never)
    monad.onRuntimeBorn()

    monad.onImpulse({
      parts: [{
        part: "graviton", op: "add", path: "atom/9", by: "boundary", ts: 42,
        value: {
          atom: {id: 9, parentAtom: null, parentTopology: null, wimp: "owner/live", position: 0},
          values: [], valueRecords: [], valueItems: [], state: null,
        },
      }],
    })

    expect(monad.openObserver("observer-2")).toMatchObject({
      throughTs: 42,
      rootSrc: "owner/live",
      projection: {runtime: {atoms: [{id: 9, wimp: "owner/live"}]}},
    })
  })
})
