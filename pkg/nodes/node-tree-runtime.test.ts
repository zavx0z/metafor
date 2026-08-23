import {describe, expect, test} from "bun:test"
import {NodeTree, StaleNodeTreeProjectionError} from "./node-tree.ts"
import {Parameter} from "./parameter.ts"
import type {
  NodeTreeProjectionInput,
  NodeTreeProjector,
} from "./projection-types.ts"

const createTree = () => {
  type FieldPresentation = {fieldKind: string; label: string}
  const sourceValue = new Parameter<number, FieldPresentation>("value", 1, {fieldKind: "number", label: "Value"})
  const targetValue = new Parameter<number, FieldPresentation>("value", 0, {fieldKind: "number", label: "Value"})
  const frameMetadata = {label: "Math"}
  const nodes = [
    {
      id: "source",
      frameId: "inner",
      parameters: [sourceValue],
      sockets: [{
        id: "value-out",
        direction: "output" as const,
        parameterId: "value",
        side: "right" as const,
        metadata: {socketType: "float"},
      }],
      metadata: {title: "Source"},
    },
    {
      id: "target",
      frameId: "outer",
      parameters: [targetValue],
      sockets: [{
        id: "value-in",
        direction: "input" as const,
        parameterId: "value",
        side: "left" as const,
        metadata: {socketType: "float"},
      }],
      metadata: {title: "Target"},
    },
  ]
  const links = [{
    id: "source-target",
    from: {nodeId: "source", socketId: "value-out"},
    to: {nodeId: "target", socketId: "value-in"},
    metadata: {socketType: "float"},
  }]
  const tree = new NodeTree({
    frames: [
      {id: "outer", metadata: frameMetadata},
      {id: "inner", parentFrameId: "outer", metadata: {label: "Nested"}},
    ],
    nodes,
    links,
  })
  return {tree, sourceValue, targetValue, frameMetadata, nodes, links}
}

