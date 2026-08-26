import {describe, expect, test} from "bun:test"
import {
  validateGraph,
  validateGraphDelta,
  type Graph,
  type GraphDelta,
  type RuntimeAtom,
  type RuntimeNode,
  type RuntimeTopology,
} from "@metafor/types/metafor/graph"
import {
  GraphDeltaError,
  applyGraphDelta,
  diffGraph,
  graphDigest,
} from "../../dark/graph/delta.ts"
import {
  GRAPH_FIXTURE_CHILD,
  GRAPH_FIXTURE_ROOT,
  createGraphFixture,
  insertSameMetaSibling,
} from "./fixture.ts"

const digest = (digit: string): `sha256:${string}` =>
  `sha256:${digit.repeat(64)}`

const runtimeRoot = (graph: Graph): RuntimeAtom => {
  const root = graph.runtime.roots[0]
  if (root?.kind !== "atom") throw new Error("Graph delta fixture root Atom is unavailable")
  return root
}

const assertValid = (graph: Graph): Graph => {
  const validation = validateGraph(graph)
  if (!validation.ok) {
    throw new Error(validation.issues.map(({path, code}) => `${path}:${code}`).join(", "))
  }
  return graph
}

const applyExact = (base: Graph, result: Graph): GraphDelta => {
  const before = structuredClone(base)
  const delta = diffGraph(base, result)
  expect(validateGraphDelta(delta)).toEqual({ok: true, value: delta})
  expect(applyGraphDelta(base, delta)).toEqual(result)
  expect(base).toEqual(before)
  expect(graphDigest(result)).toBe(delta.resultDigest)
  return delta
}

const repeatedChild = (
  ref: `atom:${number}`,
  declaration: `#/${string}`,
  name: string,
): RuntimeAtom => ({
  ref,
  kind: "atom",
  declaration,
  meta: GRAPH_FIXTURE_CHILD,
  state: "present",
  values: {name},
  mass: [],
})

const machoGraph = (twoParents = false): Graph => {
  const graph = createGraphFixture()
  const template = graph.template[GRAPH_FIXTURE_ROOT]!
  template.fields.push({key: "items", type: "array", required: true, default: []})
  template.matter = [{
    kind: "macho",
    collectionBinding: {data: "items"},
    children: [{edgeSlot: "child", particle: {kind: "wimp", src: GRAPH_FIXTURE_CHILD}}],
  }]
  if (twoParents) template.matter.push(structuredClone(template.matter[0]!))

  const root = runtimeRoot(graph)
  root.values.items = [1, 2]
  const firstDeclaration = "#/template/example~1graph-root/matter/0/children/0/particle" as const
  const first: RuntimeTopology = {
    ref: "topology:10",
    kind: "topology",
    declaration: "#/template/example~1graph-root/matter/0",
    topology: "macho",
    children: [
      repeatedChild("atom:2", firstDeclaration, "первый"),
      repeatedChild("atom:3", firstDeclaration, "второй"),
    ],
  }
  root.children = [first]
  if (twoParents) {
    root.children.push({
      ref: "topology:11",
      kind: "topology",
      declaration: "#/template/example~1graph-root/matter/1",
      topology: "macho",
      children: [],
    })
  }
  return assertValid(graph)
}

