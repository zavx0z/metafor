import {describe, expect, test} from "bun:test"
import type {MeasuredNodeSystem, NodeSystemDocument, PositionedNodeSystem} from "nodes/types"
import {validateMeasuredNodeSystem, validateNodeSystemDocument, validatePositionedNodeSystem} from "nodes/validation"
import {measureNodeSystemCardPreset} from "./card-layout.ts"
import {
  adaptNodeSystemCardPresentation,
  type NodeSystemCardPresentation,
} from "./card-model.ts"
import {FixedNodeSystemCardLayouter} from "./fixed-card-layout.ts"

const topology: NodeSystemDocument = {
  revision: "semantic:1",
  nodes: [
    {id: "producer", ports: [{id: "events", direction: "out", connectionType: "event"}]},
    {id: "consumer", ports: [{id: "events", direction: "in", connectionType: "event"}]},
  ],
  edges: [{
    id: "events",
    source: {nodeId: "producer", portId: "events"},
    target: {nodeId: "consumer", portId: "events"},
    connectionType: "event",
  }],
}

const card: NodeSystemCardPresentation = {
  nodes: [
    {
      nodeId: "producer",
      title: "Producer",
      facts: [{id: "output", label: "Output", value: "events"}],
      actions: [{id: "pause", label: "Pause"}],
      portAnchors: [{portId: "events", rowId: "output"}],
    },
    {
      nodeId: "consumer",
      title: "Consumer",
      summary: "Receives events",
      facts: [{id: "input", label: "Input", value: "events"}],
      portAnchors: [{portId: "events", rowId: "input"}],
    },
  ],
  edges: [{edgeId: "events", label: "event stream"}],
}

describe("semantic topology and Card presentation boundary", () => {
  test("uses the same topology for Card and a row-free measured presentation", () => {
    expect(() => validateNodeSystemDocument(topology)).not.toThrow()
    expect("title" in topology.nodes[0]!).toBeFalse()
    expect("facts" in topology.nodes[0]!).toBeFalse()

    const preset = adaptNodeSystemCardPresentation(topology, card)
    expect(preset.nodes[0]!.title).toBe("Producer")
    expect(preset.nodes[0]!.ports![0]!.rowId).toBe("output")
    expect(topology.nodes[0]!.ports![0]).toEqual({id: "events", direction: "out", connectionType: "event"})

    const bare: MeasuredNodeSystem = {
      ...(topology.revision === undefined ? {} : {revision: topology.revision}),
      geometryKey: "bare:1",
      nodes: topology.nodes.map((node) => ({
        node,
        width: 96,
        height: 48,
        contentHeight: 48,
        ports: (node.ports ?? []).map((port) => ({port, offsetY: 24})),
      })),
      edges: topology.edges,
    }
    expect(() => validateMeasuredNodeSystem(bare)).not.toThrow()
  })

  test("normalizes Card measurement without leaking Card content", () => {
    const preset = adaptNodeSystemCardPresentation(topology, card)
    const measured = measureNodeSystemCardPreset(preset)

    expect(() => validateMeasuredNodeSystem(measured)).not.toThrow()
    expect(JSON.stringify(measured)).not.toContain("Producer")
    expect(JSON.stringify(measured)).not.toContain("Output")
    expect(JSON.stringify(measured)).not.toContain("rowId")
    expect(measured.nodes.every(({width, height, contentHeight}) =>
      width > 0 && height > 0 && contentHeight <= height)).toBeTrue()
  })

  test("keeps fixed geometry while materializing explicit resolved sides", () => {
    const preset = adaptNodeSystemCardPresentation(topology, card)
    const positioned = new FixedNodeSystemCardLayouter().layout(preset, {
      viewport: {width: 1_024, height: 768},
    })
    const producer = positioned.nodes.find(({node}) => node.id === "producer")!
    const consumer = positioned.nodes.find(({node}) => node.id === "consumer")!

    expect(producer.ports[0]!.side).toBe("right")
    expect(producer.ports[0]!.center.x).toBe(producer.rect.x + producer.rect.w)
    expect(consumer.ports[0]!.side).toBe("left")
    expect(consumer.ports[0]!.center.x).toBe(consumer.rect.x)
    expect("rowId" in producer.ports[0]!.port).toBeFalse()
  })

  test("rejects dangling or ambiguous Card anchors before measurement", () => {
    expect(() => adaptNodeSystemCardPresentation(topology, {
      ...card,
      nodes: card.nodes.map((node) => node.nodeId === "producer"
        ? {...node, portAnchors: [{portId: "events", rowId: "missing"}]}
        : node),
    })).toThrow("Unknown Card port row: producer/events/missing")
    expect(() => adaptNodeSystemCardPresentation(topology, {
      ...card,
      nodes: card.nodes.slice(1),
    })).toThrow("Missing Card node: producer")
  })

  test("requires resolved side to match the positioned node boundary", () => {
    const semantic: PositionedNodeSystem = {
      bounds: {x: 0, y: 0, w: 100, h: 60},
      nodes: [{
        node: {id: "node", ports: [{id: "socket", direction: "inout"}]},
        rect: {x: 0, y: 0, w: 100, h: 60},
        ports: [{port: {id: "socket", direction: "inout"}, side: "right", center: {x: 100, y: 30}}],
      }],
      edges: [],
    }
    expect(() => validatePositionedNodeSystem(semantic)).not.toThrow()
    expect(() => validatePositionedNodeSystem({
      ...semantic,
      nodes: [{...semantic.nodes[0]!, ports: [{...semantic.nodes[0]!.ports[0]!, side: "left"}]}],
    })).toThrow("Positioned port is detached from resolved side: node/socket")
  })
})
