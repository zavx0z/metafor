import {readFile} from "node:fs/promises"
import {join} from "node:path"
import {describe, expect, test} from "bun:test"
import {
  validateGraph,
  type DocumentPointer,
  type Graph,
  type RuntimeAtom,
  type RuntimeNode,
} from "@metafor/types/metafor/graph"
import type {NodeTreeChange} from "@nodes/core/node-tree"
import {createGraphFixture} from "../../quantum/tests/graph/fixture.ts"
import {
  createGraphNodeTree,
  GraphNodeTreeValidationError,
  reconcileGraphNodeTree,
  type GraphNodeTree,
} from "./graph.ts"

describe("@metafor/node-tree package boundary", () => {
  test("exports only the exact graph entry and imports no renderer or runtime domain", async () => {
    const manifest = JSON.parse(await readFile(join(import.meta.dir, "package.json"), "utf8")) as {
      exports?: Record<string, unknown>
      dependencies?: Record<string, string>
    }
    const source = await readFile(join(import.meta.dir, "graph.ts"), "utf8")
    const imports = [...source.matchAll(/from\s+"([^"]+)"/gu)].map((match) => match[1])

    expect(manifest.exports).toEqual({
      "./graph": {
        types: "./graph.ts",
        default: "./graph.ts",
      },
    })
    expect(manifest.dependencies).toEqual({
      "@metafor/types": "workspace:*",
      "@nodes/core": "link:@nodes/core",
    })
    expect(imports).toEqual([
      "@metafor/types/metafor/graph",
      "@nodes/core/node-tree",
      "@nodes/core/parameter",
    ])
  })
})

