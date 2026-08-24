import {describe, expect, test} from "bun:test"
import {
  NodeTree,
  NodeTreeRevisionConflictError,
  StaleNodeTreeProjectionError,
  type NodeTreeChange,
  type NodeTreeGenerationParameter,
  type NodeTreeGenerationView,
} from "./node-tree.ts"
import {Parameter} from "./parameter.ts"
import type {
  NodeTreeProjectionInput,
  NodeTreeProjector,
} from "./projection-types.ts"

type FieldPresentation = {fieldKind: string; label: string}
type RuntimeParameter = Parameter<number, FieldPresentation>
type RuntimeGeneration = NodeTreeGenerationView<
  RuntimeParameter,
  {label: string},
  {title: string},
  {socketType: string},
  {socketType: string}
>

const createTree = () => {
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
      nodes: [{id: "node", sockets: [
        {id: "out", direction: "output" as const},
        {id: "in", direction: "input" as const},
      ]}],
      links: [{
        id: "link",
        from: {nodeId: "node", socketId: "out"},
        to: {nodeId: "node", socketId: "in"},
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
    expect(() => new NodeTree({...definition, links: [{
      ...definition.links[0]!,
      from: {nodeId: "node", socketId: "in"},
    }]})).toThrow("Input Socket cannot be a Link source: link/node/in")
    expect(() => new NodeTree({...definition, links: [{
      ...definition.links[0]!,
      to: {nodeId: "node", socketId: "out"},
    }]})).toThrow("Output Socket cannot be a Link target: link/node/out")
  })
})