const expectDeltaError = (
  action: () => unknown,
  code: string,
): void => {
  try {
    action()
    throw new Error(`Expected GraphDeltaError ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(GraphDeltaError)
    expect((error as GraphDeltaError).code).toBe(code)
  }
}

describe("ref-based GraphDelta", () => {
  test("round-trips an unchanged Graph with deterministic digests", () => {
    const graph = createGraphFixture()
    const delta = applyExact(graph, structuredClone(graph))

    expect(delta.changes).toEqual([])
    expect(delta.baseDigest).toBe(delta.resultDigest)
    expect(delta.baseDigest).toBe(graphDigest(structuredClone(graph)))
  })

  test("replaces one template by MetaAddress without a JSON Pointer target", () => {
    const base = createGraphFixture()
    const result = structuredClone(base)
    result.template[GRAPH_FIXTURE_ROOT]!.name = "Переименованный Graph"

    const delta = applyExact(base, result)

    expect(delta.changes).toEqual([expect.objectContaining({
      op: "replace",
      target: {kind: "template", ref: GRAPH_FIXTURE_ROOT},
    })])
    expect(JSON.stringify(delta.changes)).not.toContain('"path"')
  })

  test("replaces only the owning Atom head for Field and lazy Mass metadata", () => {
    const base = createGraphFixture()
    const fieldResult = structuredClone(base)
    runtimeRoot(fieldResult).values.count = 2
    const fieldDelta = applyExact(base, fieldResult)

    expect(fieldDelta.changes).toEqual([expect.objectContaining({
      op: "replace",
      target: {kind: "runtime-node", ref: "atom:1"},
    })])

    const massResult = structuredClone(fieldResult)
    runtimeRoot(massResult).mass[0]!.label = "Новая история"
    const massDelta = applyExact(fieldResult, massResult)

    expect(massDelta.changes).toEqual([expect.objectContaining({
      op: "replace",
      target: {kind: "runtime-node", ref: "atom:1"},
      value: expect.objectContaining({
        mass: [expect.objectContaining({ref: "mass:graph-history", content: "lazy"})],
      }),
    })])
  })

  test("updates State and the exact active Reaction relation by their refs", () => {
    const base = createGraphFixture()
    const result = structuredClone(base)
    runtimeRoot(result).state = "running"
    result.runtime.reactions[0]!.active = false

    const delta = applyExact(base, result)

    expect(delta.changes).toEqual([
      expect.objectContaining({
        op: "replace",
        target: {kind: "runtime-node", ref: "atom:1"},
      }),
      expect.objectContaining({
        op: "replace",
        target: {kind: "reaction-relation", ref: "reaction:remember:1:2"},
      }),
    ])
  })

  test("adds and removes flat Reaction relations without positional targets", () => {
    const base = createGraphFixture()
    const added = structuredClone(base)
    added.runtime.reactions.push({
      ...structuredClone(added.runtime.reactions[0]!),
      ref: "reaction:remember:1:3",
      source: {atom: "atom:3", states: ["present"]},
    })
    const addDelta = applyExact(base, assertValid(added))

    expect(addDelta.changes).toContainEqual(expect.objectContaining({
      op: "add",
      target: {kind: "reaction-relation", ref: "reaction:remember:1:3"},
    }))
    expect(addDelta.changes).toContainEqual({
      op: "replace",
      target: {kind: "reaction-order"},
      value: ["reaction:remember:1:2", "reaction:remember:1:3"],
    })

    const removed = structuredClone(added)
    removed.runtime.reactions.shift()
    const removeDelta = applyExact(added, assertValid(removed))
    expect(removeDelta.changes).toContainEqual({
      op: "remove",
      target: {kind: "reaction-relation", ref: "reaction:remember:1:2"},
    })
  })

  test("reorders repeated children with one children.replace by stable refs", () => {
    const base = machoGraph()
    const result = structuredClone(base)
    const topology = runtimeRoot(result).children?.[0]
    if (topology?.kind !== "topology" || !topology.children) {
      throw new Error("Macho topology fixture is unavailable")
    }
    topology.children.reverse()
    const delta = applyExact(base, assertValid(result))

    expect(delta.changes).toEqual([{
      op: "replace",
      target: {kind: "children", parent: "topology:10"},
      value: ["atom:3", "atom:2"],
    }])
  })

  test("moves one Atom between parents without addressing either nested array", () => {
    const base = machoGraph(true)
    const result = structuredClone(base)
    const [left, right] = runtimeRoot(result).children ?? []
    if (left?.kind !== "topology" || right?.kind !== "topology" || !left.children || !right.children) {
      throw new Error("Two-parent Macho fixture is unavailable")
    }
    const moved = left.children.pop()
    if (moved?.kind !== "atom") throw new Error("Movable Atom is unavailable")
    moved.declaration = "#/template/example~1graph-root/matter/1/children/0/particle"
    right.children.push(moved)
    const delta = applyExact(base, assertValid(result))

    expect(delta.changes).toContainEqual(expect.objectContaining({
      op: "replace",
      target: {kind: "runtime-node", ref: "atom:3"},
    }))
    expect(delta.changes).toContainEqual({
      op: "replace",
      target: {kind: "children", parent: "topology:10"},
      value: ["atom:2"],
    })
    expect(delta.changes).toContainEqual({
      op: "replace",
      target: {kind: "children", parent: "topology:11"},
      value: ["atom:3"],
    })
    expect(JSON.stringify(delta.changes)).not.toContain("/runtime/")
  })

  test("removes one runtime occurrence explicitly and repairs its parent list", () => {
    const base = createGraphFixture()
    const result = structuredClone(base)
    result.template[GRAPH_FIXTURE_ROOT]!.matter!.pop()
    runtimeRoot(result).children!.pop()
    const delta = applyExact(base, assertValid(result))

    expect(delta.changes).toContainEqual({
      op: "remove",
      target: {kind: "runtime-node", ref: "atom:3"},
    })
    expect(delta.changes).toContainEqual({
      op: "replace",
      target: {kind: "children", parent: "atom:1"},
      value: ["atom:2"],
    })
  })

  test("adds an occurrence and applies independently from wire change order", () => {
    const base = createGraphFixture()
    const result = assertValid(insertSameMetaSibling(base))
    const delta = diffGraph(base, result)

    expect(delta.changes).toContainEqual(expect.objectContaining({
      op: "add",
      target: {kind: "runtime-node", ref: "atom:4"},
    }))
    expect(applyGraphDelta(base, {
      ...delta,
      changes: delta.changes.toReversed(),
    })).toEqual(result)
  })

  test("rejects JSON Pointer targets and raw runtime IDs structurally", () => {
    const base = createGraphFixture()
    const delta = diffGraph(base, base)
    const pathTarget = {
      ...delta,
      changes: [{op: "replace", path: "/runtime/roots/0", value: {state: "running"}}],
    }
    const pathValidation = validateGraphDelta(pathTarget)
    expect(pathValidation.ok).toBe(false)
    if (!pathValidation.ok) {
      expect(pathValidation.issues).toContainEqual(expect.objectContaining({
        path: "/changes/0/path",
        code: "unknown_property",
      }))
    }

    const rawId = {
      ...delta,
      changes: [{op: "replace", target: {kind: "children", parent: 1}, value: []}],
    }
    const rawValidation = validateGraphDelta(rawId)
    expect(rawValidation.ok).toBe(false)
    if (!rawValidation.ok) {
      expect(rawValidation.issues).toContainEqual(expect.objectContaining({
        path: "/changes/0/target/parent",
        code: "invalid_ref",
      }))
    }
  })

  test("fails atomically on dangling refs and containment cycles", () => {
    const base = createGraphFixture()
    const before = structuredClone(base)
    const identity = diffGraph(base, base)
    const dangling: GraphDelta = {
      ...identity,
      changes: [{
        op: "replace",
        target: {kind: "children", parent: "atom:1"},
        value: ["atom:999"],
      }],
    }
    expectDeltaError(() => applyGraphDelta(base, dangling), "dangling_child")
    expect(base).toEqual(before)

    const cycle: GraphDelta = {
      ...identity,
      changes: [{
        op: "replace",
        target: {kind: "children", parent: "atom:2"},
        value: ["atom:1"],
      }],
    }
    expectDeltaError(() => applyGraphDelta(base, cycle), "runtime_cycle")
    expect(base).toEqual(before)
  })

  test("rejects stale base and corrupted result digests without mutation", () => {
    const base = createGraphFixture()
    const result = structuredClone(base)
    runtimeRoot(result).values.count = 1
    const delta = diffGraph(base, result)
    const before = structuredClone(base)

    expectDeltaError(
      () => applyGraphDelta(base, {...delta, baseDigest: digest("0")}),
      "base_digest_mismatch",
    )
    expectDeltaError(
      () => applyGraphDelta(base, {...delta, resultDigest: digest("f")}),
      "result_digest_mismatch",
    )
    expect(base).toEqual(before)
  })
})
