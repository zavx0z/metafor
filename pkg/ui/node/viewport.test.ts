import {describe, expect, test} from "bun:test"
import type {PositionedNodeSystem} from "./model.ts"
import {NodeInspectorSurface, nodeInspectorRows} from "./inspector.ts"
import {NodeSystemSurface, nodeSystemWheelGesture} from "./surface.ts"
import {
  fitNodeSystemViewport,
  hitTestNodeSystem,
  planNodeSystemViewport,
  zoomNodeSystemViewportAt,
} from "./viewport.ts"

const layout: PositionedNodeSystem = {
  revision: 1,
  bounds: {x: 10, y: 20, w: 400, h: 200},
  nodes: [
    {
      node: {
        id: "host",
        title: "Host",
        kind: "runtime",
        facts: [{id: "status", label: "Status", value: "ready"}],
        actions: [{id: "restart", label: "Restart", enabled: false}],
      },
      rect: {x: 10, y: 20, w: 100, h: 80},
      ports: [],
    },
    {
      node: {id: "peer", title: "Peer"},
      rect: {x: 310, y: 140, w: 100, h: 80},
      ports: [],
    },
  ],
  edges: [{edge: {id: "link", source: {nodeId: "host"}, target: {nodeId: "peer"}}, points: [{x: 110, y: 60}, {x: 310, y: 180}]}],
}

