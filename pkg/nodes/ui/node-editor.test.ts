import {describe, expect, test} from "bun:test"
import {TrueTypeFont} from "@metafor/engine"
import {
  createBlenderNodeRenderers,
  measureBlenderNode,
  positionBlenderNode,
  type BlenderFrame,
  type BlenderLink,
  type BlenderNode,
  type BlenderSocket,
} from "./blender-node.ts"
import {
  NodeCanvas,
  NodeEditor,
  fitNodeEditorTransform,
  nodeEditorRegions,
  orderNodeEditorLinksForPaint,
  planNodeEditorGrid,
  planNodeEditorLinkHitRects,
  planNodeEditorPinchTransform,
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
  test("reports the current flat layout/materialization baseline separately from transform-only frames", async () => {
    const node: BlenderNode = {
      id: "diagnostic-node",
      title: "Diagnostic",
      parameters: [{
        id: "value",
        label: "Value",
        field: {id: "value", label: "Value", kind: "number", value: 0.5},
      }],
      sockets: [{
        id: "value",
        label: "Value",
        direction: "input",
        socketType: "float",
        parameterId: "value",
        side: "left",
      }],
    }
    const measured = measureBlenderNode(node)
    const rect = {x: 20, y: 20, w: 220, h: measured.height}
    const diagnosticTree: PositionedNodeTree<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame> = {
      bounds: rect,
      frames: [],
      nodes: [positionBlenderNode(node, rect)],
      links: [],
    }
    const canvas = new NodeCanvas({renderers: createBlenderNodeRenderers(), toolbar: false})
    const initial = canvas.diagnostics
    expect(initial).toEqual({localLayoutPlans: 0, materializations: 0, transformOnlyFrames: 0})
    expect(Object.isFrozen(initial)).toBeTrue()

    canvas.setTree(diagnosticTree)
    const fontBytes = await Bun.file(new URL("../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
    canvas.setRect({x: 0, y: 0, w: 640, h: 360}, 0.001, new TrueTypeFont(fontBytes))
    expect(canvas.diagnostics).toEqual({
      localLayoutPlans: 3,
      materializations: 1,
      transformOnlyFrames: 0,
    })

    expect(canvas.setCanvasTransform({x: 40, y: 30, scale: 0.75})).toBeTrue()
    canvas.flushPendingRender()
    expect(canvas.diagnostics).toEqual({
      localLayoutPlans: 6,
      materializations: 2,
      transformOnlyFrames: 0,
    })
    expect(initial).toEqual({localLayoutPlans: 0, materializations: 0, transformOnlyFrames: 0})
    canvas.dispose()
  })

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
    expect(editor.select({kind: "link", id: "value-link"})).toBeTrue()
    expect(editor.selection).toEqual({kind: "link", id: "value-link"})
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

  test("allows one Parameter row to own distinct left and right Sockets", () => {
    const parameterTree: PositionedNodeTree = {
      bounds: tree.bounds,
      frames: tree.frames,
      nodes: [{
        node: {id: "parameter-node", frameId: "frame", parameters: [{id: "value"}]},
        rect: {x: 100, y: 80, w: 200, h: 100},
        sockets: [
          {socket: {id: "value-left", parameterId: "value", direction: "input"}, side: "left", center: {x: 100, y: 130}},
          {socket: {id: "value-right", parameterId: "value", direction: "input"}, side: "right", center: {x: 300, y: 130}},
        ],
      }],
      links: [],
    }
    expect(() => validatePositionedNodeTree(parameterTree)).not.toThrow()
    expect(() => validatePositionedNodeTree({
      ...parameterTree,
      nodes: parameterTree.nodes.map((entry) => ({
        ...entry,
        sockets: [...entry.sockets, {
          socket: {id: "value-left-duplicate", parameterId: "value", direction: "output" as const},
          side: "left" as const,
          center: {x: 100, y: 150},
        }],
      })),
    })).toThrow("Duplicate Parameter Socket side")
    expect(() => validatePositionedNodeTree({
      ...parameterTree,
      nodes: parameterTree.nodes.map((entry) => ({
        ...entry,
        sockets: entry.sockets.map((socket) => ({...socket, socket: {...socket.socket, parameterId: "missing"}})),
      })),
    })).toThrow("Unknown Socket Parameter")
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

  test("paints selected orthogonal Links last and plans bounded hit corridors", () => {
    const second = {...tree.links[0]!, link: {...tree.links[0]!.link, id: "second-link"}}
    const links = [tree.links[0]!, second]
    expect(orderNodeEditorLinksForPaint(links, {kind: "link", id: "value-link"}).map(({link}) => link.id)).toEqual([
      "second-link",
      "value-link",
    ])
    expect(planNodeEditorLinkHitRects(tree.links[0]!.points, 6)).toEqual([
      {x: 174, y: 114, w: 62, h: 12},
      {x: 224, y: 114, w: 12, h: 22},
      {x: 224, y: 124, w: 62, h: 12},
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
    const grid = planNodeEditorGrid({x: 0, y: 0, w: 390, h: 844}, {x: 7, y: 11, scale: 0.5})
    expect(grid.length).toBeGreaterThan(0)
    expect(grid.length).toBeLessThanOrEqual(5000)
    expect(grid.every(({x, y}) => x >= 0 && x <= 390 && y >= 0 && y <= 844)).toBeTrue()
    expect(grid.some(({major}) => major)).toBeTrue()
  })

  test("keeps the touched world point stable during mobile pinch zoom", () => {
    const transformed = planNodeEditorPinchTransform(
      {x: 10, y: 20, scale: 1},
      [{id: 1, x: 100, y: 100}, {id: 2, x: 200, y: 100}],
      [{id: 1, x: 50, y: 120}, {id: 2, x: 250, y: 120}],
      0.4,
      3,
    )
    expect(transformed).toEqual({x: -130, y: -40, scale: 2})
    expect(planNodeEditorPinchTransform(
      {x: 0, y: 0, scale: 1},
      [{id: 1, x: 0, y: 0}, {id: 2, x: 10, y: 0}],
      [{id: 1, x: 0, y: 0}, {id: 2, x: 100, y: 0}],
      0.4,
      2.5,
    ).scale).toBe(2.5)
  })
})
