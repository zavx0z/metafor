import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {createHash} from "node:crypto"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {BULK_VIEWPORT_CAPTURE_METHOD} from "@metafor/types/bulk/capture"
import {
  GRAPH_SCHEMA,
  READ_GRAPH_METHOD,
  parseMetaAddress,
  type DocumentPointer,
  type Graph,
} from "@metafor/types/metafor/graph"
import {FORCE_CHECKPOINT_QUIESCE_METHOD} from "shared/transport/force/checkpoint"
import {
  MF117_BULK_PREFLIGHT_METHOD,
  MF117_BULK_PROMOTE_METHOD,
  MF117_BULK_VERIFY_METHOD,
} from "../shared/mf117.ts"
import {BulkMonad} from "./monad.ts"
import {BulkProjectionStore} from "./projection.ts"
import {projectBulkGraph} from "./graph.ts"
import {buildBulkManifestation} from "./manifestation.ts"

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

const INFERENCE = parseMetaAddress("zavx0z/inference")!
const LADA = parseMetaAddress("zavx0z/lada")!
const AUTH = parseMetaAddress("zavx0z/lada-auth")!
const CHAT = parseMetaAddress("zavx0z/lada-chat")!
const MODEL = parseMetaAddress("zavx0z/lada-model")!
const SEND = parseMetaAddress("zavx0z/lada-chat-send")!

const runtimeAtom = (
  declaration: DocumentPointer,
  meta: typeof LADA,
  children?: Graph["runtime"]["roots"],
): Graph["runtime"]["roots"][number] => ({
  kind: "atom",
  declaration,
  meta,
  state: meta === LADA ? "ready" : null,
  values: {},
  ...(children === undefined ? {} : {children}),
})

const mf117Document = (
  promoted = false,
  ladaState: "ready" | "working" = "ready",
): Graph => {
  const ladaChildren: Graph["runtime"]["roots"] = [
    runtimeAtom("#/template/zavx0z~1lada/matter/0", AUTH),
    runtimeAtom("#/template/zavx0z~1lada/matter/1", CHAT, [
      runtimeAtom("#/template/zavx0z~1lada-chat/matter/0", SEND),
    ]),
    runtimeAtom("#/template/zavx0z~1lada/matter/2", MODEL),
  ]
  const lada = runtimeAtom(
    promoted ? "#/template/zavx0z~1lada" : "#/template/zavx0z~1inference/matter/0",
    LADA,
    ladaChildren,
  )
  if (lada.kind === "atom") lada.state = ladaState
  return {
    schema: GRAPH_SCHEMA,
    root: promoted ? LADA : INFERENCE,
    template: {
      ...(promoted ? {} : {
        [INFERENCE]: {
          name: "Inference", fields: [], superposition: [], mass: [], processes: [],
          matter: [{kind: "wimp", src: LADA}],
        },
      }),
      [LADA]: {
        name: "Lada", fields: [],
        superposition: [
          {name: "ready", transitions: null},
          {name: "working", transitions: null},
        ],
        mass: [], processes: [],
        matter: [AUTH, CHAT, MODEL].map((src) => ({kind: "wimp" as const, src})),
      },
      [AUTH]: {name: "Auth", fields: [], superposition: [], mass: [], processes: []},
      [CHAT]: {
        name: "Chat", fields: [], superposition: [], mass: [], processes: [],
        matter: [{kind: "wimp", src: SEND}],
      },
      [MODEL]: {name: "Model", fields: [], superposition: [], mass: [], processes: []},
      [SEND]: {name: "Send", fields: [], superposition: [], mass: [], processes: []},
    },
    runtime: {
      roots: promoted
        ? [lada]
        : [runtimeAtom("#/template/zavx0z~1inference", INFERENCE, [lada])],
    },
  }
}