describe("live NodeTree runtime", () => {
  test("owns immutable topology while retaining exact Parameter entities", () => {
    const {tree, sourceValue, frameMetadata, nodes, links} = createTree()
    frameMetadata.label = "Changed outside"
    nodes[0]!.metadata.title = "Changed outside"
    links[0]!.from.nodeId = "changed"
    nodes.push({
      id: "late",
      frameId: "outer",
      parameters: [sourceValue],
      sockets: [],
      metadata: {title: "Late"},
    })

    expect(tree.frames).toHaveLength(2)
    expect(tree.nodes).toHaveLength(2)
    expect(tree.links).toHaveLength(1)
    expect(tree.frames[0]?.metadata).toEqual({label: "Math"})
    expect(tree.nodes[0]?.metadata).toEqual({title: "Source"})
    expect(tree.links[0]?.from.nodeId).toBe("source")
    expect(tree.parameter("source", "value")).toBe(sourceValue)
    expect(Object.isFrozen(tree.frames)).toBeTrue()
    expect(Object.isFrozen(tree.nodes)).toBeTrue()
    expect(Object.isFrozen(tree.nodes[0]?.sockets)).toBeTrue()
    expect(Object.isFrozen(tree.links)).toBeTrue()
  })

  test("propagates Parameter changes into one tree revision and JSON snapshot", () => {
    const {tree, sourceValue} = createTree()
    const changes: unknown[] = []
    const unsubscribe = tree.subscribe((change) => changes.push(change))

    expect(tree.revision).toBe(0)
    expect(tree.topologyRevision).toBe(0)
    expect(sourceValue.set(1)).toBeFalse()
    expect(tree.revision).toBe(0)

    expect(sourceValue.set(2)).toBeTrue()
    expect(tree.revision).toBe(1)
    expect(changes).toEqual([{
      kind: "parameter",
      revision: 1,
      topologyRevision: 0,
      nodeId: "source",
      parameterId: "value",
      parameterRevision: 1,
    }])

    const snapshot = tree.snapshot()
    expect(snapshot.nodes[0]?.parameters[0]?.value).toBe(2)
    expect(snapshot.nodes[0]?.parameters[0]?.presentation).toEqual({fieldKind: "number", label: "Value"})
    expect(Object.isFrozen(snapshot)).toBeTrue()
    expect(Object.isFrozen(snapshot.nodes)).toBeTrue()
    expect(Object.isFrozen(snapshot.nodes[0]?.parameters)).toBeTrue()
    expect(JSON.parse(JSON.stringify(tree))).toEqual(snapshot)

    unsubscribe()
    sourceValue.set(3)
    expect(changes).toHaveLength(1)
  })

  test("stops observing Parameters after explicit disposal", () => {
    const {tree, sourceValue} = createTree()
    tree.dispose()
    sourceValue.set(9)
    expect(tree.revision).toBe(0)
  })

  test("advances tree revision even when an earlier Parameter subscriber throws", () => {
    const source = new Parameter<number>("value", 1)
    source.subscribe(() => { throw new Error("consumer failed") })
    const tree = new NodeTree({nodes: [{id: "node", parameters: [source]}]})

    expect(() => source.set(2)).toThrow(AggregateError)
    expect(tree.revision).toBe(1)
    expect(tree.snapshot().nodes[0]?.parameters[0]?.value).toBe(2)
  })

  test("validates Frame and Node identity and ancestry", () => {
    expect(() => new NodeTree({frames: [{id: "f"}, {id: "f"}], nodes: []}))
      .toThrow("Duplicate Frame id: f")
    expect(() => new NodeTree({frames: [{id: "f", parentFrameId: "missing"}], nodes: []}))
      .toThrow("Unknown parent Frame: f/missing")
    expect(() => new NodeTree({
      frames: [{id: "a", parentFrameId: "b"}, {id: "b", parentFrameId: "a"}],
      nodes: [],
    })).toThrow("Cyclic Frame ancestry")
    expect(() => new NodeTree({frames: [{id: "same"}], nodes: [{id: "same"}]}))
      .toThrow("Frame and Node ids must be distinct: same")
    expect(() => new NodeTree({nodes: [{id: "node", frameId: "missing"}]}))
      .toThrow("Unknown Node Frame: node/missing")
    expect(() => new NodeTree({nodes: [{id: "node"}, {id: "node"}]}))
      .toThrow("Duplicate Node id: node")
  })

  test("validates Parameter ownership and exact Socket references", () => {
    const parameter = new Parameter("value", 1)
    expect(() => new NodeTree({nodes: [{id: "node", parameters: [parameter, parameter]}]}))
      .toThrow("Duplicate Parameter id: node/value")
    expect(() => new NodeTree({
      nodes: [{id: "a", parameters: [parameter]}, {id: "b", parameters: [parameter]}],
    })).toThrow("Parameter is shared by multiple Nodes: value")
    expect(() => new NodeTree({nodes: [{
      id: "node",
      parameters: [parameter],
      sockets: [{id: "socket", direction: "input", parameterId: "missing"}],
    }]})).toThrow("Unknown Socket Parameter: node/socket/missing")
    expect(() => new NodeTree({nodes: [{
      id: "node",
      parameters: [parameter],
      sockets: [
        {id: "left-a", direction: "input", parameterId: "value", side: "left"},
        {id: "left-b", direction: "output", parameterId: "value", side: "left"},
      ],
    }]})).toThrow("Duplicate Parameter Socket side: node/value:left")
    expect(() => new NodeTree({nodes: [{
      id: "node",
      sockets: [{id: "socket", direction: "invalid" as never}],
    }]})).toThrow("Invalid Socket direction: node/socket")
  })

  test("validates Link identities and exact endpoint Nodes and Sockets", () => {
    const definition = {
      nodes: [{id: "node", sockets: [{id: "out", direction: "output" as const}]}],
      links: [{
        id: "link",
        from: {nodeId: "node", socketId: "out"},
        to: {nodeId: "node", socketId: "out"},
      }],
    }
    expect(() => new NodeTree(definition)).not.toThrow()
    expect(() => new NodeTree({...definition, links: [...definition.links, definition.links[0]!]}))
      .toThrow("Duplicate Link id: link")
    expect(() => new NodeTree({...definition, links: [{
      ...definition.links[0]!,
      to: {nodeId: "missing", socketId: "out"},
    }]})).toThrow("Unknown Link Node: link/missing")
    expect(() => new NodeTree({...definition, links: [{
      ...definition.links[0]!,
      to: {nodeId: "node", socketId: "missing"},
    }]})).toThrow("Unknown Link Socket: link/node/missing")
  })
})

