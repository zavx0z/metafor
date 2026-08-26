import {describe, expect, test} from "bun:test"
import {applyGraphDelta} from "../../dark/graph/delta.ts"
import {CausalGraphReadService} from "../../dark/graph/causal.ts"
import {
  DarkForceCausalReadError,
  type DarkForceTimeControl,
} from "../../dark/time-control.ts"
import type {Graph} from "@metafor/types/metafor/graph"
import type {
  ReadGraphDeltaDeltaReceipt,
  ReadGraphDeltaSnapshotReceipt,
} from "shared/protocol/metafor/observation"
import {createGraphFixture} from "./fixture.ts"

const held = (sequence: number) => ({
  cutId: "causal-graph-cut",
  phase: "held" as const,
  acceptanceSequence: sequence,
  domains: [],
})

const snapshot = (value: unknown): ReadGraphDeltaSnapshotReceipt => {
  if (
    !value ||
    typeof value !== "object" ||
    (value as {kind?: unknown}).kind !== "snapshot"
  ) throw new Error("Expected Graph snapshot receipt")
  return value as ReadGraphDeltaSnapshotReceipt
}

const delta = (value: unknown): ReadGraphDeltaDeltaReceipt => {
  if (
    !value ||
    typeof value !== "object" ||
    (value as {kind?: unknown}).kind !== "delta"
  ) throw new Error("Expected Graph delta receipt")
  return value as ReadGraphDeltaDeltaReceipt
}

