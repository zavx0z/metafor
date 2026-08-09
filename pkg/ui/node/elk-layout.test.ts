import {afterAll, describe, expect, test} from "bun:test"
import type {NodeSystemDocument} from "./model.ts"
import {NODE_SYSTEM_CARD_METRICS, measureNodeSystemCard, nodeSystemGeometryKey, planNodeSystemCard} from "./card-layout.ts"
import {ElkNodeSystemLayouter} from "./elk-layout.ts"

const document: NodeSystemDocument = {
  revision: "topology:7",
  nodes: [
    {
      id: "window",
      title: "Window",
      kind: "browser",
      order: 2,
      ports: [{id: "control", parameterId: "control", direction: "in"}],
      facts: [{id: "role", label: "Role", value: "leader"}, {id: "control", label: "Control", value: "in"}],
    },
    {
      id: "host",
      title: "Coordinator",
      kind: "host",
      order: 0,
      ports: [{id: "control", parameterId: "control", direction: "out"}, {id: "peer", parameterId: "peer", direction: "out"}],
      facts: [{id: "control", label: "Control", value: "out"}, {id: "peer", label: "Peer", value: "out"}],
    },
    {
      id: "peer",
      title: "Peer",
      kind: "process",
      order: 1,
      ports: [{id: "in", parameterId: "in", direction: "in"}],
      facts: [{id: "in", label: "Peer", value: "in"}],
    },
  ],
  edges: [
    {id: "control", order: 0, source: {nodeId: "host", portId: "control"}, target: {nodeId: "window", portId: "control"}},
    {id: "peer", order: 1, source: {nodeId: "host", portId: "peer"}, target: {nodeId: "peer", portId: "in"}},
  ],
}

const layouter = new ElkNodeSystemLayouter()
afterAll(() => layouter.dispose())