describe("NodeTree projection facade", () => {
  test("caches per projector and context while passing a value-only prior projection", async () => {
    const {tree, sourceValue} = createTree()
    type Snapshot = ReturnType<typeof tree.snapshot>
    type Context = Readonly<{viewport: string}>
    type Projection = Readonly<{call: number; value: unknown; viewport: string}>
    const previous: Array<Projection | undefined> = []
    let calls = 0
    const projector: NodeTreeProjector<typeof tree, Snapshot, Context, Projection> = {
      project(input) {
        calls += 1
        previous.push(input.previous?.projection)
        return Object.freeze({
          call: calls,
          value: input.snapshot.nodes[0]?.parameters[0]?.value,
          viewport: input.context.viewport,
        })
      },
    }

    const first = await tree.project(projector, {cacheKey: "desktop", context: {viewport: "wide"}})
    const cached = await tree.project(projector, {cacheKey: "desktop", context: {viewport: "ignored-by-cache"}})
    expect(cached).toBe(first)
    expect(calls).toBe(1)

    sourceValue.set(2)
    const second = await tree.project(projector, {cacheKey: "desktop", context: {viewport: "wide"}})
    expect(second).not.toBe(first)
    expect(second.value).toBe(2)
    expect(previous).toEqual([undefined, first])
    expect(calls).toBe(2)

    const mobile = await tree.project(projector, {cacheKey: "mobile", context: {viewport: "narrow"}})
    expect(mobile.viewport).toBe("narrow")
    expect(previous.at(-1)).toBeUndefined()
    expect(calls).toBe(3)
  })

  test("deduplicates concurrent work and does not cache a rejection", async () => {
    const {tree} = createTree()
    type Snapshot = ReturnType<typeof tree.snapshot>
    type Projection = Readonly<{ready: true}>
    let release: (() => void) | undefined
    let calls = 0
    const projector: NodeTreeProjector<typeof tree, Snapshot, null, Projection> = {
      async project() {
        calls += 1
        await new Promise<void>((resolve) => { release = resolve })
        return {ready: true}
      },
    }

    const first = tree.project(projector, {cacheKey: "same", context: null})
    const second = tree.project(projector, {cacheKey: "same", context: null})
    expect(second).toBe(first)
    await Promise.resolve()
    expect(calls).toBe(1)
    release?.()
    expect(await first).toEqual({ready: true})

    let attempts = 0
    const unstable: NodeTreeProjector<typeof tree, Snapshot, null, Projection> = {
      project() {
        attempts += 1
        if (attempts === 1) throw new Error("projection failed")
        return {ready: true}
      },
    }
    await expect(tree.project(unstable, {cacheKey: "retry", context: null})).rejects.toThrow("projection failed")
    await expect(tree.project(unstable, {cacheKey: "retry", context: null})).resolves.toEqual({ready: true})
    expect(attempts).toBe(2)
  })

  test("rejects an asynchronous result from an older Parameter revision", async () => {
    const {tree, sourceValue} = createTree()
    type Snapshot = ReturnType<typeof tree.snapshot>
    let release: (() => void) | undefined
    const projector: NodeTreeProjector<typeof tree, Snapshot, null, string> = {
      async project() {
        await new Promise<void>((resolve) => { release = resolve })
        return "old"
      },
    }

    const pending = tree.project(projector, {cacheKey: "desktop", context: null})
    await Promise.resolve()
    sourceValue.set(2)
    release?.()

    await expect(pending).rejects.toBeInstanceOf(StaleNodeTreeProjectionError)
    await expect(tree.project({project: () => "fresh"}, {cacheKey: "desktop", context: null}))
      .resolves.toBe("fresh")
  })

  test("exposes live tree and immutable snapshot to a generic metadata adapter", async () => {
    const {tree} = createTree()
    type Snapshot = ReturnType<typeof tree.snapshot>
    const inputs: NodeTreeProjectionInput<typeof tree, Snapshot, Readonly<{theme: string}>, string>[] = []
    const projector: NodeTreeProjector<typeof tree, Snapshot, Readonly<{theme: string}>, string> = {
      project(input) {
        inputs.push(input)
        const title = input.snapshot.nodes[0]?.metadata?.["title"]
        const fieldKind = input.tree.parameter("source", "value").presentation["fieldKind"]
        return `${input.context.theme}:${String(title)}:${String(fieldKind)}`
      },
    }

    expect(await tree.project(projector, {cacheKey: "blender-dark", context: {theme: "dark"}}))
      .toBe("dark:Source:number")
    expect(inputs[0]?.tree).toBe(tree)
    expect(Object.isFrozen(inputs[0]?.snapshot)).toBeTrue()
  })
})