describe("node-system viewport and surfaces", () => {
  test("maps Mac trackpad scroll to pan and pinch to smooth zoom", () => {
    expect(nodeSystemWheelGesture({ctrlKey: false, deltaMode: 0, deltaX: 12, deltaY: -8}))
      .toEqual({kind: "pan", dx: 12, dy: -8})
    expect(nodeSystemWheelGesture({ctrlKey: false, deltaMode: 1, deltaX: 2, deltaY: 3}))
      .toEqual({kind: "pan", dx: 32, dy: 48})

    const gentle = nodeSystemWheelGesture({ctrlKey: true, deltaMode: 0, deltaX: 0, deltaY: -4})
    expect(gentle.kind).toBe("zoom")
    if (gentle.kind === "zoom") expect(gentle.factor).toBeCloseTo(Math.exp(0.01), 10)
    expect(nodeSystemWheelGesture({ctrlKey: true, deltaMode: 2, deltaX: 0, deltaY: 10}))
      .toEqual({kind: "zoom", factor: 0.85})
  })

  test("can remove the graph toolbar without changing the generic default", () => {
    expect(new NodeSystemSurface().toolbarVisible).toBe(true)
    expect(new NodeSystemSurface({toolbar: false}).toolbarVisible).toBe(false)
  })

  test("fits the complete layout and preserves the point under zoom", () => {
    const viewport = fitNodeSystemViewport(layout, {x: 0, y: 40, w: 800, h: 400}, 20)
    const anchor = {x: 260, y: 180}
    const logical = {x: (anchor.x - viewport.x) / viewport.scale, y: (anchor.y - viewport.y) / viewport.scale}
    const zoomed = zoomNodeSystemViewportAt(viewport, 1.5, anchor)
    expect(zoomed.x + logical.x * zoomed.scale).toBeCloseTo(anchor.x, 10)
    expect(zoomed.y + logical.y * zoomed.scale).toBeCloseTo(anchor.y, 10)
  })

  test("culls by viewport and hit-tests only visible transformed nodes", () => {
    const plan = planNodeSystemViewport(layout, {x: 0, y: 0, scale: 1}, {x: 0, y: 0, w: 160, h: 120})
    expect(plan.nodes.map(({node}) => node.id)).toEqual(["host"])
    expect(hitTestNodeSystem(plan, {x: 20, y: 30})?.node.id).toBe("host")
    expect(hitTestNodeSystem(plan, {x: 500, y: 500})).toBeNull()
  })

  test("keeps selection and action execution outside the serializable document", () => {
    const selected: Array<string | null> = []
    const surface = new NodeSystemSurface({onSelectionChange: (nodeId) => selected.push(nodeId)})
    surface.setLayout(layout)
    expect(surface.select("host")).toBe(true)
    expect(surface.selectedNode?.node.title).toBe("Host")
    expect(surface.select("missing")).toBe(false)
    expect(selected).toEqual(["host"])

    const inspector = new NodeInspectorSurface()
    inspector.inspect(surface.selectedNode?.node ?? null)
    expect(inspector.inspectedNode?.id).toBe("host")
    expect(nodeInspectorRows(inspector.inspectedNode!)).toEqual([
      {id: "identity", label: "Идентификатор", value: "host"},
      {id: "kind", label: "Тип", value: "runtime"},
      {id: "status", label: "Status", value: "ready"},
    ])
  })

  test("closes and reopens the inspector without losing its selected node", () => {
    const states: boolean[] = []
    const inspector = new NodeInspectorSurface({onOpenChange: (open) => states.push(open)})
    inspector.inspect(layout.nodes[0]!.node)
    expect(inspector.setOpen(false)).toBe(true)
    expect(inspector.isOpen).toBe(false)
    expect(inspector.inspectedNode?.id).toBe("host")
    expect(inspector.setOpen(false)).toBe(false)
    expect(inspector.toggleOpen()).toBe(true)
    expect(inspector.isOpen).toBe(true)
    expect(states).toEqual([false, true])
  })

  test("moves a node through the surface contract without moving its peer", () => {
    const events: Array<{nodeId: string; phase: string; x: number; y: number}> = []
    const surface = new NodeSystemSurface({
      onNodeMove(event) {
        const rect = event.layout.nodes.find(({node}) => node.id === event.nodeId)!.rect
        events.push({nodeId: event.nodeId, phase: event.phase, x: rect.x, y: rect.y})
      },
    })
    surface.setLayout(layout)
    expect(surface.moveNode("host", {x: 70, y: 90}, "end")).toBe(true)
    expect(surface.moveNode("missing", {x: 0, y: 0})).toBe(false)
    expect(events).toEqual([{nodeId: "host", phase: "end", x: 70, y: 90}])
    expect(surface.layout.nodes[1]?.rect).toEqual(layout.nodes[1]?.rect)
  })

  test("selects and moves a group through one atomic surface event", () => {
    const events: Array<{nodeIds: readonly string[]; phase: string}> = []
    const surface = new NodeSystemSurface({
      onNodeMove(event) {
        events.push({nodeIds: event.nodeIds, phase: event.phase})
      },
    })
    surface.setLayout(layout)
    expect(surface.selectMany(["host", "peer"])).toBe(true)
    expect([...surface.selectedNodeIds]).toEqual(["host", "peer"])
    expect(surface.moveNodes(new Map([
      ["host", {x: 40, y: 50}],
      ["peer", {x: 340, y: 170}],
    ]), "end", "host")).toBe(true)
    expect(surface.layout.nodes.map(({rect}) => ({x: rect.x, y: rect.y}))).toEqual([
      {x: 40, y: 50},
      {x: 340, y: 170},
    ])
    expect(events).toEqual([{nodeIds: ["host", "peer"], phase: "end"}])
  })

  test("resizes from left and right while retaining the opposite edge", () => {
    const events: Array<{side: string; width: number; x: number}> = []
    const surface = new NodeSystemSurface({
      onNodeResize(event) {
        const rect = event.layout.nodes.find(({node}) => node.id === event.nodeId)!.rect
        events.push({side: event.side, width: rect.w, x: rect.x})
      },
    })
    surface.setLayout(layout)
    expect(surface.resizeNode("host", 240, "right", "end")).toBe(true)
    expect(surface.layout.nodes[0]?.rect).toEqual({x: 10, y: 20, w: 240, h: 80})
    expect(surface.resizeNode("host", 300, "left", "end")).toBe(true)
    expect(surface.layout.nodes[0]?.rect).toEqual({x: -50, y: 20, w: 300, h: 80})
    expect(events).toEqual([
      {side: "right", width: 240, x: 10},
      {side: "left", width: 300, x: -50},
    ])
  })

  test("does not preserve an empty/default viewport before the layout was materialized", () => {
    const surface = new NodeSystemSurface()
    surface.setLayout(layout)
    expect(surface.hasMaterializedViewport).toBe(false)
    expect(surface.setViewport({x: 12, y: 34, scale: 0.8})).toBe(true)
    expect(surface.hasMaterializedViewport).toBe(true)
    surface.setLayout({...layout, revision: 2})
    expect(surface.hasMaterializedViewport).toBe(false)
  })
})
