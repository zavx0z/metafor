import {afterAll, describe, expect, test} from "bun:test"
import type {NodeSystemDocument} from "./model.ts"
import {measureNodeSystemCard, nodeSystemGeometryKey, planNodeSystemCard} from "./card-layout.ts"
import {ElkNodeSystemLayouter} from "./elk-layout.ts"

const document: NodeSystemDocument = {
  revision: "topology:7",
  nodes: [
    {
      id: "window",
      title: "Window",
      kind: "browser",
      order: 2,
      ports: [{id: "control", direction: "in"}],
      facts: [{id: "role", label: "Role", value: "leader"}],
    },
    {
      id: "host",
      title: "Coordinator",
      kind: "host",
      order: 0,
      ports: [{id: "control", direction: "out"}, {id: "peer", direction: "out"}],
    },
    {
      id: "peer",
      title: "Peer",
      kind: "process",
      order: 1,
      ports: [{id: "in", direction: "in"}],
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
})
