import {describe, expect, test} from "bun:test"
import {applyJsonPatch} from "@nodes/core/json-patch"
import {
  NodeTree,
  NodeTreeRevisionConflictError,
  type NodeTreeChange,
} from "@nodes/core/node-tree"
import {Parameter, type NodeJsonValue} from "@nodes/core/parameter"
import {
  NodeTreeEditor,
  NodeTreeEditorCommittedError,
  NodeTreeEditorError,
} from "./node-tree-editor.ts"

const parameter = (id: string, value: NodeJsonValue) =>
  new Parameter<NodeJsonValue, NodeJsonValue>(id, value, {label: id})

function createTree(withLink = false) {
  const gain = parameter("gain", 1)
  const output = parameter("value", 2)
  const input = parameter("value", 0)
  const tree = new NodeTree({
    nodes: [
      {
        id: "source/~",
        parameters: [gain, output],
        sockets: [{id: "out", direction: "output" as const, parameterId: "value"}],
        metadata: {title: "Source"},
      },
      {
        id: "target",
        parameters: [input],
        sockets: [{id: "in", direction: "input" as const, parameterId: "value"}],
        metadata: {title: "Target"},
      },
    ],
    links: withLink ? [{
      id: "value-link",
      from: {nodeId: "source/~", socketId: "out"},
      to: {nodeId: "target", socketId: "in"},
    }] : [],
  })
  return {tree, gain, output, input, editor: new NodeTreeEditor(tree)}
}