describe("public Graph to generic NodeTree", () => {
  test("projects every declaration and runtime entity without creating a WIMP per Atom", () => {
    const graph = topologyFixture()
    expect(validateGraph(graph).ok).toBeTrue()
    const tree = createGraphNodeTree(graph)

    expect(nodesOfKind(tree, "wimp-template")).toHaveLength(2)
    expect(nodesOfKind(tree, "atom")).toHaveLength(3)
    expect(nodesOfKind(tree, "topology")).toHaveLength(1)
    expect(nodesOfKind(tree, "state").length).toBeGreaterThanOrEqual(3)
    expect(nodesOfKind(tree, "transition")).toHaveLength(1)
    expect(nodesOfKind(tree, "process")).toHaveLength(1)
    expect(nodesOfKind(tree, "reaction")).toHaveLength(1)
    expect(nodesOfKind(tree, "matter")).toHaveLength(1)

    const childTemplate = nodesOfKind(tree, "wimp-template")
      .find((node) => node.metadata?.meta === "example/graph-child")
    expect(childTemplate).toBeDefined()
    const childInstances = tree.links.filter((link) =>
      link.metadata?.kind === "instance" && link.from.nodeId === childTemplate!.id)
    expect(childInstances.map((link) => link.to.nodeId).sort()).toEqual(["atom:2", "atom:3"])

    const rootTemplate = nodesOfKind(tree, "wimp-template")
      .find((node) => node.metadata?.meta === "example/graph-root")!
    expect(rootTemplate.parameters?.map((parameter) => parameter.id)).toEqual([
      "template",
      "field:mode",
      "field:count",
      "mass:history",
    ])
    expect(rootTemplate.parameters?.[0]?.presentation).toMatchObject({
      label: "Template",
      field: {kind: "readonly", readOnly: true},
    })
    expect(rootTemplate.sockets).toContainEqual(expect.objectContaining({
      id: "field-read:mode",
      direction: "output",
      parameterId: "field:mode",
      metadata: expect.objectContaining({kind: "field-read"}),
    }))
    expect(rootTemplate.sockets).toContainEqual(expect.objectContaining({
      id: "mass-write:history",
      direction: "input",
      parameterId: "mass:history",
      metadata: expect.objectContaining({kind: "mass-write"}),
    }))
    expect(typeof rootTemplate.parameters?.[0]?.value).toBe("string")
    expect(tree.nodes.flatMap((node) => node.sockets ?? [])
      .every((socket) => socket.metadata?.socketType === "custom")).toBeTrue()
    expect(tree.links.every((link) => link.metadata?.socketType === "custom")).toBeTrue()
    const transition = nodesOfKind(tree, "transition")[0]!
    expect(transition.parameters?.map((parameter) => parameter.id)).toEqual([
      "transition",
      "condition:mode",
    ])
    expect(transition.sockets).toContainEqual(expect.objectContaining({
      id: "condition:mode",
      direction: "input",
      parameterId: "condition:mode",
      metadata: expect.objectContaining({kind: "condition"}),
    }))
    expect(tree.links).toContainEqual(expect.objectContaining({
      id: "link-condition:example%2Fgraph-root/idle/running/mode",
      from: {nodeId: rootTemplate.id, socketId: "field-read:mode"},
      to: {nodeId: transition.id, socketId: "condition:mode"},
      metadata: expect.objectContaining({kind: "condition"}),
    }))
    expect(tree.links).toContainEqual(expect.objectContaining({
      id: "link-reaction-mass-write:example%2Fgraph-root/remember/history",
      from: {
        nodeId: "reaction-template:example%2Fgraph-root/remember",
        socketId: "reaction-mass-write:history",
      },
      to: {nodeId: rootTemplate.id, socketId: "mass-write:history"},
      metadata: expect.objectContaining({kind: "reaction-mass-write"}),
    }))

    const matter = nodesOfKind(tree, "matter")[0]!
    expect(jsonValue(matter.parameters?.[0]?.value)).toHaveLength(2)
    expect(tree.links).toContainEqual(expect.objectContaining({
      metadata: expect.objectContaining({kind: "matter-target", occurrences: 2}),
    }))

    expect(jsonValue(tree.parameter("atom:1", "runtime-mass:mass%3Agraph-history").value)).toMatchObject({
      ref: "mass:graph-history",
      key: "history",
      content: "lazy",
    })
    expect(tree.links).toContainEqual(expect.objectContaining({
      id: "reaction:remember:1:2",
      from: {nodeId: "atom:2", socketId: "state"},
      to: {nodeId: "atom:1", socketId: "reaction:remember"},
      metadata: expect.objectContaining({
        kind: "reaction-relation",
        relation: "reaction:remember:1:2",
      }),
    }))
    expect(jsonValue(tree.parameter(
      "atom:1",
      "runtime-reaction:reaction%3Aremember%3A1%3A2",
    ).value)).toMatchObject({
      ref: "reaction:remember:1:2",
      source: {atom: "atom:2", states: ["present"]},
      target: {atom: "atom:1", states: ["idle"]},
      active: true,
    })

    const topologyFrame = tree.frames.find((frame) => frame.id === "frame-runtime:topology%3A4")!
    const nestedAtomFrame = tree.frames.find((frame) => frame.id === "frame-runtime:atom%3A3")!
    expect(nestedAtomFrame.parentFrameId).toBe(topologyFrame.id)
    tree.dispose()
  })

  test("updates values without topology reconcile and preserves exact Parameter identity", () => {
    const graph = topologyFixture()
    const tree = createGraphNodeTree(graph)
    const count = tree.parameter("atom:1", "field:count")
    const childName = tree.parameter("atom:2", "field:name")
    const topologyRevision = tree.topologyRevision
    const changes: NodeTreeChange[] = []
    const unsubscribe = tree.subscribe((change) => { changes.push(change) })
    const next = structuredClone(graph) as Graph
    const root = next.runtime.roots[0] as RuntimeAtom
    root.values.count = 2
    runtimeAtom(next.runtime.roots, "atom:2").values.name = "обновлённый"

    const result = reconcileGraphNodeTree(tree, next)

    expect(result).toMatchObject({
      changed: true,
      parameterChanges: 2,
      topologyChanged: false,
      topologyRevision,
    })
    expect(tree.parameter("atom:1", "field:count")).toBe(count)
    expect(tree.parameter("atom:2", "field:name")).toBe(childName)
    expect(jsonValue(count.value)).toEqual({present: true, value: 2})
    expect(jsonValue(childName.value)).toEqual({present: true, value: "обновлённый"})
    expect(changes).toHaveLength(2)
    expect(changes.every(({kind}) => kind === "parameter")).toBeTrue()
    unsubscribe()
    tree.dispose()
  })

  test("keeps Parameter identity when authored labels change under stable semantic keys", () => {
    const graph = topologyFixture()
    const tree = createGraphNodeTree(graph)
    const field = tree.parameter("template:example%2Fgraph-root", "field:count")
    const mass = tree.parameter("template:example%2Fgraph-root", "mass:history")
    const next = structuredClone(graph) as Graph
    next.template[next.root]!.fields.find(({key}) => key === "count")!.label = "Счётчик"
    next.template[next.root]!.mass.find(({key}) => key === "history")!.label = "Журнал"

    const result = reconcileGraphNodeTree(tree, next)

    expect(result).toMatchObject({parameterChanges: 2, topologyChanged: false})
    expect(tree.parameter("template:example%2Fgraph-root", "field:count")).toBe(field)
    expect(tree.parameter("template:example%2Fgraph-root", "mass:history")).toBe(mass)
    expect(jsonValue(field.value)).toMatchObject({key: "count", label: "Счётчик"})
    expect(jsonValue(mass.value)).toMatchObject({key: "history", label: "Журнал"})
    tree.dispose()
  })

  test("updates Reaction activity with target State without changing Link topology", () => {
    const graph = topologyFixture()
    const tree = createGraphNodeTree(graph)
    const relation = tree.parameter("atom:1", "runtime-reaction:reaction%3Aremember%3A1%3A2")
    const link = tree.links.find(({id}) => id === "reaction:remember:1:2")
    const topologyRevision = tree.topologyRevision
    const next = structuredClone(graph) as Graph
    const root = next.runtime.roots[0]
    if (root?.kind !== "atom") throw new Error("Topology fixture root Atom is absent")
    root.state = "running"
    next.runtime.reactions[0]!.active = false

    const result = reconcileGraphNodeTree(tree, next)

    expect(result).toMatchObject({parameterChanges: 2, topologyChanged: false, topologyRevision})
    expect(tree.parameter("atom:1", "runtime-reaction:reaction%3Aremember%3A1%3A2")).toBe(relation)
    expect(tree.links.find(({id}) => id === "reaction:remember:1:2")).toBe(link)
    expect(jsonValue(relation.value)).toMatchObject({active: false})
    tree.dispose()
  })

  test("commits one structural reconcile and retains surviving Parameters", () => {
    const graph = topologyFixture()
    const tree = createGraphNodeTree(graph)
    const count = tree.parameter("atom:1", "field:count")
    const topologyRevision = tree.topologyRevision
    const changes: NodeTreeChange[] = []
    const unsubscribe = tree.subscribe((change) => { changes.push(change) })
    const next = structuredClone(graph) as Graph
    next.runtime.reactions.push({
      ref: "reaction:remember:1:3",
      kind: "reaction",
      reaction: {meta: next.root, key: "remember"},
      source: {atom: "atom:3", states: ["present"]},
      target: {atom: "atom:1", states: ["idle"]},
      active: true,
    })

    const result = reconcileGraphNodeTree(tree, next)

    expect(result).toMatchObject({
      changed: true,
      parameterChanges: 0,
      topologyChanged: true,
      topologyRevision: topologyRevision + 1,
    })
    expect(tree.parameter("atom:1", "field:count")).toBe(count)
    expect(tree.links.some(({id}) => id === "reaction:remember:1:3")).toBeTrue()
    expect(changes).toEqual([{kind: "topology", revision: 1, topologyRevision: 1}])
    unsubscribe()
    tree.dispose()
  })

  test("keeps one stable Matter Node while its complete ordered declaration changes", () => {
    const graph = topologyFixture()
    const tree = createGraphNodeTree(graph)
    const matterNode = nodesOfKind(tree, "matter")[0]!
    const particles = tree.parameter(matterNode.id, "particles")
    const next = structuredClone(graph) as Graph
    const root = next.template[next.root]!
    const first = root.matter?.[0]
    if (first?.kind !== "wimp") throw new Error("Topology fixture lost the first WIMP Matter particle")
    first.fieldsBinding = {data: "count"}

    const result = reconcileGraphNodeTree(tree, next)

    expect(result.topologyChanged).toBeFalse()
    expect(nodesOfKind(tree, "matter")[0]).toBe(matterNode)
    expect(tree.parameter(matterNode.id, "particles")).toBe(particles)
    expect((jsonValue(particles.value) as unknown[])[0]).toMatchObject({
      kind: "wimp",
      fieldsBinding: {data: "count"},
    })
    tree.dispose()
  })

  test("makes sibling order visible and reconciles one ref-preserving reorder", () => {
    const graph = topologyFixture()
    const tree = createGraphNodeTree(graph)
    const atomName = tree.parameter("atom:2", "field:name")
    const changes: NodeTreeChange[] = []
    const unsubscribe = tree.subscribe((change) => { changes.push(change) })
    const next = swapRootMatter(graph)

    const result = reconcileGraphNodeTree(tree, next)

    expect(result.topologyChanged).toBeTrue()
    expect(result.parameterChanges).toBe(4)
    expect(tree.parameter("atom:2", "field:name")).toBe(atomName)
    expect(tree.frames.find(({id}) => id === "frame-runtime:topology%3A4")?.metadata?.order).toBe(0)
    expect(tree.frames.find(({id}) => id === "frame-runtime:atom%3A2")?.metadata?.order).toBe(1)
    expect(changes.filter(({kind}) => kind === "topology")).toHaveLength(1)
    unsubscribe()
    tree.dispose()
  })

  test("rejects an invalid next Graph without changing the derived NodeTree", () => {
    const graph = topologyFixture()
    const tree = createGraphNodeTree(graph)
    const before = tree.snapshot()
    const next = structuredClone(graph) as Graph
    next.runtime.reactions[0]!.target.atom = "atom:999"

    expect(() => reconcileGraphNodeTree(tree, next)).toThrow(GraphNodeTreeValidationError)
    expect(tree.snapshot()).toEqual(before)
    tree.dispose()
  })
})

