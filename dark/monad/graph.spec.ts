import {describe, expect, test} from "bun:test"
import {
  GRAPH_SCHEMA,
  READ_GRAPH_METHOD,
  parseMetaAddress,
  validateGraph,
  type Graph,
} from "@metafor/types/metafor/graph"
import type {
  MonadRpcContext,
  MonadRpcHandler,
} from "shared/transport/monad"
import {BOUNDARY_GRAPH_PROJECTION_METHOD} from "../../boundary/graph.ts"
import {DARK_DECLARATION_PROJECTION_METHOD} from "../graph.ts"
import {
  GraphAssemblyError,
  GraphMonad,
} from "./graph.ts"

const ROOT = parseMetaAddress("example/root")!
const CHILD = parseMetaAddress("example/child")!
const OTHER = parseMetaAddress("example/other")!

type Provider = (params: unknown) => unknown | Promise<unknown>

class TestPeer {
  readonly handlers = new Map<string, MonadRpcHandler>()
  readonly calls: Array<{target: string; method: string; params: unknown}> = []

  constructor(readonly providers: Record<string, Provider>) {}

  expose(method: string, handler: MonadRpcHandler): void {
    this.handlers.set(method, handler)
  }

  async call<T>(target: string, method: string, params: unknown): Promise<T> {
    this.calls.push({target, method, params})
    const provider = this.providers[`${target}:${method}`]
    if (!provider) throw new Error(`Missing test provider: ${target}:${method}`)
    return await provider(params) as T
  }

  async invoke(params: unknown): Promise<unknown> {
    const handler = this.handlers.get(READ_GRAPH_METHOD)
    if (!handler) throw new Error("Graph read handler is not exposed")
    const context: MonadRpcContext = {source: "test/client"}
    return await handler(params, context)
  }
}

const template = (rootName = "Root"): Graph["template"] => ({
  [ROOT]: {
    name: rootName,
    fields: [{key: "label", type: "string"}],
    superposition: [{name: "ready", transitions: null}],
    mass: [],
    processes: [],
    matter: [{kind: "wimp", src: CHILD}],
  },
  [CHILD]: {
    name: "Child",
    fields: [{key: "label", type: "string"}],
    superposition: [{name: "visible", transitions: null}],
    mass: [],
    processes: [],
  },
})

const runtime = (label = "first"): Graph["runtime"] => ({
  roots: [{
    kind: "atom",
    declaration: "#/template/example~1root",
    meta: ROOT,
    state: "ready",
    values: {label},
    children: [{
      kind: "atom",
      declaration: "#/template/example~1root/matter/0",
      meta: CHILD,
      state: "visible",
      values: {},
    }],
  }],
})

const providers = (
  dark: Provider = () => ({root: ROOT, template: template()}),
  boundary: Provider = () => ({root: ROOT, runtime: runtime()}),
): Record<string, Provider> => ({
  [`dark:${DARK_DECLARATION_PROJECTION_METHOD}`]: dark,
  [`boundary:${BOUNDARY_GRAPH_PROJECTION_METHOD}`]: boundary,
})

const service = (peer: TestPeer): TestPeer => {
  new GraphMonad().onServerStarted(peer)
  return peer
}

const capture = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error("Expected promise to reject")
}