describe("headless NodeTreeEditor", () => {
  test("accepts a NodeTree with specialized JSON metadata without adapting its Stores", () => {
    type Presentation = {label: string; field: {kind: string}}
    const value = new Parameter<NodeJsonValue, Presentation>("value", 1, {
      label: "Value",
      field: {kind: "number"},
    })
    const tree = new NodeTree<
      Parameter<NodeJsonValue, Presentation>,
      {label: string},
      {title: string},
      {socketType: string},
      {label: string}
    >({
      frames: [{id: "frame", metadata: {label: "Frame"}}],
      nodes: [{id: "node", frameId: "frame", parameters: [value], metadata: {title: "Node"}}],
    })

    const editor = new NodeTreeEditor(tree)
    expect(editor.tree).toBe(tree)
    expect(editor.tree.parameter("node", "value")).toBe(value)
  })

  test("adds and removes a Parameter through reversible JSON Patch and one reconcile", () => {
    const {tree, editor, gain, output} = createTree()
    const before = tree.document()
    const changes: NodeTreeChange[] = []
    tree.subscribe((change) => changes.push(change))

    const added = editor.addParameter({
      expectedRevision: 0,
      nodeId: "source/~",
      parameter: {id: "extra/~", value: 3, presentation: {label: "Extra"}},
    })

    expect(added.result).toEqual({changed: true, revision: 1, topologyRevision: 1})
    expect(added.forward).toEqual([
      {
        op: "add",
        path: "/nodes/byId/source~1~0/parameters/byId/extra~1~0",
        value: {value: 3, presentation: {label: "Extra"}},
      },
      {op: "add", path: "/nodes/byId/source~1~0/parameters/order/-", value: "extra/~"},
    ])
    expect(applyJsonPatch(before, added.forward)).toEqual(tree.document())
    expect(applyJsonPatch(tree.document(), added.inverse)).toEqual(before)
    expect(tree.parameter("source/~", "gain")).toBe(gain)
    expect(tree.parameter("source/~", "value")).toBe(output)
    expect(tree.parameter("source/~", "extra/~")).toBeInstanceOf(Parameter)
    expect(changes).toEqual([{kind: "topology", revision: 1, topologyRevision: 1}])

    const removedStore = tree.parameter("source/~", "extra/~")
    const removed = editor.removeParameter({
      expectedRevision: 1,
      nodeId: "source/~",
      parameterId: "extra/~",
    })
    expect(removed.result).toEqual({changed: true, revision: 2, topologyRevision: 2})
    const restoredDocument = applyJsonPatch(tree.document(), removed.inverse)
    expect(restoredDocument).toEqual(applyJsonPatch(before, added.forward))
    expect(() => tree.parameter("source/~", "extra/~")).toThrow("Unknown Parameter")
    expect(changes).toEqual([
      {kind: "topology", revision: 1, topologyRevision: 1},
      {kind: "topology", revision: 2, topologyRevision: 2},
    ])
    removedStore.set(9)
    expect(tree.revision).toBe(2)
    expect(tree.parameter("source/~", "gain")).toBe(gain)
  })

  test("strictly rejects removal of a Parameter referenced by a Socket", () => {
    const {tree, editor} = createTree()
    const before = tree.document()

    expect(() => editor.removeParameter({
      expectedRevision: 0,
      nodeId: "source/~",
      parameterId: "value",
    })).toThrow(NodeTreeEditorError)
    try {
      editor.removeParameter({expectedRevision: 0, nodeId: "source/~", parameterId: "value"})
    } catch (error) {
      expect(error).toMatchObject({code: "parameter-referenced"})
    }
    expect(tree.document()).toEqual(before)
    expect(tree.revision).toBe(0)
  })

  test("treats inherited byId names as missing and reports the exact editor error", () => {
    const {editor} = createTree()

    try {
      editor.removeParameter({
        expectedRevision: 0,
        nodeId: "toString",
        parameterId: "value",
      })
      throw new Error("Expected inherited byId lookup to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(NodeTreeEditorError)
      expect(error).toMatchObject({code: "unknown-node", message: "Unknown Node: toString"})
    }
  })

  test("connects and disconnects exact Sockets while core owns direction validation", () => {
    const {tree, editor} = createTree()
    const before = tree.document()
    const connected = editor.connect({
      expectedRevision: 0,
      link: {
        id: "value-link",
        from: {nodeId: "source/~", socketId: "out"},
        to: {nodeId: "target", socketId: "in"},
      },
    })
    expect(tree.links.map(({id}) => id)).toEqual(["value-link"])
    expect(applyJsonPatch(before, connected.forward)).toEqual(tree.document())

    const connectedDocument = tree.document()
    expect(() => editor.connect({
      expectedRevision: 1,
      link: {
        id: "reverse",
        from: {nodeId: "target", socketId: "in"},
        to: {nodeId: "source/~", socketId: "out"},
      },
    })).toThrow("Input Socket cannot be a Link source")
    expect(tree.document()).toEqual(connectedDocument)
    expect(tree.revision).toBe(1)

    const disconnected = editor.disconnect({expectedRevision: 1, linkId: "value-link"})
    expect(tree.links).toEqual([])
    expect(applyJsonPatch(tree.document(), disconnected.inverse)).toEqual(connectedDocument)
  })

  test("uses the distinct duplicate-link error code", () => {
    const {editor} = createTree(true)

    try {
      editor.connect({
        expectedRevision: 0,
        link: {
          id: "value-link",
          from: {nodeId: "source/~", socketId: "out"},
          to: {nodeId: "target", socketId: "in"},
        },
      })
      throw new Error("Expected duplicate Link to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(NodeTreeEditorError)
      expect(error).toMatchObject({code: "duplicate-link"})
    }
  })

  test("requires explicit Link disconnection when removing a Node", () => {
    const {tree, editor} = createTree(true)
    const before = tree.document()
    expect(() => editor.removeNode({expectedRevision: 0, nodeId: "source/~"}))
      .toThrow("disconnectLinks: true")
    expect(tree.document()).toEqual(before)

    const removed = editor.removeNode({
      expectedRevision: 0,
      nodeId: "source/~",
      disconnectLinks: true,
    })
    expect(tree.nodes.map(({id}) => id)).toEqual(["target"])
    expect(tree.links).toEqual([])
    expect(removed.forward.filter(({path}) => path.startsWith("/links/"))).toHaveLength(2)
    expect(applyJsonPatch(tree.document(), removed.inverse)).toEqual(before)
    expect(removed.result).toEqual({changed: true, revision: 1, topologyRevision: 1})
  })

  test("adds a complete Node with canonical Parameter stores", () => {
    const {tree, editor} = createTree()
    const added = editor.addNode({
      expectedRevision: 0,
      node: {
        id: "math",
        parameters: [{id: "factor", value: 0.5, presentation: {label: "Factor"}}],
        sockets: [{id: "factor-in", direction: "input", parameterId: "factor"}],
        metadata: {title: "Math"},
      },
    })
    expect(tree.nodes.map(({id}) => id)).toEqual(["source/~", "target", "math"])
    expect(tree.parameter("math", "factor")).toBeInstanceOf(Parameter)
    expect(added.result.topologyRevision).toBe(1)
  })

  test("sets one Parameter value without a duplicate Store or layout invalidation", () => {
    const {tree, editor, gain} = createTree()
    const before = tree.document()
    const changes: NodeTreeChange[] = []
    tree.subscribe((change) => changes.push(change))

    const changed = editor.setParameterValue({
      expectedRevision: 0,
      nodeId: "source/~",
      parameterId: "gain",
      value: 4,
    })
    expect(tree.parameter("source/~", "gain")).toBe(gain)
    expect(gain.value).toBe(4)
    expect(changed.result).toEqual({changed: true, revision: 1, topologyRevision: 0})
    expect(applyJsonPatch(before, changed.forward)).toEqual(tree.document())
    expect(applyJsonPatch(tree.document(), changed.inverse)).toEqual(before)
    expect(changes).toEqual([{
      kind: "parameter",
      revision: 1,
      topologyRevision: 0,
      nodeId: "source/~",
      parameterId: "gain",
      parameterRevision: 1,
    }])

    const noOp = editor.setParameterValue({
      expectedRevision: 1,
      nodeId: "source/~",
      parameterId: "gain",
      value: 4,
    })
    expect(noOp).toEqual({
      forward: [],
      inverse: [],
      result: {changed: false, revision: 1, topologyRevision: 0},
    })
  })

  test("preserves structural transaction evidence when a listener fails after reconcile", () => {
    const {tree, editor} = createTree()
    const before = tree.document()
    tree.subscribe((change) => {
      if (change.kind === "topology") throw new Error("topology observer failed")
    })

    try {
      editor.addParameter({
        expectedRevision: 0,
        nodeId: "source/~",
        parameter: {id: "committed", value: 7, presentation: {label: "Committed"}},
      })
      throw new Error("Expected committed listener failure")
    } catch (error) {
      expect(error).toBeInstanceOf(NodeTreeEditorCommittedError)
      const committed = error as NodeTreeEditorCommittedError
      expect(committed.transaction.result).toEqual({changed: true, revision: 1, topologyRevision: 1})
      expect(applyJsonPatch(before, committed.transaction.forward)).toEqual(tree.document())
      expect(applyJsonPatch(tree.document(), committed.transaction.inverse)).toEqual(before)
      expect(committed.cause).toBeInstanceOf(AggregateError)
    }
    expect(tree.parameter("source/~", "committed").value).toBe(7)
  })

  test("preserves value transaction evidence when a listener fails after Parameter.set", () => {
    const {tree, editor, gain} = createTree()
    const before = tree.document()
    tree.subscribe((change) => {
      if (change.kind === "parameter") throw new Error("parameter observer failed")
    })

    try {
      editor.setParameterValue({
        expectedRevision: 0,
        nodeId: "source/~",
        parameterId: "gain",
        value: 8,
      })
      throw new Error("Expected committed listener failure")
    } catch (error) {
      expect(error).toBeInstanceOf(NodeTreeEditorCommittedError)
      const committed = error as NodeTreeEditorCommittedError
      expect(committed.transaction.result).toEqual({changed: true, revision: 1, topologyRevision: 0})
      expect(applyJsonPatch(before, committed.transaction.forward)).toEqual(tree.document())
      expect(applyJsonPatch(tree.document(), committed.transaction.inverse)).toEqual(before)
      expect(committed.cause).toBeInstanceOf(AggregateError)
    }
    expect(gain.value).toBe(8)
    expect(tree.parameter("source/~", "gain")).toBe(gain)
  })

  test("preserves the exact structural transaction when a failing listener performs another change", () => {
    const {tree, editor, gain} = createTree()
    tree.subscribe((change) => {
      if (change.kind !== "topology") return
      gain.set(9)
      throw new Error("observer changed a Parameter")
    })

    try {
      editor.addParameter({
        expectedRevision: 0,
        nodeId: "source/~",
        parameter: {id: "committed", value: 7, presentation: {label: "Committed"}},
      })
      throw new Error("Expected committed listener failure")
    } catch (error) {
      expect(error).toBeInstanceOf(NodeTreeEditorCommittedError)
      expect((error as NodeTreeEditorCommittedError).transaction.result).toEqual({
        changed: true,
        revision: 1,
        topologyRevision: 1,
      })
    }
    expect(tree.revision).toBe(2)
    expect(tree.topologyRevision).toBe(1)
    expect(gain.value).toBe(9)
    expect(tree.parameter("source/~", "committed").value).toBe(7)
  })

  test("preserves the exact value transaction when a failing listener changes the value again", () => {
    const {tree, editor, gain} = createTree()
    let reentered = false
    tree.subscribe((change) => {
      if (change.kind !== "parameter" || reentered) return
      reentered = true
      gain.set(9)
      throw new Error("observer replaced the value")
    })

    try {
      editor.setParameterValue({
        expectedRevision: 0,
        nodeId: "source/~",
        parameterId: "gain",
        value: 8,
      })
      throw new Error("Expected committed listener failure")
    } catch (error) {
      expect(error).toBeInstanceOf(NodeTreeEditorCommittedError)
      expect((error as NodeTreeEditorCommittedError).transaction.result).toEqual({
        changed: true,
        revision: 1,
        topologyRevision: 0,
      })
    }
    expect(tree.revision).toBe(2)
    expect(gain.value).toBe(9)
  })

  test("rejects stale commands before building or applying their patch", () => {
    const {tree, editor, gain} = createTree()
    gain.set(2)
    const before = tree.document()

    expect(() => editor.addParameter({
      expectedRevision: 0,
      nodeId: "source/~",
      parameter: {id: "late", value: 1},
    })).toThrow(NodeTreeRevisionConflictError)
    expect(tree.document()).toEqual(before)
    expect(tree.revision).toBe(1)
  })

  test("tracks exact projection revisions and geometry-sensitive external Parameter events", () => {
    const {tree, gain, output} = createTree()
    const editor = new NodeTreeEditor(tree, {
      parameterAffectsLayout: ({parameterId}) => parameterId === "value",
    })
    expect(editor.layoutDirty).toBeTrue()
    expect(editor.markLayoutApplied({revision: 0, topologyRevision: 0})).toBeTrue()
    expect(editor.layoutDirty).toBeFalse()

    gain.set(2)
    expect(editor.layoutDirty).toBeFalse()
    expect(editor.markLayoutApplied({revision: 0, topologyRevision: 0})).toBeFalse()
    expect(editor.markLayoutApplied({revision: 1, topologyRevision: 0})).toBeTrue()

    output.set(3)
    expect(editor.layoutDirty).toBeTrue()
    expect(editor.markLayoutApplied({revision: 1, topologyRevision: 0})).toBeFalse()
    expect(editor.markLayoutApplied({revision: 2, topologyRevision: 0})).toBeTrue()
    expect(editor.layoutDirty).toBeFalse()

    editor.addParameter({
      expectedRevision: 2,
      nodeId: "source/~",
      parameter: {id: "extra", value: 0, presentation: {label: "extra"}},
    })
    expect(editor.layoutDirty).toBeTrue()
    expect(editor.markLayoutApplied({revision: 3, topologyRevision: 0})).toBeFalse()
    expect(editor.layoutDirty).toBeTrue()
    expect(editor.markLayoutApplied({
      revision: tree.revision,
      topologyRevision: tree.topologyRevision,
    })).toBeTrue()
    expect(editor.layoutDirty).toBeFalse()
  })
})
