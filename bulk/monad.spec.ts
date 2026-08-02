import {describe, expect, test} from "bun:test"
import {readFileSync} from "node:fs"
import {BULK_VIEWPORT_CAPTURE_METHOD} from "@metafor/types/bulk/capture"
import {
  GRAPH_SCHEMA,
  READ_GRAPH_METHOD,
  parseMetaAddress,
  type DocumentPointer,
  type Graph,
} from "@metafor/types/metafor/graph"
import {FORCE_CHECKPOINT_QUIESCE_METHOD} from "shared/transport/force/checkpoint"
import {BulkMonad} from "./monad.ts"

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

describe("Bulk Monad", () => {
  test("registers the typed observer capture method before advertising it", async () => {
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

    expect(methods).toEqual([BULK_VIEWPORT_CAPTURE_METHOD])
    const params = {version: 1, observerId: "bulk-web-owner"}
    expect(await captureHandler!(params, {source: "codex"})).toEqual({
      ok: false,
      error: {code: "permission_denied", message: "denied"},
    })
    expect(captureCalls).toEqual([{params, context: {source: "codex"}}])
  })

  test("becomes ready without reading or retaining a Graph", async () => {
    const peer = metaPeer(sampleDocument())
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
    const startup = sampleDocument()
    const peer = metaPeer(startup)
    const monad = new BulkMonad()
    await monad.onServerStarted()
    monad.onRuntimeBorn()

    const working = sampleDocument(true, "working")
    peer.set(working)
    const first = await monad.openFreshObserver(peer as never, "page-1")
    peer.set(startup)
    const second = await monad.openFreshObserver(peer as never, "page-2")

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
  })

  test("uses a Particle as invalidation and prepares one event-local ready scene", async () => {
    const peer = metaPeer(sampleDocument())
    const monad = new BulkMonad()
    await monad.onServerStarted()
    monad.onRuntimeBorn()
    peer.set(sampleDocument(true))

    const scene = await monad.onImpulse(peer as never, {
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
    const monad = new BulkMonad()
    await monad.onServerStarted()
    monad.onRuntimeBorn()
    peer.set({...sampleDocument(), schema: "invalid"} as unknown as Graph)

    await expect(monad.onImpulse(peer as never, {
      parts: [{part: "photon", op: "replace", path: 2, by: "matrix", ts: 8, value: "working"}],
    })).rejects.toThrow("Bulk rejected Graph")
    expect(monad.onHealthRequested().status).toBe(200)
    expect(await monad.onHealthRequested().json()).toMatchObject({ok: false, rpc: "error"})
  })

})
