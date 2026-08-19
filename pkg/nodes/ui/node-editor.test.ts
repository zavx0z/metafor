import {describe, expect, test} from "bun:test"
import {
  NodeCanvas,
  NodeEditor,
  fitNodeEditorTransform,
  nodeEditorRegions,
  planNodeEditorPaintSteps,
  planNodeEditorViewport,
  validatePositionedNodeTree,
  type Link,
  type Frame,
  type Node,
  type PositionedNodeTree,
  type Socket,
} from "./node-editor.ts"

type TestNode = Node & Readonly<{title: string}>
type TestSocket = Socket & Readonly<{socketType: string}>
type TestLink = Link & Readonly<{label: string}>
type TestFrame = Frame & Readonly<{label: string}>

const tree: PositionedNodeTree<TestNode, TestSocket, TestLink, TestFrame> = {
  bounds: {x: 0, y: 0, w: 460, h: 280},
  frames: [{frame: {id: "frame", label: "Frame"}, rect: {x: 0, y: 0, w: 460, h: 280}}],
  nodes: [
    {
      node: {id: "source", frameId: "frame", title: "Source"},
      rect: {x: 40, y: 70, w: 140, h: 100},
      sockets: [{
        socket: {id: "value", direction: "output", socketType: "float"},
        side: "right",
        center: {x: 180, y: 120},
      }],
    },
    {
      node: {id: "target", frameId: "frame", title: "Target"},
      rect: {x: 280, y: 80, w: 140, h: 100},
      sockets: [{
        socket: {id: "value", direction: "input", socketType: "float"},
        side: "left",
        center: {x: 280, y: 130},
      }],
    },
  ],
  links: [{
    link: {
      id: "value-link",
      label: "Value",
      from: {nodeId: "source", socketId: "value"},
      to: {nodeId: "target", socketId: "value"},
    },
    points: [{x: 180, y: 120}, {x: 230, y: 120}, {x: 230, y: 130}, {x: 280, y: 130}],
  }],
}

describe("generic Blender-like Node Editor contracts", () => {
  test("publishes exact read-only Canvas and interactive Editor component names", () => {
    const renderers = {
      frame: {renderBackground() {}, renderForeground() {}},
      node: {renderBackground() {}, renderForeground() {}},
      socket: {render() {}},
      link: {render() {}},
    }
    const canvas = new NodeCanvas<TestNode, TestSocket, TestLink, TestFrame>({renderers})
    const editor = new NodeEditor<TestNode, TestSocket, TestLink, TestFrame>({renderers})
    expect(canvas.node.name).toBe("NodeCanvas")
    expect(editor.node.name).toBe("NodeEditor")
    editor.setTree(tree)
    expect(editor.select({kind: "frame", id: "frame"})).toBeTrue()
    expect(editor.selection).toEqual({kind: "frame", id: "frame"})
  })

  test("validates exact sockets and links without Card vocabulary", () => {
    expect(() => validatePositionedNodeTree(tree)).not.toThrow()
    expect(() => validatePositionedNodeTree({
      ...tree,
      nodes: tree.nodes.map((entry) => entry.node.id === "target" ? {
        ...entry,
        sockets: entry.sockets.map((socket) => ({...socket, center: {x: 300, y: 130}})),
      } : entry),
    })).toThrow("Socket is detached")
  })

  test("validates first-class nested Frames instead of container Nodes", () => {
    expect(() => validatePositionedNodeTree({
      ...tree,
      frames: [
        ...tree.frames,
        {frame: {id: "nested", parentFrameId: "frame", label: "Nested"}, rect: {x: 20, y: 20, w: 200, h: 200}},
      ],
    })).not.toThrow()
    expect(() => validatePositionedNodeTree({
      ...tree,
      frames: [
        {frame: {id: "a", parentFrameId: "b"}, rect: tree.bounds},
        {frame: {id: "b", parentFrameId: "a"}, rect: tree.bounds},
      ],
    })).toThrow("Cyclic Frame ancestry")
    expect(() => validatePositionedNodeTree({
      ...tree,
      nodes: tree.nodes.map((entry) => entry.node.id === "source" ? {
        ...entry,
        node: {...entry.node, frameId: "missing"},
      } : entry),
    })).toThrow("Unknown Node Frame")
  })

  test("places Frame backgrounds below Links and Frame labels before Nodes", () => {
    expect(planNodeEditorPaintSteps(tree.frames, tree.frames, tree.nodes)).toEqual([
      {kind: "frame-background", frameId: "frame"},
      {kind: "links"},
      {kind: "frame-foreground", frameId: "frame"},
      {kind: "node", nodeId: "source"},
      {kind: "node", nodeId: "target"},
    ])
  })

  test("fits, transforms and culls a typed positioned NodeTree", () => {
    const transform = fitNodeEditorTransform(tree, {x: 0, y: 0, w: 920, h: 560}, 40)
    const plan = planNodeEditorViewport(tree, transform, {x: 0, y: 0, w: 920, h: 560})
    expect(transform.scale).toBeGreaterThan(1)
    expect(plan.frames).toHaveLength(1)
    expect(plan.nodes).toHaveLength(2)
    expect(plan.links).toHaveLength(1)
    expect(plan.nodes.find(({node}) => node.id === "source")?.node.title).toBe("Source")
    expect(plan.links[0]?.link.label).toBe("Value")
    expect(plan.nodes.find(({node}) => node.id === "source")?.sockets[0]?.socket.socketType).toBe("float")
  })

  test("plans toolbar and content through the shared Flexbox system", () => {
    expect(nodeEditorRegions(800, 600, true)).toEqual({
      toolbar: {x: 0, y: 0, w: 800, h: 38},
      content: {x: 0, y: 38, w: 800, h: 562},
    })
    expect(nodeEditorRegions(800, 600, false)).toEqual({
      toolbar: {x: 0, y: 0, w: 800, h: 0},
      content: {x: 0, y: 0, w: 800, h: 600},
    })
  })
})
