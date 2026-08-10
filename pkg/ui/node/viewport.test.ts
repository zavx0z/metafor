import {describe, expect, test} from "bun:test"
import {TrueTypeFont} from "@metafor/engine"
import {
  fitNodeSystemCanvasTransform,
  hitTestNodeSystem,
  planNodeSystemCanvasViewport,
  zoomNodeSystemCanvasTransformAt,
  type PositionedNodeSystem,
} from "./index.ts"
import {HUD_WINDOW_TITLE_HEIGHT} from "@ui/hud"
import {NODE_INSPECTOR_TITLE_HEIGHT, NodeInspectorSurface, nodeInspectorRows} from "./inspector.ts"
import {
  NodeSystemSurface,
  nodeSystemScreenPresentationMetrics,
  nodeSystemWheelGesture,
  planNodeSystemContainmentPaintSteps,
} from "./surface.ts"

const layout: PositionedNodeSystem = {
  revision: 1,
  bounds: {x: 10, y: 20, w: 400, h: 200},
  nodes: [
    {
      node: {
        id: "host",
        title: "Host",
        kind: "runtime",
        facts: [{id: "status", label: "Status", value: "ready"}, {id: "link", label: "Link", value: "out"}],
        ports: [{id: "link", parameterId: "link", direction: "out"}],
        actions: [{id: "restart", label: "Restart", enabled: false}],
      },
      rect: {x: 10, y: 20, w: 100, h: 80},
      ports: [{port: {id: "link", parameterId: "link", direction: "out"}, center: {x: 110, y: 60}}],
    },
    {
      node: {id: "peer", title: "Peer", facts: [{id: "link", label: "Link", value: "in"}], ports: [{id: "link", parameterId: "link", direction: "in"}]},
      rect: {x: 310, y: 140, w: 100, h: 80},
      ports: [{port: {id: "link", parameterId: "link", direction: "in"}, center: {x: 310, y: 180}}],
    },
  ],
  edges: [{edge: {id: "link", source: {nodeId: "host", portId: "link"}, target: {nodeId: "peer", portId: "link"}}, points: [{x: 114, y: 60}, {x: 306, y: 180}]}],
}

