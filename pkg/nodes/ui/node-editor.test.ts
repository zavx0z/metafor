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
  type Node,
  type PositionedNodeTree,
  type Socket,
} from "./node-editor.ts"

type TestNode = Node & Readonly<{title: string}>
type TestSocket = Socket & Readonly<{socketType: string}>
type TestLink = Link & Readonly<{label: string}>

const tree: PositionedNodeTree<TestNode, TestSocket, TestLink> = {
  bounds: {x: 0, y: 0, w: 460, h: 280},
  nodes: [
    {
      node: {id: "frame", title: "Frame"},
      rect: {x: 0, y: 0, w: 460, h: 280},
      sockets: [],
    },
    {
      node: {id: "source", parentId: "frame", title: "Source"},
      rect: {x: 40, y: 70, w: 140, h: 100},
      sockets: [{
        socket: {id: "value", direction: "output", socketType: "float"},
        side: "right",
        center: {x: 180, y: 120},
      }],
    },
    {
      node: {id: "target", parentId: "frame", title: "Target"},
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
      node: {renderBackground() {}, renderForeground() {}},
      socket: {render() {}},
      link: {render() {}},
    }
    const canvas = new NodeCanvas<TestNode, TestSocket, TestLink>({renderers})
    const editor = new NodeEditor<TestNode, TestSocket, TestLink>({renderers})
    expect(canvas.node.name).toBe("NodeCanvas")
    expect(editor.node.name).toBe("NodeEditor")
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

  test("places container backgrounds below links and node foregrounds above", () => {
    expect(planNodeEditorPaintSteps(tree.nodes)).toEqual([
      {kind: "container-background", nodeId: "frame"},
      {kind: "links"},
      {kind: "node", nodeId: "frame", includeBackground: false},
      {kind: "node", nodeId: "source", includeBackground: true},
      {kind: "node", nodeId: "target", includeBackground: true},
    ])
  })

  test("fits, transforms and culls a typed positioned NodeTree", () => {
    const transform = fitNodeEditorTransform(tree, {x: 0, y: 0, w: 920, h: 560}, 40)
    const plan = planNodeEditorViewport(tree, transform, {x: 0, y: 0, w: 920, h: 560})
    expect(transform.scale).toBeGreaterThan(1)
    expect(plan.nodes).toHaveLength(3)
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
