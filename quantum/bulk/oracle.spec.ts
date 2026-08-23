import {describe, expect, test} from "bun:test"
import {readFileSync} from "node:fs"
import {
  DARK_BULK_VIEWPORT_CAPTURE_METHOD,
} from "shared/protocol/bulk/browser"
import {BULK_VIEWPORT_CAPTURE_METHOD} from "shared/protocol/bulk/capture"
import {
  BOUNDARY_INITIAL_PROJECTION_METHOD,
  type BoundaryInitialProjection,
} from "shared/protocol/boundary/initial"
import {
  GRAPH_SCHEMA,
  READ_GRAPH_METHOD,
  parseMetaAddress,
  type DocumentPointer,
  type Graph,
} from "@metafor/types/metafor/graph"
import {FORCE_CHECKPOINT_QUIESCE_METHOD} from "shared/transport/force/checkpoint"
import type {ForceMessage} from "shared/protocol/force/message"
import {BulkOracle} from "./oracle.ts"
import {prepareBulkGraphCut} from "./graph.ts"
import {composeBulkStoreTestOracleScene} from "./store-test-oracle.ts"

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

const sampleDocument = (
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
  let boundary = boundaryInitial()
  const calls: Array<{target: string; method: string; params: unknown; options: unknown}> = []
  return {
    calls,
    set(value: Graph) {
      current = structuredClone(value)
    },
    setBoundary(value: BoundaryInitialProjection) {
      boundary = structuredClone(value)
    },
    async call(target: string, method: string, params: unknown, options: unknown) {
      calls.push({target, method, params, options})
      if (target === "boundary" && method === BOUNDARY_INITIAL_PROJECTION_METHOD) {
        return structuredClone(boundary)
      }
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

const oracleThroughTs = new WeakMap<BulkOracle, number | null>()

const testOracleOpenFreshObserver = async (
  oracle: BulkOracle,
  peer: ReturnType<typeof metaPeer>,
  session: string,
) => {
  const health = await oracle.onHealthRequested().json() as {rpc: string}
  if (health.rpc !== "ready") {
    throw new Error(`Bulk observer cannot open: runtime is not ready (${health.rpc})`)
  }
  const value = await peer.call(
    "dark",
    READ_GRAPH_METHOD,
    {},
    {waitMs: 30_000},
  ) as Graph
  const cut = prepareBulkGraphCut(value)
  return {
    ...composeBulkStoreTestOracleScene(
      cut.projection.runtime,
      cut.document.root,
      oracleThroughTs.get(oracle) ?? null,
      null,
    ),
    session,
  }
}

const testOracleOnImpulse = async (
  oracle: BulkOracle,
  peer: ReturnType<typeof metaPeer>,
  message: ForceMessage,
) => {
  const health = await oracle.onHealthRequested().json() as {rpc: string}
  if (health.rpc !== "ready") {
    throw new Error(`Bulk Oracle cannot apply an invalidation from state: ${health.rpc}`)
  }
  try {
    await peer.call(
      "boundary",
      FORCE_CHECKPOINT_QUIESCE_METHOD,
      {},
      {waitMs: 30_000},
    )
    const current = await peer.call(
      "dark",
      READ_GRAPH_METHOD,
      {},
      {waitMs: 30_000},
    ) as Graph
    const cut = prepareBulkGraphCut(current)
    const throughTs = message.parts[0]!.ts
    const scene = composeBulkStoreTestOracleScene(
      cut.projection.runtime,
      cut.document.root,
      throughTs,
      null,
    )
    oracleThroughTs.set(oracle, throughTs)
    return scene
  } catch (error) {
    oracle.onRuntimeBirthFailed(error)
    throw error
  }
}

const boundaryInitial = (): BoundaryInitialProjection => ({
  version: 1,
  entries: [
    {
      part: "graviton",
      op: "add",
      path: "wimp",
      value: {src: "owner/root", name: "Root"},
    },
    {
      part: "graviton",
      op: "add",
      path: "atom/1",
      value: {
        atom: {id: 1, parentAtom: null, parentTopology: null, wimp: "owner/root", position: 0},
        values: [],
        valueRecords: [],
        valueItems: [],
        state: null,
      },
    },
  ],
})

describe("Bulk Oracle", () => {
  test("registers the typed observer capture method before advertising it", async () => {
    const methods: string[] = []
    let captureHandler:
      | ((params: unknown, context: {source: string}) => unknown | Promise<unknown>)
      | null = null
    const captureCalls: unknown[] = []
    const oracle = new BulkOracle()

    oracle.onServerStarting({
      expose(method: string, handler: typeof captureHandler) {
        methods.push(method)
        if (method === BULK_VIEWPORT_CAPTURE_METHOD) captureHandler = handler
      },
      call(target: string, method: string, request: unknown) {
        captureCalls.push({target, method, request})
        return Promise.resolve({
          ok: false as const,
          error: {code: "permission_denied" as const, message: "denied"},
        })
      },
    } as never)

    expect(methods).toEqual([BULK_VIEWPORT_CAPTURE_METHOD])
    const params = {version: 1, observerId: "bulk-web-owner"}
    expect(await captureHandler!(params, {source: "codex"})).toEqual({
      ok: false,
      error: {code: "permission_denied", message: "denied"},
    })
    expect(captureCalls).toEqual([{
      target: "dark",
      method: DARK_BULK_VIEWPORT_CAPTURE_METHOD,
      request: {source: "codex", params},
    }])
  })

  test("becomes ready without reading or retaining a Graph", async () => {
    const peer = metaPeer(sampleDocument())
    const oracle = new BulkOracle()

    await oracle.onServerStarted()
    expect(peer.calls).toEqual([])
    await expect(testOracleOpenFreshObserver(oracle, peer, "before-force"))
      .rejects.toThrow("not ready")

    oracle.onRuntimeBorn()
    expect(peer.calls).toEqual([])
    expect(await oracle.onHealthRequested().json()).toMatchObject({
      initialized: true,
      rpc: "ready",
    })
  })

  test("serves independent observers from one retained RPC-built Store without Graph reads", async () => {
    const peer = metaPeer(sampleDocument())
    const oracle = new BulkOracle()
    await oracle.onServerStarted(peer as never)
    oracle.onRuntimeBorn()

    const first = await oracle.openFreshObserver(peer as never, "page-1")
    const second = await oracle.openFreshObserver(peer as never, "page-2")

    expect(first.session).toBe("page-1")
    expect(second.session).toBe("page-2")
    expect(first.store.root).toBe(2)
    expect(Object.keys(first).toSorted()).toEqual(["session", "store"])
    expect(first.store).toEqual(second.store)
    expect(first.store).not.toBe(second.store)
    expect(peer.calls).toEqual([{
      target: "boundary",
      method: BOUNDARY_INITIAL_PROJECTION_METHOD,
      params: {},
      options: {waitMs: 30_000},
    }])
  })

  test("serves late observers from the structurally updated retained Store", async () => {
    const peer = metaPeer(sampleDocument())
    const oracle = new BulkOracle()
    await oracle.onServerStarted(peer as never)
    oracle.onRuntimeBorn()

    oracle.acceptImpulse({parts: [{
      part: "graviton", op: "add", path: "wimp", ts: 1,
      value: {src: "owner/child", name: "Child"},
    }]})
    oracle.acceptImpulse({parts: [{
      part: "graviton", op: "add", path: "field", ts: 2,
      value: {
        id: 101, wimp: "owner/child", localId: 1,
        key: "value", type: "number", required: false, label: "Value",
      },
    }]})
    oracle.acceptImpulse({parts: [{
      part: "graviton", op: "add", path: "atom/2", ts: 3,
      value: {
        atom: {
          id: 2, parentAtom: 1, parentTopology: null,
          wimp: "owner/child", position: 0,
        },
        state: {metaState: null},
        values: [{atom: 2, field: 101, value: 701}],
        valueRecords: [{id: 701, kind: "number", number: 7}],
        valueItems: [],
      },
    }]})
    oracle.acceptImpulse({parts: [{
      part: "graviton", op: "replace", path: "bulk", ts: 4,
      value: {wimp: "owner/child", view: ".excluded {}"},
    }]})

    const observer = await oracle.openFreshObserver(peer as never, "late-structural")
    expect(observer.store.wimp.src).toContain("owner/child")
    expect(Array.from(observer.store.fieldSource.id)).toContain(101)
    expect(Array.from(observer.store.dark.id)).toContain(4)
    expect(Array.from(observer.store.fieldAlias.atom)).toContain(2)
    expect(JSON.stringify(observer.store)).not.toContain(".excluded {}")
    expect(peer.calls).toHaveLength(1)
  })

  test("waits for the first rooted Boundary cut when Universe starts empty", async () => {
    const peer = metaPeer(sampleDocument())
    peer.setBoundary({version: 1, entries: []})
    const oracle = new BulkOracle()

    await oracle.onServerStarted(peer as never)
    oracle.onRuntimeBorn()
    expect(await oracle.onHealthRequested().json()).toMatchObject({
      initialized: true,
      rpc: "ready",
    })

    peer.setBoundary(boundaryInitial())
    const observer = await oracle.openFreshObserver(peer as never, "late-root")

    expect(observer.session).toBe("late-root")
    expect(observer.store.root).toBe(2)
    expect(peer.calls).toEqual([
      {
        target: "boundary",
        method: BOUNDARY_INITIAL_PROJECTION_METHOD,
        params: {},
        options: {waitMs: 30_000},
      },
      {
        target: "boundary",
        method: BOUNDARY_INITIAL_PROJECTION_METHOD,
        params: {},
        options: {waitMs: 30_000},
      },
    ])
  })

  test("keeps the former fresh-Graph observer path only as a parity oracle", async () => {
    const startup = sampleDocument()
    const peer = metaPeer(startup)
    const oracle = new BulkOracle()
    await oracle.onServerStarted()
    oracle.onRuntimeBorn()

    const working = sampleDocument(true, "working")
    peer.set(working)
    const first = await testOracleOpenFreshObserver(oracle, peer, "page-1")
    peer.set(startup)
    const second = await testOracleOpenFreshObserver(oracle, peer, "page-2")

    expect(first.session).toBe("page-1")
    expect(first.rootSrc).toBe(LADA)
    expect(first.visual.kind).toBe("visual-prepared-scene")
    expect(second.session).toBe("page-2")
    expect(first.visual).not.toEqual(second.visual)
    expect("graph" in first).toBe(false)
    expect("manifest" in first).toBe(false)
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

  test("guards the production startup and observer source against Graph reintroduction", () => {
    const source = readFileSync(new URL("./oracle.ts", import.meta.url), "utf8")

    expect(source).not.toContain("READ_GRAPH_METHOD")
    expect(source).not.toContain("BulkGraphStore")
    expect(source).not.toContain("readonly #graph")
    expect(source).not.toContain("openObserver(")
    expect(source).toContain("BOUNDARY_INITIAL_PROJECTION_METHOD")

    const birthStart = source.indexOf("async onServerStarted")
    const birth = source.slice(
      birthStart,
      source.indexOf("\n  onRuntimeBorn", birthStart),
    )
    expect(birth).not.toContain("READ_GRAPH_METHOD")
    expect(birth).toContain("BOUNDARY_INITIAL_PROJECTION_METHOD")
    expect(birth).toContain("prepareBulkStoreInitial")

    const freshObserverStart = source.indexOf("async openFreshObserver")
    const freshObserver = source.slice(
      freshObserverStart,
      source.indexOf("\n  onHealthRequested", freshObserverStart),
    )
    expect(freshObserver).not.toContain("READ_GRAPH_METHOD")
    expect(freshObserver).toContain("BOUNDARY_INITIAL_PROJECTION_METHOD")
    expect(freshObserver).toContain("prepareBulkStoreInitial")
    expect(freshObserver).toContain("structuredClone(this.#store)")
    expect(source).not.toContain("store-test-oracle")
    expect(source).not.toContain("testOracle")
  })

  test("uses a Particle as invalidation and prepares one event-local ready scene", async () => {
    const peer = metaPeer(sampleDocument())
    const oracle = new BulkOracle()
    await oracle.onServerStarted()
    oracle.onRuntimeBorn()
    peer.set(sampleDocument(true))

    const scene = await testOracleOnImpulse(oracle, peer, {
      parts: [{
        part: "graviton", op: "replace", path: "atom/2", by: "boundary", ts: 42,
        value: {
          atom: {id: 2, parentAtom: null, parentTopology: null, wimp: LADA, position: 0},
        },
      }],
    })

    expect(scene).toMatchObject({
      kind: "bulk-ready-scene",
      throughTs: 42,
      rootSrc: LADA,
    })
    expect("graph" in scene).toBe(false)
    expect("manifest" in scene).toBe(false)
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
    const peer = metaPeer(sampleDocument())
    const oracle = new BulkOracle()
    await oracle.onServerStarted()
    oracle.onRuntimeBorn()
    peer.set({...sampleDocument(), schema: "invalid"} as unknown as Graph)

    await expect(testOracleOnImpulse(oracle, peer, {
      parts: [{part: "photon", op: "replace", path: 2, by: "matrix", ts: 8, value: "working"}],
    })).rejects.toThrow("Bulk rejected Graph")
    expect(oracle.onHealthRequested().status).toBe(200)
    expect(await oracle.onHealthRequested().json()).toMatchObject({ok: false, rpc: "error"})
  })

})
