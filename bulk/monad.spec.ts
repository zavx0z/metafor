import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {createHash} from "node:crypto"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {BOUNDARY_INITIAL_PROJECTION_METHOD} from "@metafor/types/boundary/initial"
import type {BoundaryInitialProjectionEntry} from "@metafor/types/boundary/initial"
import {BULK_VIEWPORT_CAPTURE_METHOD} from "@metafor/types/bulk/capture"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
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
import {LADA_TOPOLOGY_WIMPS, ladaTopologyAtoms} from "./gravity/layout/lada-topology.fixture.ts"

const temporaryDirectories: string[] = []
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {recursive: true, force: true})
  }
})

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

const mf117Entries = (
  promoted = false,
): BoundaryInitialProjectionEntry[] => {
  const atoms = [
    {id: 1, parentAtom: null, parentTopology: null, wimp: "zavx0z/inference", position: 0},
    ...ladaTopologyAtoms(promoted ? null : 1),
  ].filter(({id}) => !(promoted && id === 1))
  return [
    ...[
      ["zavx0z/inference", "Inference"],
      ...LADA_TOPOLOGY_WIMPS.map(({src, name}) => [src, name]),
    ].map(([src, name]) => ({
      part: "graviton" as const,
      op: "add" as const,
      path: "wimp",
      value: {src, name},
    })),
    {
      part: "graviton",
      op: "add",
      path: "state",
      value: {
        id: 21,
        localId: 1,
        wimp: "zavx0z/lada",
        name: "working",
        position: 0,
      },
    },
    ...atoms.map((atom) => ({
      part: "graviton" as const,
      op: "add" as const,
      path: `atom/${atom.id}`,
      value: {
        atom,
        values: [],
        valueRecords: [],
        valueItems: [],
        state: null,
        mass: [],
      },
    })),
  ]
}

const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    )
  }
  return value
}

const sha256 = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(canonicalValue(value))).digest("hex")

const legacyPromotionReceipt = (): Record<string, unknown> => {
  const store = new BulkProjectionStore()
  mf117Entries(true).forEach((entry, index) => {
    store.apply({...structuredClone(entry), ts: index + 1} as Particle)
  })
  const manifest = buildBulkManifestation(
    store.view(),
    promotion.removedRootSrc,
    DEFAULT_BULK_SETTINGS.layout,
    promotion,
  )
  const body = {
    schema: "metafor/bulk-mf117-live/v1",
    promotion,
    rootSrc: "zavx0z/lada",
    manifestSha256: sha256(manifest),
    removedInferenceTorusAbsent: true,
    retention: "retain-until-explicit-gc",
  }
  return {receiptId: sha256(body), ...body}
}