describe("deterministic ELK node-system layout", () => {
  test("lays out a stable left-to-right graph with routed port edges", async () => {
    const first = await layouter.layout(document)
    const second = await layouter.layout({
      ...document,
      nodes: [...document.nodes].reverse(),
      edges: [...document.edges].reverse(),
    })

    expect(first).toEqual(second)
    expect(first.revision).toBe("topology:7")
    expect(first.nodes.map(({node}) => node.id)).toEqual(["host", "peer", "window"])
    expect(first.edges.map(({edge}) => edge.id)).toEqual(["control", "peer"])
    expect(first.edges.every(({points}) => points.length >= 2)).toBe(true)

    const host = first.nodes.find(({node}) => node.id === "host")!
    const window = first.nodes.find(({node}) => node.id === "window")!
    expect(host.rect.x).toBeLessThan(window.rect.x)
    expect(host.ports.find(({port}) => port.id === "control")!.center.x).toBeGreaterThan(host.rect.x + host.rect.w / 2)
    expect(window.ports[0]!.center.x).toBeLessThan(window.rect.x + window.rect.w / 2)

    const hostCard = planNodeSystemCard(host.node, host.rect)
    for (const positionedPort of host.ports) {
      const cardPort = hostCard.ports.find(({port}) => port.id === positionedPort.port.id)!
      expect(positionedPort.center.x).toBeCloseTo(cardPort.marker.x + cardPort.marker.w / 2, 6)
      expect(positionedPort.center.y).toBeCloseTo(cardPort.marker.y + cardPort.marker.h / 2, 6)
    }
  })

  test("does not overlap positioned node frames", async () => {
    const layout = await layouter.layout(document)
    for (let leftIndex = 0; leftIndex < layout.nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < layout.nodes.length; rightIndex += 1) {
        const left = layout.nodes[leftIndex]!.rect
        const right = layout.nodes[rightIndex]!.rect
        const separated = left.x + left.w <= right.x || right.x + right.w <= left.x || left.y + left.h <= right.y || right.y + right.h <= left.y
        expect(separated).toBe(true)
      }
    }
  })

  test("positions the exact measured geometry and records its relayout key", async () => {
    const measureText = (value: string, fontPx: number): number => value.length * fontPx * 0.57
    const exactLayouter = new ElkNodeSystemLayouter({measureText})
    try {
      const layout = await exactLayouter.layout(document)
      for (const positioned of layout.nodes) {
        const measured = measureNodeSystemCard(positioned.node, measureText)
        expect(positioned.rect.w).toBeCloseTo(measured.width, 6)
        expect(positioned.rect.h).toBeCloseTo(measured.height, 6)
      }
      expect(layout.geometryKey).toBe(nodeSystemGeometryKey(document, measureText))
    } finally {
      exactLayouter.dispose()
    }
  })

  test("lets ELK orient the same compound graph RIGHT and DOWN", async () => {
    const responsive: NodeSystemDocument = {
      nodes: [
        {id: "owner", title: "Owner", order: 0, facts: [{id: "outer", label: "Outer", value: "out"}], ports: [{id: "outer", parameterId: "outer", direction: "out"}]},
        {id: "source", parentId: "owner", title: "Source", order: 1, facts: [{id: "out", label: "Message", value: "out"}], ports: [{id: "out", parameterId: "out", direction: "out"}]},
        {id: "target", parentId: "owner", title: "Target", order: 2, facts: [{id: "in", label: "Message", value: "in"}], ports: [{id: "in", parameterId: "in", direction: "in"}]},
      ],
      edges: [{
        id: "message",
        source: {nodeId: "source", portId: "out"},
        target: {nodeId: "target", portId: "in"},
      }],
    }

    const right = await layouter.layout(responsive, {direction: "RIGHT", layerSpacing: 94, padding: 48})
    const down = await layouter.layout(responsive, {direction: "DOWN", layerSpacing: 94, padding: 48})
    const rightOwner = right.nodes.find(({node}) => node.id === "owner")!
    const rightSource = right.nodes.find(({node}) => node.id === "source")!
    const rightTarget = right.nodes.find(({node}) => node.id === "target")!
    const downOwner = down.nodes.find(({node}) => node.id === "owner")!
    const downSource = down.nodes.find(({node}) => node.id === "source")!
    const downTarget = down.nodes.find(({node}) => node.id === "target")!

    expect(rightTarget.rect.x).toBeGreaterThanOrEqual(rightSource.rect.x + rightSource.rect.w)
    expect(downTarget.rect.y).toBeGreaterThanOrEqual(downSource.rect.y + downSource.rect.h)
    expect(rightTarget.rect.x - rightSource.rect.x - rightSource.rect.w).toBeGreaterThanOrEqual(94)
    expect(downTarget.rect.y - downSource.rect.y - downSource.rect.h).toBeGreaterThanOrEqual(94)
    expect(contained(rightSource.rect, rightOwner.rect)).toBe(true)
    expect(contained(rightTarget.rect, rightOwner.rect)).toBe(true)
    expect(contained(downSource.rect, downOwner.rect)).toBe(true)
    expect(contained(downTarget.rect, downOwner.rect)).toBe(true)
    expectPortBoundary(right.edges[0]!.points[0]!, rightSource.ports[0]!.center, "right")
    expectPortBoundary(down.edges[0]!.points[0]!, downSource.ports[0]!.center, "right")
    for (const owner of [rightOwner, downOwner]) {
      const marker = planNodeSystemCard(owner.node, owner.rect).ports[0]!.marker
      expect(owner.ports[0]!.center.x).toBeCloseTo(marker.x + marker.w / 2, 6)
      expect(owner.ports[0]!.center.y).toBeCloseTo(marker.y + marker.h / 2, 6)
    }
  })

  test("lays out a cyclic compound graph in both orientations", async () => {
    const cyclic: NodeSystemDocument = {
      nodes: [
        {id: "owner", title: "Owner", order: 0},
        {
          id: "a",
          parentId: "owner",
          title: "A",
          order: 1,
          facts: [{id: "forward", label: "Forward", value: "out"}, {id: "reverse", label: "Reverse", value: "in"}],
          ports: [
            {id: "forward", parameterId: "forward", direction: "out"},
            {id: "reverse", parameterId: "reverse", direction: "in"},
          ],
        },
        {
          id: "b",
          parentId: "owner",
          title: "B",
          order: 2,
          facts: [{id: "forward", label: "Forward", value: "in"}, {id: "reverse", label: "Reverse", value: "out"}],
          ports: [
            {id: "forward", parameterId: "forward", direction: "in"},
            {id: "reverse", parameterId: "reverse", direction: "out"},
          ],
        },
      ],
      edges: [
        {id: "forward", source: {nodeId: "a", portId: "forward"}, target: {nodeId: "b", portId: "forward"}},
        {id: "reverse", source: {nodeId: "b", portId: "reverse"}, target: {nodeId: "a", portId: "reverse"}},
      ],
    }

    for (const direction of ["RIGHT", "DOWN"] as const) {
      const result = await layouter.layout(cyclic, {direction})
      expect(result.edges).toHaveLength(2)
      expect(result.edges.every(({points}) => points.length >= 2)).toBe(true)
    }
  })
})

function contained(inner: {x: number; y: number; w: number; h: number}, outer: {x: number; y: number; w: number; h: number}): boolean {
  return inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
}

function expectPortBoundary(
  point: Readonly<{x: number; y: number}>,
  center: Readonly<{x: number; y: number}>,
  side: "left" | "right",
): void {
  expect(point.y).toBeCloseTo(center.y, 6)
  expect(point.x).toBeCloseTo(
    center.x + (side === "right" ? 1 : -1) * NODE_SYSTEM_CARD_METRICS.markerSize / 2,
    6,
  )
}