describe("live NodeTree topology", () => {
  test("exposes an ordered ID-addressed authoring document without runtime revisions", () => {
    const {tree, sourceValue} = createTree()
    const document = tree.document()

    expect(document.formatVersion).toBe(1)
    expect(document.frames.order).toEqual(["outer", "inner"])
    expect(document.nodes.order).toEqual(["source", "target"])
    expect(document.links.order).toEqual(["source-target"])
    expect(document.nodes.byId["source"]?.parameters.order).toEqual(["value"])
    expect(document.nodes.byId["source"]?.parameters.byId["value"]).toEqual({
      value: 1,
      presentation: {fieldKind: "number", label: "Value"},
    })
    expect(document.nodes.byId["source"]?.sockets.order).toEqual(["value-out"])
    expect(document.nodes.byId["source"]?.sockets.byId["value-out"]).toEqual({
      direction: "output",
      parameterId: "value",
      side: "right",
      metadata: {socketType: "float"},
    })
    expect(JSON.stringify(document)).not.toContain("revision")
    expect(JSON.stringify(document)).not.toContain("subscribe")
    expect(Object.isFrozen(document)).toBeTrue()
    expect(Object.isFrozen(document.nodes.order)).toBeTrue()
    expect(Object.isFrozen(document.nodes.byId)).toBeTrue()
    expect(Object.isFrozen(document.nodes.byId["source"]?.parameters.byId["value"])).toBeTrue()
    expect(JSON.parse(JSON.stringify(document))).toEqual(document)

    sourceValue.set(2)
    expect(tree.document().nodes.byId["source"]?.parameters.byId["value"]?.value).toBe(2)
  })

  test("atomically adds a Parameter while preserving existing identity and publishes one event", () => {
    const {tree, sourceValue} = createTree()
    const gain = new Parameter<number, FieldPresentation>("gain", 0.5, {
      fieldKind: "number",
      label: "Gain",
    })
    const changes: NodeTreeChange[] = []
    tree.subscribe((change) => changes.push(change))
    const current = tree.definition()

    const result = tree.reconcile({
      expectedRevision: 0,
      definition: {
        ...current,
        nodes: current.nodes.map((node) => node.id === "source" ? {
          ...node,
          parameters: [...(node.parameters ?? []), gain],
        } : node),
      },
    })

    expect(result).toEqual({changed: true, revision: 1, topologyRevision: 1})
    expect(tree.parameter("source", "value")).toBe(sourceValue)
    expect(tree.parameter("source", "gain")).toBe(gain)
    expect(tree.document().nodes.byId["source"]?.parameters.order).toEqual(["value", "gain"])
    expect(changes).toEqual([{kind: "topology", revision: 1, topologyRevision: 1}])

    gain.set(0.75)
    expect(tree.revision).toBe(2)
    expect(tree.topologyRevision).toBe(1)
    expect(changes[1]).toEqual({
      kind: "parameter",
      revision: 2,
      topologyRevision: 1,
      nodeId: "source",
      parameterId: "gain",
      parameterRevision: 1,
    })
  })

  test("atomically removes a Parameter with its Socket and Link and detaches observation", () => {
    const {tree, sourceValue, targetValue} = createTree()
    const current = tree.definition()

    const result = tree.reconcile({
      expectedRevision: 0,
      definition: {
        ...current,
        nodes: current.nodes.map((node) => node.id === "source" ? {
          ...node,
          parameters: [],
          sockets: [],
        } : node),
        links: [],
      },
    })

    expect(result).toEqual({changed: true, revision: 1, topologyRevision: 1})
    expect(() => tree.parameter("source", "value")).toThrow("Unknown Parameter: source/value")
    expect(tree.parameter("target", "value")).toBe(targetValue)
    sourceValue.set(9)
    expect(tree.revision).toBe(1)
  })

  test("rejects invalid final state, stale revisions and Parameter identity replacement without effects", () => {
    const {tree, sourceValue} = createTree()
    const beforeNodes = tree.nodes
    const current = tree.definition()
    const invalid = {
      ...current,
      nodes: current.nodes.map((node) => node.id === "source" ? {
        ...node,
        parameters: [],
      } : node),
    }

    expect(() => tree.reconcile({expectedRevision: 0, definition: invalid}))
      .toThrow("Unknown Socket Parameter: source/value-out/value")
    expect(tree.nodes).toBe(beforeNodes)
    expect(tree.revision).toBe(0)
    expect(tree.topologyRevision).toBe(0)

    const replacement = new Parameter<number, FieldPresentation>("value", 1, {
      fieldKind: "number",
      label: "Value",
    })
    expect(() => tree.reconcile({
      expectedRevision: 0,
      definition: {
        ...current,
        nodes: current.nodes.map((node) => node.id === "source" ? {
          ...node,
          parameters: [replacement],
        } : node),
      },
    })).toThrow("Parameter identity must be preserved: source/value")
    expect(tree.parameter("source", "value")).toBe(sourceValue)

    sourceValue.set(2)
    expect(() => tree.reconcile({expectedRevision: 0, definition: current}))
      .toThrow(NodeTreeRevisionConflictError)
    expect(tree.topologyRevision).toBe(0)
  })

  test("treats an equivalent final definition as a no-op without duplicating subscriptions", () => {
    const {tree, sourceValue} = createTree()
    const changes: NodeTreeChange[] = []
    tree.subscribe((change) => changes.push(change))

    expect(tree.reconcile({expectedRevision: 0, definition: tree.definition()})).toEqual({
      changed: false,
      revision: 0,
      topologyRevision: 0,
    })
    expect(changes).toEqual([])

    sourceValue.set(2)
    expect(tree.revision).toBe(1)
    expect(changes).toHaveLength(1)
  })

  test("rolls back newly prepared subscriptions when later preparation fails", () => {
    class FailingParameter extends Parameter<number, FieldPresentation> {
      override subscribe(): () => void {
        throw new Error("subscribe failed")
      }
    }
    const {tree} = createTree()
    const prepared = new Parameter<number, FieldPresentation>("prepared", 1, {
      fieldKind: "number",
      label: "Prepared",
    })
    const failing = new FailingParameter("failing", 1, {
      fieldKind: "number",
      label: "Failing",
    })
    const current = tree.definition()

    expect(() => tree.reconcile({
      expectedRevision: 0,
      definition: {
        ...current,
        nodes: current.nodes.map((node) => node.id === "source" ? {
          ...node,
          parameters: [...(node.parameters ?? []), prepared, failing],
        } : node),
      },
    })).toThrow("subscribe failed")
    expect(tree.revision).toBe(0)
    expect(() => tree.parameter("source", "prepared")).toThrow("Unknown Parameter")

    prepared.set(2)
    expect(tree.revision).toBe(0)
  })

  test("reports every listener failure only after the topology commit", () => {
    const {tree} = createTree()
    const gain = new Parameter<number, FieldPresentation>("gain", 1, {
      fieldKind: "number",
      label: "Gain",
    })
    const observed: NodeTreeChange[] = []
    tree.subscribe(() => { throw new Error("first listener failed") })
    tree.subscribe((change) => observed.push(change))
    const current = tree.definition()

    expect(() => tree.reconcile({
      expectedRevision: 0,
      definition: {
        ...current,
        nodes: current.nodes.map((node) => node.id === "source" ? {
          ...node,
          parameters: [...(node.parameters ?? []), gain],
        } : node),
      },
    })).toThrow(AggregateError)
    expect(tree.revision).toBe(1)
    expect(tree.topologyRevision).toBe(1)
    expect(tree.parameter("source", "gain")).toBe(gain)
    expect(observed).toEqual([{kind: "topology", revision: 1, topologyRevision: 1}])
  })

  test("queues reentrant changes until every listener observes the current revision", () => {
    const {tree, sourceValue} = createTree()
    const gain = new Parameter<number, FieldPresentation>("gain", 1, {
      fieldKind: "number",
      label: "Gain",
    })
    const order: string[] = []
    tree.subscribe((change) => {
      order.push(`first:${change.kind}:${change.revision}`)
      if (change.kind === "topology") sourceValue.set(2)
    })
    tree.subscribe((change) => {
      order.push(`second:${change.kind}:${change.revision}`)
      throw new Error(`listener failed: ${change.kind}`)
    })
    const current = tree.definition()

    expect(() => tree.reconcile({
      expectedRevision: 0,
      definition: {
        ...current,
        nodes: current.nodes.map((node) => node.id === "source" ? {
          ...node,
          parameters: [...(node.parameters ?? []), gain],
        } : node),
      },
    })).toThrow(AggregateError)

    expect(order).toEqual([
      "first:topology:1",
      "second:topology:1",
      "first:parameter:2",
      "second:parameter:2",
    ])
    expect(tree.revision).toBe(2)
    expect(tree.topologyRevision).toBe(1)
    expect(sourceValue.value).toBe(2)
  })

  test("retains failed unsubscribe handles and retries every cleanup during disposal", () => {
    class RetryingCleanupParameter extends Parameter<number, FieldPresentation> {
      cleanupAttempts = 0

      override subscribe(listener: () => void): () => void {
        const unsubscribe = super.subscribe(listener)
        return () => {
          this.cleanupAttempts += 1
          if (this.cleanupAttempts < 3) throw new Error(`cleanup failed: ${this.cleanupAttempts}`)
          unsubscribe()
        }
      }
    }
    class CountingCleanupParameter extends Parameter<number, FieldPresentation> {
      cleanupAttempts = 0

      override subscribe(listener: () => void): () => void {
        const unsubscribe = super.subscribe(listener)
        return () => {
          this.cleanupAttempts += 1
          unsubscribe()
        }
      }
    }
    const removed = new RetryingCleanupParameter("removed", 1, {
      fieldKind: "number",
      label: "Removed",
    })
    const retained = new CountingCleanupParameter("retained", 1, {
      fieldKind: "number",
      label: "Retained",
    })
    const tree = new NodeTree({nodes: [{id: "node", parameters: [removed, retained]}]})
    const current = tree.definition()

    expect(() => tree.reconcile({
      expectedRevision: 0,
      definition: {
        ...current,
        nodes: current.nodes.map((node) => ({...node, parameters: [retained]})),
      },
    })).toThrow(AggregateError)
    expect(removed.cleanupAttempts).toBe(1)
    expect(tree.revision).toBe(1)
    removed.set(2)
    expect(tree.revision).toBe(1)

    expect(() => tree.dispose()).toThrow(AggregateError)
    expect(retained.cleanupAttempts).toBe(1)
    expect(removed.cleanupAttempts).toBe(2)

    expect(() => tree.dispose()).not.toThrow()
    expect(retained.cleanupAttempts).toBe(1)
    expect(removed.cleanupAttempts).toBe(3)
    expect(() => tree.dispose()).not.toThrow()
    expect(removed.cleanupAttempts).toBe(3)
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
    const projector: NodeTreeProjector<RuntimeGeneration, Snapshot, Context, Projection> = {
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
    const projector: NodeTreeProjector<RuntimeGeneration, Snapshot, null, Projection> = {
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
    const unstable: NodeTreeProjector<RuntimeGeneration, Snapshot, null, Projection> = {
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
    let captured: NodeTreeGenerationParameter<RuntimeParameter> | undefined
    let capturedSnapshot: Snapshot["nodes"][number]["parameters"][number] | undefined
    const projector: NodeTreeProjector<RuntimeGeneration, Snapshot, null, string> = {
      async project(input) {
        captured = input.tree.parameter("source", "value")
        capturedSnapshot = input.snapshot.nodes[0]?.parameters[0]
        expect(input.tree.nodes[0]?.parameters[0]).toBe(captured)
        await new Promise<void>((resolve) => { release = resolve })
        return "old"
      },
    }

    const pending = tree.project(projector, {cacheKey: "desktop", context: null})
    await Promise.resolve()
    expect(captured).toMatchObject({id: "value", revision: 0, value: 1})
    expect(captured?.store).toBe(sourceValue)
    expect(capturedSnapshot).toMatchObject({id: "value", revision: 0, value: 1})
    expect(Object.isFrozen(captured)).toBeTrue()
    expect(Object.isFrozen(captured?.presentation)).toBeTrue()
    sourceValue.set(2)
    expect(captured?.value).toBe(1)
    expect(captured?.revision).toBe(0)
    expect(captured?.store.value).toBe(2)
    expect(capturedSnapshot?.value).toBe(1)
    release?.()

    await expect(pending).rejects.toBeInstanceOf(StaleNodeTreeProjectionError)
    await expect(tree.project({project: () => "fresh"}, {cacheKey: "desktop", context: null}))
      .resolves.toBe("fresh")
  })

  test("keeps an in-flight projector on its captured topology generation", async () => {
    const {tree} = createTree()
    type Snapshot = ReturnType<typeof tree.snapshot>
    let release: (() => void) | undefined
    let captured: RuntimeGeneration | undefined
    const projector: NodeTreeProjector<RuntimeGeneration, Snapshot, null, readonly string[]> = {
      async project(input) {
        captured = input.tree
        await new Promise<void>((resolve) => { release = resolve })
        return input.tree.nodes.map(({id}) => id)
      },
    }

    const pending = tree.project(projector, {cacheKey: "topology", context: null})
    await Promise.resolve()
    const current = tree.definition()
    tree.reconcile({
      expectedRevision: 0,
      definition: {
        ...current,
        nodes: [...current.nodes, {id: "late", metadata: {title: "Late"}}],
      },
    })

    expect(captured?.nodes.map(({id}) => id)).toEqual(["source", "target"])
    expect(tree.nodes.map(({id}) => id)).toEqual(["source", "target", "late"])
    release?.()
    await expect(pending).rejects.toBeInstanceOf(StaleNodeTreeProjectionError)
    expect(captured?.nodes.map(({id}) => id)).toEqual(["source", "target"])
  })

  test("exposes a captured generation and immutable snapshot to a generic metadata adapter", async () => {
    const {tree} = createTree()
    type Snapshot = ReturnType<typeof tree.snapshot>
    const inputs: NodeTreeProjectionInput<RuntimeGeneration, Snapshot, Readonly<{theme: string}>, string>[] = []
    const projector: NodeTreeProjector<RuntimeGeneration, Snapshot, Readonly<{theme: string}>, string> = {
      project(input) {
        inputs.push(input)
        const title = input.snapshot.nodes[0]?.metadata?.["title"]
        const fieldKind = input.tree.parameter("source", "value").presentation["fieldKind"]
        return `${input.context.theme}:${String(title)}:${String(fieldKind)}`
      },
    }

    expect(await tree.project(projector, {cacheKey: "blender-dark", context: {theme: "dark"}}))
      .toBe("dark:Source:number")
    expect(inputs[0]?.tree).not.toBe(tree)
    expect(Object.isFrozen(inputs[0]?.tree)).toBeTrue()
    expect(Object.isFrozen(inputs[0]?.snapshot)).toBeTrue()
  })
})