describe("causal readGraphDelta service", () => {
  test("reads Graph only inside a held frontier and advances by verified ref delta", async () => {
    const events: string[] = []
    let sequence = 11
    let graph = createGraphFixture()
    const exact = {
      async readAtExactFrontier<T>(reader: Parameters<DarkForceTimeControl["readAtExactFrontier"]>[0]): Promise<T> {
        events.push(`hold:${sequence}`)
        const result = await reader(held(sequence)) as T
        events.push(`release:${sequence}`)
        return result
      },
    }
    const service = new CausalGraphReadService(exact, async () => {
      events.push(`graph:${sequence}`)
      return structuredClone(graph)
    })

    const initial = snapshot(await service.read({contractVersion: 1, base: null}))
    expect(initial).toMatchObject({
      contractVersion: 1,
      resolution: "exact",
      kind: "snapshot",
      reason: "initial",
      snapshot: {
        identity: {
          root: graph.root,
          frontier: {
            cutId: "causal-graph-cut",
            throughSequence: 11,
            retroactiveComplete: false,
          },
        },
      },
    })
    expect(initial.snapshot.identity.digest).toMatch(/^sha256:[a-f0-9]{64}$/)

    graph = structuredClone(graph)
    const root = graph.runtime.roots[0]
    if (root?.kind !== "atom") throw new Error("Graph root Atom is unavailable")
    root.values.count = 2
    sequence = 12
    const next = delta(await service.read({
      contractVersion: 1,
      base: initial.snapshot.identity,
    }))

    expect(next).toMatchObject({
      resolution: "exact",
      base: initial.snapshot.identity,
      result: {
        frontier: {cutId: "causal-graph-cut", throughSequence: 12},
      },
      delta: {
        baseDigest: initial.snapshot.identity.digest,
        resultDigest: next.result.digest,
        changes: [{
          op: "replace",
          target: {kind: "runtime-node", ref: "atom:1"},
        }],
      },
    })
    expect(applyGraphDelta(initial.snapshot.graph, next.delta)).toEqual(graph)
    expect(events).toEqual([
      "hold:11", "graph:11", "release:11",
      "hold:12", "graph:12", "release:12",
    ])
  })

  test("returns an exact resync snapshot after the disposable base is evicted", async () => {
    let sequence = 1
    let graph: Graph = createGraphFixture()
    const service = new CausalGraphReadService({
      async readAtExactFrontier<T>(reader: Parameters<DarkForceTimeControl["readAtExactFrontier"]>[0]): Promise<T> {
        return await reader(held(sequence)) as T
      },
    }, async () => structuredClone(graph), 1)

    const first = snapshot(await service.read({contractVersion: 1, base: null}))
    sequence = 2
    graph = structuredClone(graph)
    const firstRoot = graph.runtime.roots[0]
    if (firstRoot?.kind !== "atom") throw new Error("Graph root Atom is unavailable")
    firstRoot.values.count = 1
    await service.read({contractVersion: 1, base: null})

    sequence = 3
    graph = structuredClone(graph)
    const secondRoot = graph.runtime.roots[0]
    if (secondRoot?.kind !== "atom") throw new Error("Graph root Atom is unavailable")
    secondRoot.values.count = 2
    const resync = snapshot(await service.read({
      contractVersion: 1,
      base: first.snapshot.identity,
    }))

    expect(resync).toMatchObject({
      resolution: "exact",
      kind: "snapshot",
      reason: "resync",
      snapshot: {
        identity: {frontier: {throughSequence: 3}},
        graph: {runtime: {roots: [{values: {count: 2}}]}},
      },
    })
  })

  test("advances an exact logical tick with an empty Graph change set", async () => {
    let sequence = 20
    const graph = createGraphFixture()
    const service = new CausalGraphReadService({
      async readAtExactFrontier<T>(reader: Parameters<DarkForceTimeControl["readAtExactFrontier"]>[0]): Promise<T> {
        return await reader(held(sequence)) as T
      },
    }, async () => structuredClone(graph))
    const initial = snapshot(await service.read({contractVersion: 1, base: null}))
    sequence = 21

    const next = delta(await service.read({
      contractVersion: 1,
      base: initial.snapshot.identity,
    }))

    expect(next).toMatchObject({
      resolution: "exact",
      kind: "delta",
      base: {frontier: {throughSequence: 20}},
      result: {frontier: {throughSequence: 21}},
      delta: {
        baseDigest: initial.snapshot.identity.digest,
        resultDigest: initial.snapshot.identity.digest,
        changes: [],
      },
    })
  })

  test("resynchronizes instead of crossing a different cut or root", async () => {
    const graph = createGraphFixture()
    const service = new CausalGraphReadService({
      async readAtExactFrontier<T>(reader: Parameters<DarkForceTimeControl["readAtExactFrontier"]>[0]): Promise<T> {
        return await reader(held(4)) as T
      },
    }, async () => structuredClone(graph))
    const initial = snapshot(await service.read({contractVersion: 1, base: null}))

    const otherCut = snapshot(await service.read({
      contractVersion: 1,
      base: {
        ...initial.snapshot.identity,
        frontier: {...initial.snapshot.identity.frontier, cutId: "other-cut"},
      },
    }))
    expect(otherCut).toMatchObject({kind: "snapshot", reason: "resync"})

    const otherRoot = snapshot(await service.read({
      contractVersion: 1,
      base: {...initial.snapshot.identity, root: "example/other-root"},
    }))
    expect(otherRoot).toMatchObject({kind: "snapshot", reason: "resync"})
  })

  test("returns unknown without reading Graph when the causal baseline is unprovable", async () => {
    let graphReads = 0
    const service = new CausalGraphReadService({
      async readAtExactFrontier(): Promise<never> {
        throw new DarkForceCausalReadError(
          "baseline-unresolved",
          "sequence zero is not a proven baseline",
        )
      },
    }, async () => {
      graphReads++
      return createGraphFixture()
    })

    await expect(service.read({contractVersion: 1, base: null})).resolves.toEqual({
      contractVersion: 1,
      resolution: "unknown",
      kind: "unavailable",
      reason: "baseline-unresolved",
    })
    expect(graphReads).toBe(0)
  })

  test("rejects a changed Graph at the same causal frontier", async () => {
    let graph = createGraphFixture()
    const service = new CausalGraphReadService({
      async readAtExactFrontier<T>(reader: Parameters<DarkForceTimeControl["readAtExactFrontier"]>[0]): Promise<T> {
        return await reader(held(5)) as T
      },
    }, async () => structuredClone(graph))
    const initial = snapshot(await service.read({contractVersion: 1, base: null}))
    graph = structuredClone(graph)
    const root = graph.runtime.roots[0]
    if (root?.kind !== "atom") throw new Error("Graph root Atom is unavailable")
    root.values.count = 9

    await expect(service.read({
      contractVersion: 1,
      base: initial.snapshot.identity,
    })).rejects.toThrow("without advancing the causal Force frontier")
  })

  test("rejects an invented base shape before acquiring a causal hold", async () => {
    let holds = 0
    const service = new CausalGraphReadService({
      async readAtExactFrontier(): Promise<never> {
        holds++
        throw new Error("must not hold")
      },
    }, async () => createGraphFixture())

    await expect(service.read({
      contractVersion: 1,
      base: {root: "example/root", frontier: {cutId: "cut", throughSequence: 1}},
    })).rejects.toThrow("invalid_graph_identity")
    expect(holds).toBe(0)
  })
})