function nodesOfKind(tree: GraphNodeTree, kind: string) {
  return tree.nodes.filter((node) => node.metadata?.kind === kind)
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") throw new Error("Graph projection value must be JSON text")
  return JSON.parse(value)
}

function runtimeAtom(nodes: readonly RuntimeNode[], ref: string): RuntimeAtom {
  for (const node of nodes) {
    if (node.kind === "atom" && node.ref === ref) return node
    const nested = runtimeAtomOrNull(node.children ?? [], ref)
    if (nested !== null) return nested
  }
  throw new Error(`Unknown fixture Atom: ${ref}`)
}

function runtimeAtomOrNull(nodes: readonly RuntimeNode[], ref: string): RuntimeAtom | null {
  for (const node of nodes) {
    if (node.kind === "atom" && node.ref === ref) return node
    const nested = runtimeAtomOrNull(node.children ?? [], ref)
    if (nested !== null) return nested
  }
  return null
}

function topologyFixture(): Graph {
  const graph = structuredClone(createGraphFixture()) as Graph
  const rootTemplate = graph.template[graph.root]!
  const root = graph.runtime.roots[0]
  if (root === undefined || root.kind !== "atom" || rootTemplate.matter === undefined || root.children === undefined) {
    throw new Error("Base Graph fixture is missing root Matter")
  }
  const secondMatter = rootTemplate.matter[1]
  const secondAtom = root.children[1]
  if (secondMatter?.kind !== "wimp" || secondAtom?.kind !== "atom") {
    throw new Error("Base Graph fixture is missing its second WIMP occurrence")
  }
  rootTemplate.matter[1] = {
    kind: "axion",
    predicateBinding: "mode",
    children: [{edgeSlot: "then", particle: secondMatter}],
  }
  secondAtom.declaration = "#/template/example~1graph-root/matter/1/children/0/particle" as DocumentPointer
  root.children[1] = {
    ref: "topology:4",
    kind: "topology",
    declaration: "#/template/example~1graph-root/matter/1" as DocumentPointer,
    topology: "axion",
    children: [secondAtom],
  }
  return graph
}

function swapRootMatter(input: Graph): Graph {
  const graph = structuredClone(input) as Graph
  const rootTemplate = graph.template[graph.root]!
  const root = graph.runtime.roots[0]
  if (root === undefined || root.kind !== "atom" || rootTemplate.matter === undefined || root.children === undefined) {
    throw new Error("Topology fixture is missing root Matter")
  }
  const direct = rootTemplate.matter[0]!
  const axion = rootTemplate.matter[1]!
  const directAtom = root.children[0]
  const topology = root.children[1]
  if (directAtom?.kind !== "atom" || topology?.kind !== "topology" || topology.children?.[0]?.kind !== "atom") {
    throw new Error("Topology fixture has unexpected runtime children")
  }
  rootTemplate.matter = [axion, direct]
  topology.declaration = "#/template/example~1graph-root/matter/0" as DocumentPointer
  topology.children[0].declaration = "#/template/example~1graph-root/matter/0/children/0/particle" as DocumentPointer
  directAtom.declaration = "#/template/example~1graph-root/matter/1" as DocumentPointer
  root.children = [topology, directAtom]
  return graph
}