describe("stateless Graph Monad assembly", () => {
  test("exposes readGraph and joins one full validated document", async () => {
    const peer = service(new TestPeer(providers()))
    const result = await peer.invoke({root: ROOT})

    expect(peer.handlers.has(READ_GRAPH_METHOD)).toBe(true)
    expect(result).toEqual({
      schema: GRAPH_SCHEMA,
      root: ROOT,
      template: template(),
      runtime: runtime(),
    })
    expect(Object.keys(result as Record<string, unknown>)).toEqual([
      "schema",
      "root",
      "template",
      "runtime",
    ])
    expect(peer.calls).toEqual([
      {
        target: "dark",
        method: DARK_DECLARATION_PROJECTION_METHOD,
        params: {root: ROOT},
      },
      {
        target: "boundary",
        method: BOUNDARY_GRAPH_PROJECTION_METHOD,
        params: {root: ROOT},
      },
    ])
  })

  test.each([
    ["extra property", {root: ROOT, view: "diagnostic"}, "Graph read params must contain only root"],
    ["missing root", {}, "Graph read params must contain only root"],
    ["non-object", ROOT, "Graph read params must be a plain object containing only root"],
    [
      "non-canonical root",
      {root: "example/root/extra"},
      "Graph read root must be a canonical <owner>/<repository> address",
    ],
  ])("closes public params: %s", async (_label, params, message) => {
    const peer = service(new TestPeer(providers()))
    const error = await capture(peer.invoke(params))

    expect(error).toBeInstanceOf(GraphAssemblyError)
    expect(error).toMatchObject({code: "invalid_params", message})
    expect(peer.calls).toEqual([])
  })

  test.each([
    ["Dark", () => ({root: OTHER, template: template()})],
    ["Boundary", () => ({root: OTHER, runtime: runtime()})],
  ])("rejects a %s provider root mismatch", async (provider, mismatch) => {
    const peer = service(new TestPeer(providers(
      provider === "Dark" ? mismatch : undefined,
      provider === "Boundary" ? mismatch : undefined,
    )))
    const error = await capture(peer.invoke({root: ROOT}))

    expect(error).toBeInstanceOf(GraphAssemblyError)
    expect(error).toMatchObject({
      code: "provider_root_mismatch",
      message: `${provider} Graph projection root mismatch: expected "${ROOT}", received "${OTHER}"`,
    })
  })

  test("isolates Boundary params from a Dark provider that retains and mutates its params", async () => {
    const retainedDarkParams: Array<Record<string, unknown>> = []
    const boundaryParams: Array<Record<string, unknown>> = []
    const peer = service(new TestPeer(providers(
      (params) => {
        const retained = params as Record<string, unknown>
        retainedDarkParams.push(retained)
        retained.root = OTHER
        return {root: ROOT, template: template()}
      },
      (params) => {
        boundaryParams.push(params as Record<string, unknown>)
        return {root: ROOT, runtime: runtime()}
      },
    )))

    const result = await peer.invoke({root: ROOT}) as Graph

    expect(retainedDarkParams).toEqual([{root: OTHER}])
    expect(boundaryParams).toEqual([{root: ROOT}])
    expect(boundaryParams[0]).not.toBe(retainedDarkParams[0])
    expect(result.root).toBe(ROOT)
  })

  test("propagates exact public validation issues for an invalid structural join", async () => {
    const invalidRuntime = runtime()
    invalidRuntime.roots[0]!.declaration = "#/template/example~1root/matter/0"
    const peer = service(new TestPeer(providers(
      undefined,
      () => ({root: ROOT, runtime: invalidRuntime}),
    )))
    const error = await capture(peer.invoke({root: ROOT}))
    const expected = validateGraph({
      schema: GRAPH_SCHEMA,
      root: ROOT,
      template: template(),
      runtime: invalidRuntime,
    })

    expect(error).toBeInstanceOf(GraphAssemblyError)
    expect(error).toMatchObject({code: "validation_failed"})
    expect(expected.ok).toBe(false)
    if (expected.ok) return
    expect((error as GraphAssemblyError).issues).toEqual(expected.issues)
    expect((error as Error).message).toContain(
      "/runtime/roots/0/declaration [occurrence_pointer_mismatch]",
    )
  })

  test.each([
    [
      "enumerable function",
      "dark",
      () => ({
        root: ROOT,
        template: {invalid: () => "not JSON"},
      }),
    ],
    [
      "Date",
      "boundary",
      () => ({root: ROOT, runtime: new Date(0)}),
    ],
    [
      "custom class DTO",
      "dark",
      () => new class CustomDarkProjection {
        root = ROOT
        template = template()
      }(),
    ],
    [
      "own symbol function",
      "dark",
      () => {
        const projection: Record<PropertyKey, unknown> = {
          root: ROOT,
          template: template(),
        }
        projection[Symbol("invalid")] = () => "not JSON"
        return projection
      },
    ],
    [
      "own non-enumerable value",
      "dark",
      () => {
        const projection = {root: ROOT, template: template()}
        Object.defineProperty(projection, "hidden", {
          value: "not public JSON",
          enumerable: false,
        })
        return projection
      },
    ],
    [
      "sparse runtime roots",
      "boundary",
      () => ({root: ROOT, runtime: {roots: new Array(1)}}),
    ],
    [
      "cycle",
      "dark",
      () => {
        const projection: Record<string, unknown> = {
          root: ROOT,
          template: template(),
        }
        projection.self = projection
        return projection
      },
    ],
  ] as const)(
    "rejects original provider graph laundering through %s",
    async (_label, provider, response) => {
      const input = providers(
        provider === "dark" ? response : undefined,
        provider === "boundary" ? response : undefined,
      )
      const peer = service(new TestPeer(input))
      const error = await capture(peer.invoke({root: ROOT}))

      expect(error).toBeInstanceOf(GraphAssemblyError)
      expect(error).toMatchObject({
        code: "invalid_provider_projection",
        message: `${provider === "dark" ? "Dark" : "Boundary"} Graph projection must be cloneable JSON data`,
      })
    },
  )

  test("rejects an original provider accessor without invoking its getter", async () => {
    let getterCalls = 0
    const projection = {root: ROOT, template: template()} as Record<string, unknown>
    Object.defineProperty(projection, "hidden", {
      enumerable: true,
      get: () => {
        getterCalls++
        return "not public JSON"
      },
    })
    const peer = service(new TestPeer(providers(() => projection)))
    const error = await capture(peer.invoke({root: ROOT}))

    expect(error).toBeInstanceOf(GraphAssemblyError)
    expect(error).toMatchObject({
      code: "invalid_provider_projection",
      message: "Dark Graph projection must be cloneable JSON data",
    })
    expect(getterCalls).toBe(0)
  })

  test.each(["dark", "boundary"])(
    "propagates %s provider failure without a partial result",
    async (failing) => {
      const failure = new Error(`${failing} unavailable`)
      const peer = service(new TestPeer(providers(
        failing === "dark" ? () => { throw failure } : undefined,
        failing === "boundary" ? () => { throw failure } : undefined,
      )))
      const error = await capture(peer.invoke({root: ROOT}))

      expect(error).toBe(failure)
      expect(peer.calls.map(({target}) => target)).toEqual(
        failing === "dark" ? ["dark"] : ["dark", "boundary"],
      )
    },
  )

  test("re-reads both providers and reflects new outputs without retaining a snapshot", async () => {
    let generation = 1
    const peer = service(new TestPeer(providers(
      () => ({root: ROOT, template: template(`Root ${generation}`)}),
      () => ({root: ROOT, runtime: runtime(`value ${generation}`)}),
    )))

    const first = await peer.invoke({root: ROOT}) as Graph
    generation = 2
    const second = await peer.invoke({root: ROOT}) as Graph

    expect(first.template[ROOT]!.name).toBe("Root 1")
    expect(first.runtime.roots[0]).toMatchObject({values: {label: "value 1"}})
    expect(second.template[ROOT]!.name).toBe("Root 2")
    expect(second.runtime.roots[0]).toMatchObject({values: {label: "value 2"}})
    expect(peer.calls.map(({target}) => target)).toEqual([
      "dark",
      "boundary",
      "dark",
      "boundary",
    ])
  })

  test("owns detached provider graphs across provider mutation and later reads", async () => {
    const darkProjection = {root: ROOT, template: template("Root 1")}
    const boundaryProjection = {root: ROOT, runtime: runtime("value 1")}
    let darkReads = 0
    const peer = service(new TestPeer(providers(
      () => {
        darkReads++
        if (darkReads === 2) {
          darkProjection.template[ROOT]!.name = "Root 2"
          const root = boundaryProjection.runtime.roots[0]!
          if (root.kind === "atom") root.values.label = "value 2"
        }
        return darkProjection
      },
      () => boundaryProjection,
    )))

    const first = await peer.invoke({root: ROOT}) as Graph
    darkProjection.template[ROOT]!.name = "mutated between reads"
    const providerRoot = boundaryProjection.runtime.roots[0]!
    if (providerRoot.kind === "atom") providerRoot.values.label = "mutated between reads"

    expect(first.template[ROOT]!.name).toBe("Root 1")
    expect(first.runtime.roots[0]).toMatchObject({values: {label: "value 1"}})

    const second = await peer.invoke({root: ROOT}) as Graph
    darkProjection.template[ROOT]!.name = "mutated after reads"
    if (providerRoot.kind === "atom") providerRoot.values.label = "mutated after reads"

    expect(first.template[ROOT]!.name).toBe("Root 1")
    expect(first.runtime.roots[0]).toMatchObject({values: {label: "value 1"}})
    expect(second.template[ROOT]!.name).toBe("Root 2")
    expect(second.runtime.roots[0]).toMatchObject({values: {label: "value 2"}})
  })
})