describe("Bulk Monad", () => {
  test("registers closed MF-117 and typed observer capture methods before advertising them", async () => {
    const methods: string[] = []
    let captureHandler:
      | ((params: unknown, context: {source: string}) => unknown | Promise<unknown>)
      | null = null
    const captureCalls: unknown[] = []
    const monad = new BulkMonad()

    monad.onServerStarting({
      expose(method: string, handler: typeof captureHandler) {
        methods.push(method)
        if (method === BULK_VIEWPORT_CAPTURE_METHOD) captureHandler = handler
      },
    } as never, {
      capture(params, context) {
        captureCalls.push({params, context})
        return Promise.resolve({
          ok: false as const,
          error: {code: "permission_denied" as const, message: "denied"},
        })
      },
    })

    expect(methods.toSorted()).toEqual([
      MF117_BULK_PREFLIGHT_METHOD,
      MF117_BULK_PROMOTE_METHOD,
      MF117_BULK_VERIFY_METHOD,
      BULK_VIEWPORT_CAPTURE_METHOD,
    ])
    const params = {version: 1, grant: "capability"}
    expect(await captureHandler!(params, {source: "codex"})).toEqual({
      ok: false,
      error: {code: "permission_denied", message: "denied"},
    })
    expect(captureCalls).toEqual([{params, context: {source: "codex"}}])
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
    const compatibleSnapshot: BulkObserverSnapshot = initial

    expect(initial).toMatchObject({
      version: 1,
      session: "observer-1",
      throughTs: null,
      rootSrc: "owner/root",
      projection: {runtime: {atoms: [{id: 7, wimp: "owner/root"}]}},
      manifest: {rootSrc: "owner/root"},
    })
    expect(initial.manifest.darkParticles).toHaveLength(1)
    expect(compatibleSnapshot.projection).toBe(initial.projection)
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
    const promotionPath = join(directory, "bulk-promotion.json")
    const monad = new BulkMonad({
      promotionPath,
    })
    await monad.onServerStarted({
      async call() { return {version: 1, entries: mf117Entries()} },
    } as never)
    monad.onRuntimeBorn()
    const before = monad.openObserver("mf117-before")
    expect(before.rootSrc).toBe("zavx0z/inference")
    expect(before.manifest.darkParticles.filter(({src}) =>
      src === "zavx0z/inference")).toHaveLength(1)
    expect(before.manifest.darkParticles.filter(({src}) =>
      src?.startsWith("zavx0z/lada"))).toHaveLength(5)
    expect(() => monad.mf117Preflight({
      schema: "metafor/bulk-mf117-live/v1",
      promotion: {
        ...promotion,
        formerRootFrame: {...promotion.formerRootFrame, outerDiameterMm: 99},
      },
    })).toThrow("promotion receipt is not exact")
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
    expect(monad.openObserver("mf117-after-root-replace").rootSrc)
      .toBe("zavx0z/lada")
    monad.onImpulse({
      parts: [{
        part: "graviton", op: "remove", path: "atom/1", by: "boundary", ts: 3,
      }],
    })
    const promoted = monad.mf117Promote({
      schema: "metafor/bulk-mf117-live/v1",
      promotion,
    })
    expect(promoted).toMatchObject({
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
    const rootTorus = observer.manifest.darkParticles.find(({darkParticleId}) =>
      darkParticleId === 4)!
    expect({
      localX: rootTorus.localX,
      localY: rootTorus.localY,
      localZ: rootTorus.localZ,
      outerDiameterMm:
        (rootTorus.torusRadius + rootTorus.torusTube) *
        rootTorus.torusScale * 2,
    }).toEqual(promotion.formerRootFrame)
    expect(observer.manifest.darkParticles.map((particle) => ({
      id: particle.darkParticleId,
      parent: particle.parentDarkParticleId,
      src: particle.src,
    }))).toEqual([
      {id: 4, parent: null, src: "zavx0z/lada"},
      {id: 6, parent: 4, src: "zavx0z/lada-auth"},
      {id: 8, parent: 4, src: "zavx0z/lada-chat"},
      {id: 12, parent: 8, src: "zavx0z/lada-chat-send"},
      {id: 10, parent: 4, src: "zavx0z/lada-model"},
    ])
    const durable = JSON.parse(readFileSync(promotionPath, "utf8")) as Record<string, unknown>
    expect(durable).toMatchObject({
      schema: "metafor/bulk-mf117-promotion/v2",
      retention: "retain-until-explicit-gc",
      structuralSha256: promoted.structuralSha256,
    })

    monad.onImpulse({
      parts: [{
        part: "photon", op: "replace", path: 2, by: "boundary", ts: 4,
        value: "working",
      }],
    })
    expect(sha256(monad.openObserver("mf117-dynamic").manifest))
      .not.toBe(sha256(observer.manifest))
    expect(monad.mf117Verify()).toMatchObject({
      receiptId: promoted.receiptId,
      structuralSha256: promoted.structuralSha256,
      removedInferenceTorusAbsent: true,
      promotedRootTorus: {darkParticleId: 4, parentDarkParticleId: null},
    })

    const recovered = new BulkMonad({promotionPath})
    await recovered.onServerStarted({
      async call() { return {version: 1, entries: mf117Entries(true)} },
    } as never)
    recovered.onRuntimeBorn()
    expect(recovered.mf117Verify()).toMatchObject({
      receiptId: promoted.receiptId,
      structuralSha256: promoted.structuralSha256,
      rootSrc: "zavx0z/lada",
    })
  })

  test("recovers the immutable v1 receipt without comparing volatile state", async () => {
    const directory = mkdtempSync(join(tmpdir(), "metafor-mf117-bulk-v1-"))
    temporaryDirectories.push(directory)
    const promotionPath = join(directory, "bulk-promotion.json")
    const legacy = legacyPromotionReceipt()
    writeFileSync(promotionPath, `${JSON.stringify(legacy, null, 2)}\n`)
    const monad = new BulkMonad({promotionPath})

    await monad.onServerStarted({
      async call() { return {version: 1, entries: mf117Entries(true)} },
    } as never)
    monad.onRuntimeBorn()
    monad.onImpulse({
      parts: [{
        part: "photon", op: "replace", path: 2, by: "boundary", ts: 40,
        value: "working",
      }],
    })

    expect(sha256(monad.openObserver("legacy-dynamic").manifest))
      .not.toBe(legacy.manifestSha256)
    expect(monad.mf117Verify()).toMatchObject({
      receiptId: legacy.receiptId,
      rootSrc: "zavx0z/lada",
      removedInferenceTorusAbsent: true,
    })
    expect(JSON.parse(readFileSync(promotionPath, "utf8"))).toEqual(legacy)
  })

  test("fails closed when a durable receipt loses retention or self-integrity", async () => {
    for (const corruption of ["retention", "receipt"] as const) {
      const directory = mkdtempSync(join(tmpdir(), `metafor-mf117-bulk-${corruption}-`))
      temporaryDirectories.push(directory)
      const promotionPath = join(directory, "bulk-promotion.json")
      const legacy = legacyPromotionReceipt()
      if (corruption === "retention") {
        legacy.retention = "delete-after-promotion"
        const {receiptId: _receiptId, ...body} = legacy
        legacy.receiptId = sha256(body)
      } else {
        legacy.receiptId = "0".repeat(64)
      }
      writeFileSync(promotionPath, `${JSON.stringify(legacy, null, 2)}\n`)
      const monad = new BulkMonad({promotionPath})

      await expect(monad.onServerStarted({
        async call() { return {version: 1, entries: mf117Entries(true)} },
      } as never)).rejects.toThrow("durable promotion receipt conflicts")
    }
  })

  test("fails closed on a missing, reparented or ghost MF-117 subtree", async () => {
    const cases = [
      {
        name: "missing",
        entries: mf117Entries(true).filter(({path}) => path !== "atom/6"),
        error: "missing or reparented",
      },
      {
        name: "reparented",
        entries: mf117Entries(true).map((entry) => entry.path === "atom/6"
          ? {
              ...entry,
              value: {
                ...(entry.value as Record<string, unknown>),
                atom: {
                  ...((entry.value as {atom: Record<string, unknown>}).atom),
                  parentAtom: 5,
                },
              },
            }
          : entry),
        error: "missing or reparented",
      },
      {
        name: "ghost",
        entries: mf117Entries(true).concat(
          mf117Entries().filter(({path}) => path === "atom/1"),
        ),
        error: "ghost torus",
      },
    ]
    for (const scenario of cases) {
      const directory = mkdtempSync(join(tmpdir(), `metafor-mf117-bulk-${scenario.name}-`))
      temporaryDirectories.push(directory)
      const promotionPath = join(directory, "bulk-promotion.json")
      writeFileSync(promotionPath, `${JSON.stringify(legacyPromotionReceipt(), null, 2)}\n`)
      const monad = new BulkMonad({promotionPath})

      await expect(monad.onServerStarted({
        async call() { return {version: 1, entries: scenario.entries} },
      } as never)).rejects.toThrow(scenario.error)
    }
  })
})