const metaPeer = (initial: Graph) => {
  let current = structuredClone(initial)
  const calls: Array<{target: string; method: string; params: unknown; options: unknown}> = []
  return {
    calls,
    set(value: Graph) {
      current = structuredClone(value)
    },
    async call(target: string, method: string, params: unknown, options: unknown) {
      calls.push({target, method, params, options})
      if (target === "boundary" && method === FORCE_CHECKPOINT_QUIESCE_METHOD) {
        return {ok: true, outgoingOrdinal: 0}
      }
      if (target === "dark" && method === READ_GRAPH_METHOD) {
        return structuredClone(current)
      }
      throw new Error(`Unexpected RPC ${target}.${method}`)
    },
  }
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
  store.hydrate(projectBulkGraph(mf117Document(true)))
  const manifest = buildBulkManifestation(
    store.view(),
    promotion.removedRootSrc,
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

const legacyV2PromotionReceipt = (): Record<string, unknown> => {
  const structuralProof = {
    version: 1,
    removedRoot: {id: 1, src: INFERENCE, absent: true},
    promotedRoot: {
      id: 2,
      src: LADA,
      formerRootFrame: promotion.formerRootFrame,
    },
    subtree: [
      {kind: "atom", id: 2, wimp: LADA, parentAtom: null, parentTopology: null, position: 0},
      {kind: "atom", id: 3, wimp: AUTH, parentAtom: 2, parentTopology: null, position: 0},
      {kind: "atom", id: 4, wimp: CHAT, parentAtom: 2, parentTopology: null, position: 1},
      {kind: "atom", id: 5, wimp: MODEL, parentAtom: 2, parentTopology: null, position: 2},
      {kind: "atom", id: 6, wimp: SEND, parentAtom: 4, parentTopology: null, position: 0},
    ],
  }
  const body = {
    schema: "metafor/bulk-mf117-promotion/v2",
    promotion,
    rootSrc: LADA,
    structuralProof,
    structuralSha256: sha256(structuralProof),
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
    const params = {version: 1, observerId: "bulk-web-owner"}
    expect(await captureHandler!(params, {source: "codex"})).toEqual({
      ok: false,
      error: {code: "permission_denied", message: "denied"},
    })
    expect(captureCalls).toEqual([{params, context: {source: "codex"}}])
  })

  test("becomes ready without reading or retaining a Graph", async () => {
    const peer = metaPeer(mf117Document())
    const monad = new BulkMonad()

    await monad.onServerStarted()
    expect(peer.calls).toEqual([])
    await expect(monad.openFreshObserver(peer as never, "before-force"))
      .rejects.toThrow("not ready")

    monad.onRuntimeBorn()
    expect(peer.calls).toEqual([])
    expect(await monad.onHealthRequested().json()).toMatchObject({
      initialized: true,
      rpc: "ready",
    })
  })

  test("prepares every page observer from its own fresh Dark Graph", async () => {
    const startup = mf117Document()
    const peer = metaPeer(startup)
    const monad = new BulkMonad()
    await monad.onServerStarted()
    monad.onRuntimeBorn()

    const working = mf117Document(true, "working")
    peer.set(working)
    const first = await monad.openFreshObserver(peer as never, "page-1")
    peer.set(startup)
    const second = await monad.openFreshObserver(peer as never, "page-2")

    expect(first.session).toBe("page-1")
    expect(first.graph).toEqual(working)
    expect(first.rootSrc).toBe(LADA)
    expect(first.visual.kind).toBe("visual-prepared-scene")
    expect(second.session).toBe("page-2")
    expect(second.graph).toEqual(startup)
    expect(peer.calls).toEqual([
      {
        target: "dark",
        method: READ_GRAPH_METHOD,
        params: {},
        options: {waitMs: 30_000},
      },
      {
        target: "dark",
        method: READ_GRAPH_METHOD,
        params: {},
        options: {waitMs: 30_000},
      },
    ])
  })

  test("guards the startup source against Boundary initial projection regression", () => {
    const source = readFileSync(new URL("./monad.ts", import.meta.url), "utf8")

    expect(source).toContain("READ_GRAPH_METHOD")
    expect(source).not.toContain("BulkGraphStore")
    expect(source).not.toContain("readonly #graph")
    expect(source).not.toContain("readonly #projection")
    expect(source).not.toContain("openObserver(")
    expect(source).not.toContain("BOUNDARY_INITIAL_PROJECTION_METHOD")
    expect(source).not.toContain("boundary.initialProjection.read")

    const birthStart = source.indexOf("async onServerStarted")
    const birth = source.slice(
      birthStart,
      source.indexOf("\n  onRuntimeBorn", birthStart),
    )
    expect(birth).not.toContain("READ_GRAPH_METHOD")
    expect(birth).not.toContain("peer.call")

    const freshObserverStart = source.indexOf("async openFreshObserver")
    const freshObserver = source.slice(
      freshObserverStart,
      source.indexOf("\n  #composeScene(", freshObserverStart),
    )
    expect(freshObserver).toContain("READ_GRAPH_METHOD")
    expect(freshObserver).toContain("cut.document.root")
    expect(freshObserver).not.toContain("#promotionReceipt")
    expect(freshObserver).not.toContain("MF117_")
  })

  test("uses a Particle as invalidation and prepares one event-local Graph scene", async () => {
    const peer = metaPeer(mf117Document())
    const monad = new BulkMonad()
    await monad.onServerStarted()
    monad.onRuntimeBorn()
    peer.set(mf117Document(true))

    const scene = await monad.onImpulse(peer as never, {
      parts: [{
        part: "graviton", op: "replace", path: "atom/2", by: "boundary", ts: 42,
        value: {
          atom: {id: 2, parentAtom: null, parentTopology: null, wimp: LADA, position: 0},
        },
      }],
    })

    expect(scene).toMatchObject({
      throughTs: 42,
      rootSrc: LADA,
      graph: {root: LADA},
    })
    expect(peer.calls).toEqual([
      {
        target: "boundary",
        method: FORCE_CHECKPOINT_QUIESCE_METHOD,
        params: {},
        options: {waitMs: 30_000},
      },
      {
        target: "dark",
        method: READ_GRAPH_METHOD,
        params: {},
        options: {waitMs: 30_000},
      },
    ])
  })

  test("fails closed without a retained fallback when Dark returns invalid Graph", async () => {
    const peer = metaPeer(mf117Document())
    const monad = new BulkMonad()
    await monad.onServerStarted()
    monad.onRuntimeBorn()
    peer.set({...mf117Document(), schema: "invalid"} as unknown as Graph)

    await expect(monad.onImpulse(peer as never, {
      parts: [{part: "photon", op: "replace", path: 2, by: "matrix", ts: 8, value: "working"}],
    })).rejects.toThrow("Bulk rejected Graph")
    expect(monad.onHealthRequested().status).toBe(200)
    expect(await monad.onHealthRequested().json()).toMatchObject({ok: false, rpc: "error"})
  })

  test("removes the Inference semantic root and persists one promoted Lada root", async () => {
    const directory = mkdtempSync(join(tmpdir(), "metafor-mf117-bulk-"))
    temporaryDirectories.push(directory)
    const promotionPath = join(directory, "bulk-promotion.json")
    const monad = new BulkMonad({
      promotionPath,
    })
    const peer = metaPeer(mf117Document())
    await monad.onServerStarted()
    monad.onRuntimeBorn()
    const before = await monad.openFreshObserver(peer as never, "mf117-before")
    expect(before.rootSrc).toBe("zavx0z/inference")
    expect(before.manifest.darkParticles.filter(({src}) =>
      src === "zavx0z/inference")).toHaveLength(1)
    expect(before.manifest.darkParticles.filter(({src}) =>
      src?.startsWith("zavx0z/lada"))).toHaveLength(5)
    await expect(monad.mf117Preflight(peer as never, {
      schema: "metafor/bulk-mf117-live/v1",
      promotion: {
        ...promotion,
        formerRootFrame: {...promotion.formerRootFrame, outerDiameterMm: 99},
      },
    })).rejects.toThrow("promotion receipt is not exact")
    const sourceBefore = before.manifest.darkParticles.find(({src}) => src === INFERENCE)!
    const targetBefore = before.manifest.darkParticles.find(({src}) => src === LADA)!
    expect(await monad.mf117Preflight(peer as never, {
      schema: "metafor/bulk-mf117-live/v1",
      promotion,
    })).toMatchObject({
      sourceRootTorus: {darkParticleId: sourceBefore.darkParticleId},
      targetChildTorus: {
        darkParticleId: targetBefore.darkParticleId,
        parentDarkParticleId: sourceBefore.darkParticleId,
      },
      noGhostTorus: true,
    })

    peer.set(mf117Document(true))
    await monad.onImpulse(peer as never, {
      parts: [{
        part: "graviton", op: "replace", path: "atom/2", by: "boundary", ts: 2,
        value: {
          atom: {id: 2, parentAtom: null, parentTopology: null, wimp: "zavx0z/lada", position: 0},
          values: [], valueRecords: [], valueItems: [], state: null, mass: [],
        },
      }],
    })
    expect((await monad.openFreshObserver(
      peer as never,
      "mf117-after-root-replace",
    )).rootSrc)
      .toBe("zavx0z/lada")
    await monad.onImpulse(peer as never, {
      parts: [{
        part: "graviton", op: "remove", path: "atom/1", by: "boundary", ts: 3,
      }],
    })
    const promoted = await monad.mf117Promote(peer as never, {
      schema: "metafor/bulk-mf117-live/v1",
      promotion,
    })
    expect(promoted).toMatchObject({
      rootSrc: "zavx0z/lada",
      removedInferenceTorusAbsent: true,
      promotedRootTorus: {parentDarkParticleId: null},
    })
    const observer = await monad.openFreshObserver(peer as never, "mf117-observer")
    expect(observer.rootSrc).toBe("zavx0z/lada")
    expect(observer.manifest.darkParticles.filter(({src}) =>
      src === "zavx0z/inference")).toHaveLength(0)
    expect(observer.manifest.darkParticles.some(({src}) => src === INFERENCE)).toBe(false)
    const ladaRoot = observer.manifest.darkParticles.find(({src}) => src === LADA)!
    const auth = observer.manifest.darkParticles.find(({src}) => src === AUTH)!
    const chat = observer.manifest.darkParticles.find(({src}) => src === CHAT)!
    const model = observer.manifest.darkParticles.find(({src}) => src === MODEL)!
    const send = observer.manifest.darkParticles.find(({src}) => src === SEND)!
    expect(ladaRoot.parentDarkParticleId).toBeNull()
    expect([auth.parentDarkParticleId, chat.parentDarkParticleId, model.parentDarkParticleId])
      .toEqual([ladaRoot.darkParticleId, ladaRoot.darkParticleId, ladaRoot.darkParticleId])
    expect(send.parentDarkParticleId).toBe(chat.darkParticleId)
    const durable = JSON.parse(readFileSync(promotionPath, "utf8")) as Record<string, unknown>
    expect(durable).toMatchObject({
      schema: "metafor/bulk-mf117-promotion/v2",
      retention: "retain-until-explicit-gc",
      structuralSha256: promoted.structuralSha256,
    })

    peer.set(mf117Document(true, "working"))
    await monad.onImpulse(peer as never, {
      parts: [{
        part: "photon", op: "replace", path: 2, by: "boundary", ts: 4,
        value: "working",
      }],
    })
    expect(sha256((await monad.openFreshObserver(
      peer as never,
      "mf117-dynamic",
    )).manifest))
      .not.toBe(sha256(observer.manifest))
    expect(await monad.mf117Verify(peer as never)).toMatchObject({
      receiptId: promoted.receiptId,
      structuralSha256: promoted.structuralSha256,
      removedInferenceTorusAbsent: true,
      promotedRootTorus: {parentDarkParticleId: null},
    })

    const recovered = new BulkMonad({promotionPath})
    const recoveredPeer = metaPeer(mf117Document(true))
    await recovered.onServerStarted()
    recovered.onRuntimeBorn()
    expect(await recovered.mf117Verify(recoveredPeer as never)).toMatchObject({
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

    const peer = metaPeer(mf117Document(true))
    await monad.onServerStarted()
    monad.onRuntimeBorn()
    peer.set(mf117Document(true, "working"))
    await monad.onImpulse(peer as never, {
      parts: [{
        part: "photon", op: "replace", path: 2, by: "boundary", ts: 40,
        value: "working",
      }],
    })

    expect(sha256((await monad.openFreshObserver(
      peer as never,
      "legacy-dynamic",
    )).manifest))
      .not.toBe(legacy.manifestSha256)
    expect(await monad.mf117Verify(peer as never)).toMatchObject({
      receiptId: legacy.receiptId,
      rootSrc: "zavx0z/lada",
      removedInferenceTorusAbsent: true,
    })
    expect(JSON.parse(readFileSync(promotionPath, "utf8"))).toEqual(legacy)
  })

  test("recovers a v2 receipt whose retained proof uses former Boundary identities", async () => {
    const directory = mkdtempSync(join(tmpdir(), "metafor-mf117-bulk-v2-"))
    temporaryDirectories.push(directory)
    const promotionPath = join(directory, "bulk-promotion.json")
    const legacy = legacyV2PromotionReceipt()
    writeFileSync(promotionPath, `${JSON.stringify(legacy, null, 2)}\n`)
    const monad = new BulkMonad({promotionPath})
    const peer = metaPeer(mf117Document(true))

    await monad.onServerStarted()
    monad.onRuntimeBorn()

    expect(await monad.mf117Verify(peer as never)).toMatchObject({
      receiptId: legacy.receiptId,
      rootSrc: LADA,
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

      await expect(monad.onServerStarted())
        .rejects.toThrow("durable promotion receipt conflicts")
    }
  })

  test("fails closed on a missing, reparented or ghost MF-117 subtree", async () => {
    const missing = mf117Document(true)
    missing.template[LADA]!.matter = missing.template[LADA]!.matter!.slice(0, 2)
    delete missing.template[MODEL]
    const missingRoot = missing.runtime.roots[0]!
    if (missingRoot.kind === "atom") missingRoot.children = missingRoot.children!.slice(0, 2)

    const reparented = mf117Document(true)
    delete reparented.template[CHAT]!.matter
    reparented.template[MODEL]!.matter = [{kind: "wimp", src: SEND}]
    const reparentedRoot = reparented.runtime.roots[0]!
    if (reparentedRoot.kind === "atom") {
      const chat = reparentedRoot.children![1]!
      const model = reparentedRoot.children![2]!
      if (chat.kind === "atom" && model.kind === "atom") {
        const send = chat.children![0]!
        send.declaration = "#/template/zavx0z~1lada-model/matter/0"
        delete chat.children
        model.children = [send]
      }
    }

    const ghost = mf117Document(true)
    ghost.template[LADA]!.matter!.push({kind: "wimp", src: INFERENCE})
    ghost.template[INFERENCE] = {
      name: "Inference", fields: [], superposition: [], mass: [], processes: [],
    }
    const ghostRoot = ghost.runtime.roots[0]!
    if (ghostRoot.kind === "atom") {
      ghostRoot.children!.push(runtimeAtom("#/template/zavx0z~1lada/matter/3", INFERENCE))
    }

    const cases = [
      {
        name: "missing",
        document: missing,
        error: "missing or reparented",
      },
      {
        name: "reparented",
        document: reparented,
        error: "missing or reparented",
      },
      {
        name: "ghost",
        document: ghost,
        error: "ghost torus",
      },
    ]
    for (const scenario of cases) {
      const directory = mkdtempSync(join(tmpdir(), `metafor-mf117-bulk-${scenario.name}-`))
      temporaryDirectories.push(directory)
      const promotionPath = join(directory, "bulk-promotion.json")
      writeFileSync(promotionPath, `${JSON.stringify(legacyPromotionReceipt(), null, 2)}\n`)
      const monad = new BulkMonad({promotionPath})
      const peer = metaPeer(scenario.document)

      await monad.onServerStarted()
      monad.onRuntimeBorn()
      await expect(monad.mf117Verify(peer as never))
        .rejects.toThrow(scenario.error)
    }
  })
})
