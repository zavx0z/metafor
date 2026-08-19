import {describe, expect, test} from "bun:test"
import type {MeasuredNodeSystem, NodeSystemDocument, PositionedNodeSystem} from "nodes/types"
import {planNodeSystemCard} from "./card-layout.ts"
import {
  adaptNodeSystemCardPresentation,
  type NodeSystemCardPresentation,
  type PositionedNodeSystemCard,
} from "./card-model.ts"
import {AdaptiveNodeSystemCardLayouter} from "./adaptive-card-layout.ts"
import {
  layoutMeasuredNodeSystemAdaptiveWithDiagnostics,
} from "nodes/adaptive-layout"

describe("adaptive measured and Card adapters", () => {
  test("layouts a presentation-independent Bare measurement without Card fields", () => {
    const sourcePort = {id: "io", direction: "inout" as const}
    const targetPort = {id: "in", direction: "in" as const, side: "left" as const}
    const measured: MeasuredNodeSystem = {
      revision: "bare-1",
      geometryKey: "bare:120x80:40",
      nodes: [
        {
          node: {id: "source", ports: [sourcePort]},
          width: 120,
          height: 80,
          contentHeight: 80,
          ports: [{port: sourcePort, offsetY: 40}],
        },
        {
          node: {id: "target", ports: [targetPort]},
          width: 120,
          height: 80,
          contentHeight: 80,
          ports: [{port: targetPort, offsetY: 40}],
        },
      ],
      edges: [{
        id: "edge",
        source: {nodeId: "source", portId: "io"},
        target: {nodeId: "target", portId: "in"},
      }],
    }

    const outcome = layoutMeasuredNodeSystemAdaptiveWithDiagnostics(
      measured,
      {viewport: {width: 900, height: 500}},
    )

    expect(outcome.positioned.geometryKey).toBe(measured.geometryKey)
    expect(outcome.positioned.revision).toBe(measured.revision)
    expect(positionedPort(outcome.positioned, "source", "io").side).toBe("right")
    expect(positionedPort(outcome.positioned, "target", "in").side).toBe("left")
    expect(outcome.diagnostics).toMatchObject({fixedPortCount: 1, dynamicPortCount: 1})
    expect(JSON.stringify(measured)).not.toContain("title")
    expectExactEdgeEndpoints(outcome.positioned)
  })

  test("renders an adaptively resolved Card marker without mutating semantic side", () => {
    const topology: NodeSystemDocument = {
      nodes: [
        {id: "source", ports: [{id: "out", direction: "out", side: "right"}]},
        {id: "target", ports: [{id: "io", direction: "inout"}]},
      ],
      edges: [{
        id: "edge",
        source: {nodeId: "source", portId: "out"},
        target: {nodeId: "target", portId: "io"},
      }],
    }
    const preset = adaptNodeSystemCardPresentation(topology, cardPresentation(topology))
    const positioned = new AdaptiveNodeSystemCardLayouter().layout(
      preset,
      {viewport: {width: 900, height: 500}},
    )
    const target = positioned.nodes.find(({node}) => node.id === "target")!
    const resolved = positionedPort(positioned, "target", "io")
    const semantic = topology.nodes[1]!.ports![0]!
    const card = planNodeSystemCard(
      target.node,
      target.rect,
      1,
      undefined,
      new Map(target.ports.map(({port, side}) => [port.id, side])),
    )
    const marker = card.ports.find(({port}) => port.id === "io")!.marker

    expect(semantic.side).toBeUndefined()
    expect(resolved.port).toEqual(semantic)
    expect(resolved.side).toBe("left")
    expect(marker.x + marker.w / 2).toBe(target.rect.x)
    expectExactEdgeEndpoints(positioned)
  })

  test("uses one resolved side for a shared inout Card port in mixed constraints", () => {
    const topology: NodeSystemDocument = {
      nodes: [
        {id: "shared", ports: [{id: "io", direction: "inout"}]},
        {id: "target-a", ports: [{id: "in", direction: "in", side: "left"}]},
        {id: "target-b", ports: [{id: "in", direction: "in", side: "left"}]},
      ],
      edges: [
        {
          id: "to-a",
          source: {nodeId: "shared", portId: "io"},
          target: {nodeId: "target-a", portId: "in"},
        },
        {
          id: "to-b",
          source: {nodeId: "shared", portId: "io"},
          target: {nodeId: "target-b", portId: "in"},
        },
      ],
    }
    const positioned = new AdaptiveNodeSystemCardLayouter().layout(
      adaptNodeSystemCardPresentation(topology, cardPresentation(topology)),
      {viewport: {width: 1_000, height: 600}},
    )
    const shared = positionedPort(positioned, "shared", "io")
    const toA = positioned.edges.find(({edge}) => edge.id === "to-a")!
    const toB = positioned.edges.find(({edge}) => edge.id === "to-b")!

    expect(positioned.nodes.find(({node}) => node.id === "shared")!.ports).toHaveLength(1)
    expect(toA.points[0]).toEqual(shared.center)
    expect(toB.points[0]).toEqual(shared.center)
    expect(topology.nodes[0]!.ports![0]!.side).toBeUndefined()
    expectExactEdgeEndpoints(positioned)
  })

  test("preserves explicit visual constraints independently from capabilities", () => {
    const topology: NodeSystemDocument = {
      nodes: [
        {id: "source", ports: [{id: "out-west", direction: "out", side: "left"}]},
        {id: "target", ports: [{id: "in-east", direction: "in", side: "right"}]},
      ],
      edges: [{
        id: "edge",
        source: {nodeId: "source", portId: "out-west"},
        target: {nodeId: "target", portId: "in-east"},
      }],
    }
    const positioned = new AdaptiveNodeSystemCardLayouter().layout(
      adaptNodeSystemCardPresentation(topology, cardPresentation(topology)),
      {viewport: {width: 900, height: 500}},
    )

    expect(positionedPort(positioned, "source", "out-west").side).toBe("left")
    expect(positionedPort(positioned, "target", "in-east").side).toBe("right")
    expectExactEdgeEndpoints(positioned)
  })
})

function cardPresentation(document: NodeSystemDocument): NodeSystemCardPresentation {
  return {
    nodes: document.nodes.map((node) => ({
      nodeId: node.id,
      title: node.id,
      facts: (node.ports ?? []).map((port) => ({
        id: `row-${port.id}`,
        label: port.id,
        value: port.direction,
      })),
      portAnchors: (node.ports ?? []).map((port) => ({
        portId: port.id,
        rowId: `row-${port.id}`,
      })),
    })),
  }
}

function positionedPort(
  positioned: PositionedNodeSystem,
  nodeId: string,
  portId: string,
) {
  return positioned.nodes.find(({node}) => node.id === nodeId)!.ports.find(({port}) => port.id === portId)!
}

function expectExactEdgeEndpoints(positioned: PositionedNodeSystem): void {
  for (const entry of positioned.edges) {
    const source = positionedPort(positioned, entry.edge.source.nodeId, entry.edge.source.portId)
    const target = positionedPort(positioned, entry.edge.target.nodeId, entry.edge.target.portId)
    expect(entry.points[0]).toEqual(source.center)
    expect(entry.points.at(-1)).toEqual(target.center)
  }
}
