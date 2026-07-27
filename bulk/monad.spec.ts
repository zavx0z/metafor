import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {BOUNDARY_INITIAL_PROJECTION_METHOD} from "@metafor/types/boundary/initial"
import type {BoundaryInitialProjectionEntry} from "@metafor/types/boundary/initial"
import type {Particle} from "shared/protocol/force/particle"
import {
  MF117_BULK_PREFLIGHT_METHOD,
  MF117_BULK_PROMOTE_METHOD,
  MF117_BULK_VERIFY_METHOD,
} from "../shared/mf117.ts"
import {DEFAULT_BULK_SETTINGS} from "./settings.ts"
import {BulkMonad} from "./monad.ts"
import {BulkProjectionStore} from "./projection.ts"
import {buildBulkManifestation} from "./manifestation.ts"

const temporaryDirectories: string[] = []
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {recursive: true, force: true})
  }
})

describe("Bulk Monad", () => {
  test("registers the closed MF-117 methods before the channel advertises them", () => {
    const methods: string[] = []
    const monad = new BulkMonad()

    monad.onServerStarting({
      expose(method: string) {
        methods.push(method)
      },
    } as never)

    expect(methods.toSorted()).toEqual([
      MF117_BULK_PREFLIGHT_METHOD,
      MF117_BULK_PROMOTE_METHOD,
      MF117_BULK_VERIFY_METHOD,
    ])
  })

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

  test("initial package and the same ordinary Particle sequence produce identical geometry", async () => {
    const entries: BoundaryInitialProjectionEntry[] = [
      {part: "graviton", op: "add", path: "wimp", value: {src: "owner/root", name: "Root"}},
      {part: "graviton", op: "add", path: "wimp", value: {src: "owner/child", name: "Child"}},
      {
        part: "graviton", op: "add", path: "atom/1",
        value: {
          atom: {id: 1, parentAtom: null, parentTopology: null, wimp: "owner/root", position: 0},
          values: [], valueRecords: [], valueItems: [], state: null,
        },
      },
      {
        part: "graviton", op: "add", path: "atom/2",
        value: {
          atom: {id: 2, parentAtom: 1, parentTopology: null, wimp: "owner/child", position: 0},
          values: [], valueRecords: [], valueItems: [], state: null,
        },
      },
    ]
    const monad = new BulkMonad()
    await monad.onServerStarted({async call() { return {version: 1, entries} }} as never)
    monad.onRuntimeBorn()
    const initial = monad.openObserver("observer-equivalence")

    const realtime = new BulkProjectionStore()
    entries.forEach((entry, index) => realtime.apply({...structuredClone(entry), ts: index + 1} as Particle))
    const realtimeManifest = buildBulkManifestation(
      realtime.view(),
      initial.rootSrc,
      DEFAULT_BULK_SETTINGS.layout,
    )

    expect(realtimeManifest).toEqual(initial.manifest)
  })

  test("removes the Inference torus and persists one promoted Lada root torus", async () => {
    const directory = mkdtempSync(join(tmpdir(), "metafor-mf117-bulk-"))
    temporaryDirectories.push(directory)
    const entries: BoundaryInitialProjectionEntry[] = [
      {part: "graviton", op: "add", path: "wimp", value: {src: "zavx0z/inference", name: "Inference"}},
      {part: "graviton", op: "add", path: "wimp", value: {src: "zavx0z/lada", name: "Lada"}},
      {
        part: "graviton", op: "add", path: "atom/1",
        value: {
          atom: {id: 1, parentAtom: null, parentTopology: null, wimp: "zavx0z/inference", position: 0},
          values: [], valueRecords: [], valueItems: [], state: null, mass: [],
        },
      },
      {
        part: "graviton", op: "add", path: "atom/2",
        value: {
          atom: {id: 2, parentAtom: 1, parentTopology: null, wimp: "zavx0z/lada", position: 0},
          values: [], valueRecords: [], valueItems: [], state: null, mass: [],
        },
      },
    ]
    const monad = new BulkMonad({
      promotionPath: join(directory, "bulk-promotion.json"),
    })
    await monad.onServerStarted({
      async call() { return {version: 1, entries} },
    } as never)
    monad.onRuntimeBorn()
    const promotion = {
      version: 1 as const,
      kind: "root-promotion" as const,
      verified: true as const,
      removedRootAtomId: 1,
      removedRootSrc: "zavx0z/inference",
      promotedAtomId: 2,
      promotedRootSrc: "zavx0z/lada",
      formerRootFrame: {
        localX: 0,
        localY: 0,
        localZ: 0,
        outerDiameterMm: 100,
      },
    }
    expect(monad.mf117Preflight({
      schema: "metafor/bulk-mf117-live/v1",
      promotion,
    })).toMatchObject({
      sourceRootTorus: {darkParticleId: 2},
      targetChildTorus: {darkParticleId: 4, parentDarkParticleId: 2},
      noGhostTorus: true,
    })

    monad.onImpulse({
      parts: [{
        part: "graviton", op: "replace", path: "atom/2", by: "boundary", ts: 2,
        value: {
          atom: {id: 2, parentAtom: null, parentTopology: null, wimp: "zavx0z/lada", position: 0},
          values: [], valueRecords: [], valueItems: [], state: null, mass: [],
        },
      }],
    })
    monad.onImpulse({
      parts: [{
        part: "graviton", op: "remove", path: "atom/1", by: "boundary", ts: 3,
      }],
    })
    expect(monad.mf117Promote({
      schema: "metafor/bulk-mf117-live/v1",
      promotion,
    })).toMatchObject({
      rootSrc: "zavx0z/lada",
      removedInferenceTorusAbsent: true,
      promotedRootTorus: {darkParticleId: 4, parentDarkParticleId: null},
    })
    const observer = monad.openObserver("mf117-observer")
    expect(observer.rootSrc).toBe("zavx0z/lada")
    expect(observer.manifest.darkParticles.filter(({src}) =>
      src === "zavx0z/inference")).toHaveLength(0)
    expect(observer.manifest.darkParticles.filter(({darkParticleId}) =>
      darkParticleId === 2)).toHaveLength(0)
    expect(observer.manifest.darkParticles.filter(({darkParticleId, parentDarkParticleId}) =>
      darkParticleId === 4 && parentDarkParticleId === null)).toHaveLength(1)
    expect(monad.mf117Verify()).toMatchObject({
      removedInferenceTorusAbsent: true,
      promotedRootTorus: {darkParticleId: 4, parentDarkParticleId: null},
    })
  })
})