describe("node-system infinite canvas and surfaces", () => {
  test("keeps text proportional while preserving screen-visible strokes and sockets", () => {
    const fitted = nodeSystemScreenPresentationMetrics(0.3)
    expect(fitted.titleFontPx).toBeCloseTo(3.6)
    expect(fitted.bodyFontPx).toBeCloseTo(2.7)
    expect(fitted.metaFontPx).toBeCloseTo(2.7)
    expect(fitted.fieldPaddingPx).toBeCloseTo(1.2)
    expect(fitted.nodeBorderPx).toBe(1.25)
    expect(fitted.selectedNodeBorderPx).toBe(1.75)
    expect(fitted.edgeThicknessPx).toBe(1.8)
    expect(fitted.socketDiameterPx).toBe(5.5)

    const native = nodeSystemScreenPresentationMetrics(2)
    expect(native.titleFontPx).toBe(24)
    expect(native.bodyFontPx).toBe(18)
    expect(native.edgeThicknessPx).toBe(3.2)
    expect(native.socketDiameterPx).toBe(16)
  })

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

  test("keeps retained traffic below the declarative control/socket layer", () => {
    const surface = new NodeSystemSurface()
    const names = surface.node.children.map(({name}) => name)
    expect(names.indexOf("NodeSystemSurface.retainedLayer"))
      .toBeLessThan(names.indexOf("NodeSystemSurface.layer"))
  })

  test("fits the complete layout and preserves the point under zoom", () => {
    const transform = fitNodeSystemCanvasTransform(layout, {x: 0, y: 40, w: 800, h: 400}, 20)
    const anchor = {x: 260, y: 180}
    const logical = {x: (anchor.x - transform.x) / transform.scale, y: (anchor.y - transform.y) / transform.scale}
    const zoomed = zoomNodeSystemCanvasTransformAt(transform, 1.5, anchor)
    expect(zoomed.x + logical.x * zoomed.scale).toBeCloseTo(anchor.x, 10)
    expect(zoomed.y + logical.y * zoomed.scale).toBeCloseTo(anchor.y, 10)
  })

  test("culls by the display window and hit-tests only visible transformed nodes", () => {
    const plan = planNodeSystemCanvasViewport(layout, {x: 0, y: 0, scale: 1}, {x: 0, y: 0, w: 160, h: 120})
    expect(plan.nodes.map(({node}) => node.id)).toEqual(["host"])
    expect(hitTestNodeSystem(plan, {x: 20, y: 30})?.node.id).toBe("host")
    expect(hitTestNodeSystem(plan, {x: 500, y: 500})).toBeNull()
  })

  test("paints routes above every containing owner and below child cards", () => {
    const entry = (id: string, parentId?: string) => ({
      node: {id, title: id, ...(parentId === undefined ? {} : {parentId})},
      rect: {x: 0, y: 0, w: 100, h: 80},
      ports: [],
    })
    const nodes = [
      entry("page"),
      entry("main", "page"),
      entry("rtc", "main"),
      entry("worker", "page"),
      entry("peer"),
      entry("server-rtc", "peer"),
    ]

    expect(planNodeSystemContainmentPaintSteps(nodes)).toEqual([
      {kind: "owner-background", nodeId: "page"},
      {kind: "owner-background", nodeId: "peer"},
      {kind: "owner-background", nodeId: "main"},
      {kind: "edges"},
      {kind: "node-foreground", nodeId: "page", includeBackground: false},
      {kind: "node-foreground", nodeId: "peer", includeBackground: false},
      {kind: "node-foreground", nodeId: "main", includeBackground: false},
      {kind: "node-foreground", nodeId: "worker", includeBackground: true},
      {kind: "node-foreground", nodeId: "server-rtc", includeBackground: true},
      {kind: "node-foreground", nodeId: "rtc", includeBackground: true},
    ])
  })

  test("keeps selection and action execution outside the serializable document", () => {
    const selected: Array<string | null> = []
    const surface = new NodeSystemSurface({onSelectionChange: (nodeId) => selected.push(nodeId)})
    surface.setLayout(layout)
    expect(surface.select("host")).toBe(true)
    expect(surface.selectedNode?.node.title).toBe("Host")
    expect(surface.select("missing")).toBe(false)
    expect(selected).toEqual(["host"])

    const inspector = new NodeInspectorSurface({open: false})
    inspector.inspect(surface.selectedNode?.node ?? null)
    expect(inspector.inspectedNode?.id).toBe("host")
    expect(inspector.isOpen).toBe(false)
    expect(NODE_INSPECTOR_TITLE_HEIGHT).toBe(HUD_WINDOW_TITLE_HEIGHT)
    expect(nodeInspectorRows(inspector.inspectedNode!)).toEqual([
      {id: "identity", label: "Идентификатор", value: "host"},
      {id: "kind", label: "Тип", value: "runtime"},
      {id: "status", label: "Status", value: "ready"},
      {id: "link", label: "Link", value: "out"},
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

  test("does not preserve an empty/default canvas transform before the layout was materialized", () => {
    const surface = new NodeSystemSurface()
    surface.setLayout(layout)
    expect(surface.hasMaterializedCanvasTransform).toBe(false)
    expect(surface.setCanvasTransform({x: 12, y: 34, scale: 0.8})).toBe(true)
    expect(surface.hasMaterializedCanvasTransform).toBe(true)
    surface.setLayout({...layout, revision: 2})
    expect(surface.hasMaterializedCanvasTransform).toBe(false)
  })

  test("preserves an owner-materialized canvas transform when the display frame changes", async () => {
    const fontBuffer = await Bun.file(
      new URL("../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url),
    ).arrayBuffer()
    const font = new TrueTypeFont(fontBuffer)
    const surface = new NodeSystemSurface({toolbar: false})
    try {
      surface.setLayout(layout)
      surface.setRect({x: 0, y: 0, w: 800, h: 400}, 1, font)
      expect(surface.hasMaterializedCanvasTransform).toBe(true)

      const manual = {x: 73, y: -41, scale: 1.25}
      expect(surface.setCanvasTransform(manual)).toBe(true)
      surface.setRect({x: 0, y: 0, w: 1200, h: 700}, 1, font)

      expect(surface.canvasTransform).toEqual(manual)
      expect(surface.hasMaterializedCanvasTransform).toBe(true)
    } finally {
      surface.dispose()
    }
  })

  test("keeps concurrent edge messages distinct, rejects duplicates and exposes idle again", () => {
    const counts: number[] = []
    const surface = new NodeSystemSurface({onEdgeMessageCountChange: (count) => counts.push(count)})
    const at = Date.now()
    expect(surface.emitEdgeMessage({id: "source:1", edgeId: "link", direction: "forward", at})).toBeTrue()
    expect(surface.emitEdgeMessage({id: "source:2", edgeId: "link", direction: "reverse", at})).toBeTrue()
    expect(surface.emitEdgeMessage({id: "source:1", edgeId: "link", direction: "forward", at})).toBeFalse()
    expect(surface.emitEdgeMessage({id: "expired", edgeId: "link", direction: "forward", at: at - 2_000})).toBeFalse()
    expect(surface.activeEdgeMessageCount).toBe(2)
    expect(counts).toEqual([1, 2])
  })

  test("requests one terminal clearing frame when the last edge particle expires", () => {
    const originalNow = Date.now
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
    let now = 1_000
    const scheduled: FrameRequestCallback[] = []

    class CountingNodeSystemSurface extends NodeSystemSurface {
      renderRequests = 0
      presentationRequests = 0

      override requestRender(): void {
        this.renderRequests += 1
      }

      protected override requestPresentationFrame(): void {
        this.presentationRequests += 1
      }
    }

    try {
      Date.now = () => now
      globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
        scheduled.push(callback)
        return 1
      }) as typeof requestAnimationFrame
      globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame

      const surface = new CountingNodeSystemSurface()
      expect(surface.emitEdgeMessage({id: "terminal", edgeId: "link", direction: "forward", at: now})).toBeTrue()
      expect(surface.renderRequests).toBe(1)
      expect(surface.presentationRequests).toBe(0)
      expect(scheduled).toHaveLength(1)

      now += 1_200
      const terminalFrame = scheduled.shift()
      terminalFrame?.(now)

      expect(surface.activeEdgeMessageCount).toBe(0)
      expect(surface.renderRequests).toBe(1)
      expect(surface.presentationRequests).toBe(1)
      expect(scheduled).toHaveLength(0)
      surface.dispose()
    } finally {
      Date.now = originalNow
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    }
  })

  test("drops transient traffic and cancels animation while its tab is hidden", () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
    const cancelled: number[] = []

    try {
      globalThis.requestAnimationFrame = (() => 41) as typeof requestAnimationFrame
      globalThis.cancelAnimationFrame = ((id: number) => cancelled.push(id)) as typeof cancelAnimationFrame

      const counts: number[] = []
      const surface = new NodeSystemSurface({onEdgeMessageCountChange: (count) => counts.push(count)})
      const now = Date.now()
      expect(surface.emitEdgeMessage({id: "visible", edgeId: "link", direction: "forward", at: now})).toBeTrue()
      expect(surface.setEdgeAnimationEnabled(false)).toBeTrue()
      expect(surface.edgeAnimationEnabled).toBeFalse()
      expect(surface.activeEdgeMessageCount).toBe(0)
      expect(cancelled).toEqual([41])
      expect(counts).toEqual([1, 0])
      expect(surface.emitEdgeMessage({id: "hidden", edgeId: "link", direction: "forward", at: now})).toBeFalse()
      expect(surface.setEdgeAnimationEnabled(true)).toBeTrue()
      expect(surface.edgeAnimationEnabled).toBeTrue()
      surface.dispose()
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    }
  })
})
