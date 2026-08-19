import {describe, expect, test} from "bun:test"
import {Color, TrueTypeFont, type Object3D} from "@metafor/engine"
import {
  createBlenderNodeRenderers,
  measureBlenderNode,
  positionBlenderNode,
  type BlenderFrame,
  type BlenderLink,
  type BlenderNode,
  type BlenderNodePlan,
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
  type NodeEditorRenderers,
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

function requiredObject(root: Object3D, name: string): Object3D {
  const object = root.getObjectByName(name)
  if (object === undefined) throw new Error(`Missing retained object: ${name}`)
  return object
}

describe("generic Blender-like Node Editor contracts", () => {
  test("retains the actual content hierarchy and rematerializes only dirty components", async () => {
    const calls = {
      nodePlans: 0,
      nodeRenders: 0,
      linkEntries: [] as PositionedNodeTree<TestNode, TestSocket, TestLink, TestFrame>["links"][number][],
      socketEntries: [] as PositionedNodeTree<TestNode, TestSocket, TestLink, TestFrame>["nodes"][number]["sockets"][number][],
    }
    const renderers: NodeEditorRenderers<
      TestNode,
      TestSocket,
      TestLink,
      TestFrame,
      {rect: typeof tree.nodes[number]["rect"]}
    > = {
      frame: {
        renderBackground({host, entry, selected}) {
          host.drawRoundedRect(entry.rect.x, entry.rect.y, entry.rect.w, entry.rect.h, {
            radius: 8,
            fill: new Color(0.08, 0.12, 0.16, 1),
            border: selected ? new Color(1, 0.5, 0.1, 1) : null,
          })
        },
        renderForeground({host, entry, selected}) {
          host.drawLine(
            entry.rect.x,
            entry.rect.y + 24,
            entry.rect.x + entry.rect.w,
            entry.rect.y + 24,
            selected ? new Color(1, 0.5, 0.1, 1) : new Color(0.4, 0.5, 0.6, 1),
            1,
          )
        },
      },
      node: {
        plan({entry}) {
          calls.nodePlans += 1
          return {rect: entry.rect}
        },
        render({host, plan}) {
          calls.nodeRenders += 1
          host.drawRoundedRect(plan.rect.x, plan.rect.y, plan.rect.w, plan.rect.h, {
            radius: 6,
            fill: new Color(0.2, 0.3, 0.4, 1),
          })
        },
      },
      socket: {
        render({host, entry}) {
          calls.socketEntries.push(entry)
          host.drawRoundedRect(entry.center.x - 4, entry.center.y - 4, 8, 8, {
            radius: 4,
            fill: new Color(0.8, 0.4, 0.2, 1),
          })
        },
      },
      link: {
        render({host, entry}) {
          calls.linkEntries.push(entry)
          host.drawPolyline(entry.points, new Color(0.3, 0.7, 0.9, 1), 2)
        },
      },
    }
    const secondLink = {...tree.links[0]!, link: {...tree.links[0]!.link, id: "second-link"}}
    const retainedTree = {...tree, links: [tree.links[0]!, secondLink]}
    const canvas = new NodeEditor<TestNode, TestSocket, TestLink, TestFrame, {rect: typeof tree.nodes[number]["rect"]}>({
      renderers,
      toolbar: false,
    })
    const initial = canvas.diagnostics
    expect(Object.isFrozen(initial)).toBeTrue()
    canvas.setTree(retainedTree)
    const fontBytes = await Bun.file(new URL("../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
    canvas.setRect({x: 0, y: 0, w: 640, h: 360}, 0.001, new TrueTypeFont(fontBytes))

    const contentRoot = requiredObject(canvas.node, "NodeCanvas.contentRoot")
    const gridParent = requiredObject(canvas.node, "NodeCanvas.grid")
    const frameBackgroundParent = requiredObject(canvas.node, "NodeCanvas.frame-background:frame")
    const firstLinkParent = requiredObject(canvas.node, "NodeCanvas.link:value-link")
    const secondLinkParent = requiredObject(canvas.node, "NodeCanvas.link:second-link")
    const frameForegroundParent = requiredObject(canvas.node, "NodeCanvas.frame-foreground:frame")
    const sourceParent = requiredObject(canvas.node, "NodeCanvas.node:source")
    const targetParent = requiredObject(canvas.node, "NodeCanvas.node:target")
    expect(contentRoot.children.map(({name}) => name)).toEqual([
      "NodeCanvas.grid",
      "NodeCanvas.frame-background:frame",
      "NodeCanvas.link:value-link",
      "NodeCanvas.link:second-link",
      "NodeCanvas.frame-foreground:frame",
      "NodeCanvas.node:source",
      "NodeCanvas.node:target",
    ])
    expect(calls.nodePlans).toBe(2)
    expect(calls.nodeRenders).toBe(2)
    expect(calls.linkEntries).toEqual(retainedTree.links)
    expect(calls.socketEntries).toEqual(retainedTree.nodes.flatMap(({sockets}) => sockets))
    expect(canvas.diagnostics).toEqual({localLayoutPlans: 2, materializations: 1, transformOnlyFrames: 0})

    const componentParents = [
      gridParent,
      frameBackgroundParent,
      firstLinkParent,
      secondLinkParent,
      frameForegroundParent,
      sourceParent,
      targetParent,
    ]
    const childrenBeforeTransform = componentParents.map((parent) => [...parent.children])
    const geometriesBeforeTransform = componentParents.map((parent) => parent.children.map((child) =>
      (child as {geometry?: unknown}).geometry))
    expect(canvas.setCanvasTransform({x: 40, y: 30, scale: 0.75})).toBeTrue()
    canvas.onWheel({
      deltaMode: 0,
      deltaX: 8,
      deltaY: 3,
      ctrlKey: false,
      preventDefault() {},
    } as WheelEvent, 100, 100)
    canvas.onMultiTouchStart([{id: 1, x: 80, y: 100}, {id: 2, x: 180, y: 100}])
    canvas.onMultiTouchMove([{id: 1, x: 60, y: 110}, {id: 2, x: 200, y: 110}])
    canvas.onMultiTouchEnd()
    canvas.flushPendingRender()

    expect(requiredObject(canvas.node, "NodeCanvas.contentRoot")).toBe(contentRoot)
    expect(contentRoot.position.x).toBeCloseTo(canvas.canvasTransform.x * 0.001)
    expect(contentRoot.position.y).toBeCloseTo(-canvas.canvasTransform.y * 0.001)
    expect(contentRoot.scale.x).toBe(canvas.canvasTransform.scale)
    expect(contentRoot.scale.y).toBe(canvas.canvasTransform.scale)
    componentParents.forEach((parent, index) => {
      expect(parent.children).toHaveLength(childrenBeforeTransform[index]!.length)
      parent.children.forEach((child, childIndex) => {
        expect(child).toBe(childrenBeforeTransform[index]![childIndex]!)
        expect((child as {geometry?: unknown}).geometry).toBe(geometriesBeforeTransform[index]![childIndex])
      })
    })
    expect(canvas.diagnostics).toEqual({localLayoutPlans: 2, materializations: 1, transformOnlyFrames: 3})
    expect(calls.nodePlans).toBe(2)
    expect(calls.nodeRenders).toBe(2)

    const sourceChildrenBeforeDirty = [...sourceParent.children]
    const targetChildrenBeforeDirty = [...targetParent.children]
    canvas.setTree({
      ...retainedTree,
      revision: "dirty-2",
      nodes: [
        {...retainedTree.nodes[0]!, node: {...retainedTree.nodes[0]!.node, title: "Source 2"}},
        retainedTree.nodes[1]!,
      ],
    })
    canvas.flushPendingRender()
    expect(sourceParent.children[0]).not.toBe(sourceChildrenBeforeDirty[0])
    expect(targetParent.children).toHaveLength(targetChildrenBeforeDirty.length)
    targetParent.children.forEach((child, index) => expect(child).toBe(targetChildrenBeforeDirty[index]!))
    expect(calls.nodePlans).toBe(3)
    expect(calls.nodeRenders).toBe(3)
    expect(canvas.diagnostics).toEqual({localLayoutPlans: 3, materializations: 2, transformOnlyFrames: 3})

    expect(canvas.select({kind: "link", id: "value-link"})).toBeTrue()
    canvas.flushPendingRender()
    expect(contentRoot.children.map(({name}) => name)).toEqual([
      "NodeCanvas.grid",
      "NodeCanvas.frame-background:frame",
      "NodeCanvas.link:second-link",
      "NodeCanvas.link:value-link",
      "NodeCanvas.frame-foreground:frame",
      "NodeCanvas.node:source",
      "NodeCanvas.node:target",
    ])
    expect(canvas.diagnostics).toEqual({localLayoutPlans: 3, materializations: 3, transformOnlyFrames: 3})
    canvas.dispose()
  })

  test("calls the actual Blender intrinsic planner once per dirty Node cycle", async () => {
    const node: BlenderNode = {
      id: "diagnostic-node",
      title: "Diagnostic",
      parameters: [{id: "value", label: "Value", field: {id: "value", label: "Value", kind: "number", value: 0.5}}],
      sockets: [{id: "value", label: "Value", direction: "input", socketType: "float", parameterId: "value", side: "left"}],
    }
    const rect = {x: 20, y: 20, w: 220, h: measureBlenderNode(node).height}
    const diagnosticTree: PositionedNodeTree<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame> = {
      bounds: rect,
      frames: [],
      nodes: [positionBlenderNode(node, rect)],
      links: [],
    }
    const blender = createBlenderNodeRenderers()
    let actualPlans = 0
    const canvas = new NodeCanvas<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame, BlenderNodePlan>({
      renderers: {
        ...blender,
        node: {
          ...blender.node,
          plan(context) {
            actualPlans += 1
            return blender.node.plan(context)
          },
        },
      },
      toolbar: false,
    })
    canvas.setTree(diagnosticTree)
    const fontBytes = await Bun.file(new URL("../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
    canvas.setRect({x: 0, y: 0, w: 640, h: 360}, 0.001, new TrueTypeFont(fontBytes))
    expect(actualPlans).toBe(1)
    expect(canvas.diagnostics).toEqual({localLayoutPlans: 1, materializations: 1, transformOnlyFrames: 0})

    canvas.setCanvasTransform({x: 40, y: 30, scale: 0.5})
    canvas.setCanvasTransform({x: 80, y: 60, scale: 1.25})
    canvas.flushPendingRender()
    expect(actualPlans).toBe(1)
    expect(canvas.diagnostics).toEqual({localLayoutPlans: 1, materializations: 1, transformOnlyFrames: 2})

    const nextNode = {...node, title: "Diagnostic 2"}
    canvas.setTree({...diagnosticTree, revision: 2, nodes: [positionBlenderNode(nextNode, rect)]})
    canvas.flushPendingRender()
    expect(actualPlans).toBe(2)
    expect(canvas.diagnostics).toEqual({localLayoutPlans: 2, materializations: 2, transformOnlyFrames: 2})
    canvas.dispose()
  })

  test("publishes exact read-only Canvas and interactive Editor component names", () => {
    const renderers = {
      frame: {renderBackground() {}, renderForeground() {}},
      node: {plan() {}, render() {}},
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
