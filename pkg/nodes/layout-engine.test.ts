import {describe, expect, test} from "bun:test"
import {
  LayoutWorkerClient,
  runLayoutWorkerRequest,
  type LayoutWorkerRequest,
  type LayoutWorkerResponse,
} from "@nodes/layout"
import {NODE_SYSTEM_PORT_PITCH} from "@nodes/ui/card-layout"
import {
  MetaForNodeSystemLayouter,
  MetaForNodeSystemWorkerLayouter,
  orderNodeSystemPortFactsForLayout,
} from "./layout-engine.ts"
import type {NodeSystemDocument, PositionedNodeSystem} from "./types/model.ts"

const document: NodeSystemDocument = {
  revision: "layout-engine:1",
  nodes: [
    {id: "owner", title: "Owner"},
    {
      id: "source",
      parentId: "owner",
      title: "Source",
      facts: [{id: "message", label: "Message", value: "out"}],
      ports: [{id: "out", parameterId: "message", direction: "out"}],
    },
    {
      id: "target",
      parentId: "owner",
      title: "Target",
      facts: [{id: "message", label: "Message", value: "in"}],
      ports: [{id: "in", parameterId: "message", direction: "in"}],
    },
  ],
  edges: [{
    id: "message",
    source: {nodeId: "source", portId: "out"},
    target: {nodeId: "target", portId: "in"},
  }],
}

describe("MetaFor TypeScript node-system layout", () => {
  test("is synchronous, exact-socket and deterministic across input permutations", () => {
    const layouter = new MetaForNodeSystemLayouter()
    const first = layouter.layout(document, {viewport: {width: 900, height: 600}})
    expect(first).not.toBeInstanceOf(Promise)
    expect(first.revision).toBe("layout-engine:1")
    expectExactEdgeEndpoints(first)
    expectOrthogonal(first)

    const reversed = layouter.layout({
      ...document,
      nodes: [...document.nodes].reverse(),
      edges: [...document.edges].reverse(),
    }, {viewport: {width: 900, height: 600}})
    expect(reversed).toEqual(first)
  })

  test("uses RIGHT for landscape and square, DOWN only for portrait", () => {
    const layouter = new MetaForNodeSystemLayouter()
    const landscape = layouter.layout(document, {viewport: {width: 900, height: 600}})
    const square = layouter.layout(document, {viewport: {width: 600, height: 600}})
    const portrait = layouter.layout(document, {viewport: {width: 600, height: 900}})
    expect(node(landscape, "target").rect.x).toBeGreaterThan(node(landscape, "source").rect.x)
    expect(node(square, "target").rect.x).toBeGreaterThan(node(square, "source").rect.x)
    expect(node(portrait, "target").rect.y).toBeGreaterThan(node(portrait, "source").rect.y)
    expect(
      node(portrait, "target").rect.y -
      node(portrait, "source").rect.y -
      node(portrait, "source").rect.h,
    ).toBe(NODE_SYSTEM_PORT_PITCH)
    expectExactEdgeEndpoints(portrait)
    expectOrthogonal(portrait)
  })

  test("reserves a deterministic landscape corridor for multi-edge fanout", () => {
    const fanout: NodeSystemDocument = {
      nodes: [
        {
          id: "source",
          title: "Source",
          facts: ["a", "b", "c"].map((id) => ({id, label: id, value: "out"})),
          ports: ["a", "b", "c"].map((id) => ({id, parameterId: id, direction: "out" as const})),
        },
        ...["a", "b", "c"].map((id) => ({
          id: `target-${id}`,
          title: `Target ${id}`,
          facts: [{id: "in", label: "In", value: id}],
          ports: [{id: "in", parameterId: "in", direction: "in" as const}],
        })),
      ],
      edges: ["a", "b", "c"].map((id) => ({
        id: `edge-${id}`,
        source: {nodeId: "source", portId: id},
        target: {nodeId: `target-${id}`, portId: "in"},
      })),
    }
    const layout = new MetaForNodeSystemLayouter().layout(fanout, {
      viewport: {width: 1_200, height: 700},
    })
    const source = node(layout, "source")
    const targetX = Math.min(...["a", "b", "c"].map((id) => node(layout, `target-${id}`).rect.x))

    expect(targetX - source.rect.x - source.rect.w).toBeGreaterThanOrEqual(4 * NODE_SYSTEM_PORT_PITCH)
    expect(layout.edges).toHaveLength(3)
    expectExactEdgeEndpoints(layout)
    expectOrthogonal(layout)
  })

  test("packs equal portrait cards into a balanced flow instead of an empty row or column", () => {
    const wideLayer: NodeSystemDocument = {
      nodes: ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => ({
        id,
        title: `Card ${id}`,
        facts: Array.from({length: 8}, (_, index) => ({
          id: `fact-${index}`,
          label: `Fact ${index}`,
          value: id,
        })),
      })),
      edges: [],
    }
    const portrait = new MetaForNodeSystemLayouter().layout(
      wideLayer,
      {viewport: {width: 390, height: 844}},
    )
    expect(new Set(portrait.nodes.map(({rect}) => rect.x)).size).toBeGreaterThan(1)
    expect(new Set(portrait.nodes.map(({rect}) => rect.y)).size).toBeGreaterThan(1)
  })

  test("routes two simultaneous sibling lifecycle contours with a bounded portrait-width fallback", () => {
    const nodeWithPorts = (
      id: string,
      parentId: string | undefined,
      title: string,
      parameters: readonly (readonly [string, "in" | "out"])[],
    ) => ({
      id,
      ...(parentId === undefined ? {} : {parentId}),
      title,
      facts: parameters.map(([parameterId, direction]) => ({
        id: parameterId,
        label: parameterId,
        value: direction,
      })),
      ports: parameters.map(([parameterId, direction]) => ({
        id: parameterId,
        parameterId,
        direction,
      })),
    })
    const transition: NodeSystemDocument = {
      nodes: [
        {id: "browser", title: "Browser"},
        nodeWithPorts("page", "browser", "Current page realm", [
          ["controller-a", "out"], ["message-a", "in"],
          ["controller-b", "out"], ["message-b", "in"],
        ]),
        nodeWithPorts("service-worker-a", "browser", "Service Worker A", [
          ["controller-a", "in"], ["message-a", "out"], ["websocket-a", "out"],
        ]),
        nodeWithPorts("service-worker-b", "browser", "Service Worker B", [
          ["controller-b", "in"], ["message-b", "out"], ["websocket-b", "out"],
        ]),
        nodeWithPorts("server", undefined, "Hamiltonian server", [
          ["ipc-worker", "out"], ["ipc-main", "out"], ["ipc-peer", "out"],
          ["websocket-a", "in"], ["websocket-b", "in"],
        ]),
        nodeWithPorts("bun-worker", undefined, "Worker probe process", [["ipc-worker", "in"]]),
        nodeWithPorts("bun-main", undefined, "Main probe process", [["ipc-main", "in"]]),
        nodeWithPorts("window-main", "page", "Window main realm", [["worker-message", "out"]]),
        nodeWithPorts("peer-process", undefined, "WebRTC peer process", [["ipc-peer", "in"]]),
        nodeWithPorts("dedicated-worker", "page", "Dedicated Worker", [["worker-message", "in"]]),
        nodeWithPorts("rtc-server", "peer-process", "Server RTCPeerConnection", [
          ["data-force", "out"], ["data-oracle", "out"],
        ]),
        nodeWithPorts("rtc-browser", "window-main", "Browser RTCPeerConnection", [
          ["data-force", "in"], ["data-oracle", "in"],
        ]),
      ],
      edges: [
        {id: "controller-a", source: {nodeId: "page", portId: "controller-a"}, target: {nodeId: "service-worker-a", portId: "controller-a"}},
        {id: "message-a", source: {nodeId: "service-worker-a", portId: "message-a"}, target: {nodeId: "page", portId: "message-a"}},
        {id: "websocket-a", source: {nodeId: "service-worker-a", portId: "websocket-a"}, target: {nodeId: "server", portId: "websocket-a"}},
        {id: "controller-b", source: {nodeId: "page", portId: "controller-b"}, target: {nodeId: "service-worker-b", portId: "controller-b"}},
        {id: "message-b", source: {nodeId: "service-worker-b", portId: "message-b"}, target: {nodeId: "page", portId: "message-b"}},
        {id: "websocket-b", source: {nodeId: "service-worker-b", portId: "websocket-b"}, target: {nodeId: "server", portId: "websocket-b"}},
        {id: "ipc-worker", source: {nodeId: "server", portId: "ipc-worker"}, target: {nodeId: "bun-worker", portId: "ipc-worker"}},
        {id: "ipc-main", source: {nodeId: "server", portId: "ipc-main"}, target: {nodeId: "bun-main", portId: "ipc-main"}},
        {id: "ipc-peer", source: {nodeId: "server", portId: "ipc-peer"}, target: {nodeId: "peer-process", portId: "ipc-peer"}},
        {id: "worker-message", source: {nodeId: "window-main", portId: "worker-message"}, target: {nodeId: "dedicated-worker", portId: "worker-message"}},
        {id: "data-force", source: {nodeId: "rtc-server", portId: "data-force"}, target: {nodeId: "rtc-browser", portId: "data-force"}},
        {id: "data-oracle", source: {nodeId: "rtc-server", portId: "data-oracle"}, target: {nodeId: "rtc-browser", portId: "data-oracle"}},
      ],
    }
    const layouter = new MetaForNodeSystemLayouter()
    const layout = layouter.layout(transition, {
      viewport: {width: 647, height: 1088},
    })
    const permuted = layouter.layout({
      ...transition,
      nodes: [...transition.nodes].reverse(),
      edges: [...transition.edges].reverse(),
    }, {viewport: {width: 647, height: 1088}})

    expect(layout.nodes).toHaveLength(12)
    expect(layout.edges).toHaveLength(12)
    expect(permuted).toEqual(layout)
    expectAllExactEdgeEndpoints(layout)
    expectOrthogonal(layout)
  })

  test("orders connected parameter rows by counterpart position without moving ordinary facts", () => {
    const sortable: NodeSystemDocument = {
      nodes: [
        {
          id: "source",
          title: "Source",
          facts: [
            {id: "right", label: "Right", value: "out"},
            {id: "identity", label: "Identity", value: "fixed"},
            {id: "left", label: "Left", value: "out"},
          ],
          ports: [
            {id: "right-port", parameterId: "right", direction: "out"},
            {id: "left-port", parameterId: "left", direction: "out"},
          ],
        },
        {id: "right-target", title: "Right target", facts: [{id: "in", label: "In", value: "in"}], ports: [{id: "in", parameterId: "in", direction: "in"}]},
        {id: "left-target", title: "Left target", facts: [{id: "in", label: "In", value: "in"}], ports: [{id: "in", parameterId: "in", direction: "in"}]},
      ],
      edges: [
        {id: "right-edge", source: {nodeId: "source", portId: "right-port"}, target: {nodeId: "right-target", portId: "in"}},
        {id: "left-edge", source: {nodeId: "source", portId: "left-port"}, target: {nodeId: "left-target", portId: "in"}},
      ],
    }
    const observed: PositionedNodeSystem = {
      bounds: {x: 0, y: 0, w: 400, h: 300},
      nodes: sortable.nodes.map((entry) => ({
        node: entry,
        rect: entry.id === "left-target"
          ? {x: 40, y: 200, w: 100, h: 80}
          : entry.id === "right-target"
            ? {x: 260, y: 200, w: 100, h: 80}
            : {x: 150, y: 20, w: 100, h: 100},
        ports: entry.id === "left-target"
          ? [{port: entry.ports![0]!, center: {x: 40, y: 210}}]
          : entry.id === "right-target"
            ? [{port: entry.ports![0]!, center: {x: 260, y: 260}}]
            : [
              {port: entry.ports![0]!, center: {x: 250, y: 60}},
              {port: entry.ports![1]!, center: {x: 250, y: 90}},
            ],
      })),
      edges: [],
    }
    const ordered = orderNodeSystemPortFactsForLayout(sortable, observed, "DOWN")
    expect(ordered.nodes.find(({id}) => id === "source")!.facts!.map(({id}) => id)).toEqual([
      "left",
      "identity",
      "right",
    ])
    expect(sortable.nodes[0]!.facts!.map(({id}) => id)).toEqual(["right", "identity", "left"])
  })

  test("prefers an exact opposite socket row before shorter nonzero offsets", () => {
    const exact: NodeSystemDocument = {
      nodes: [
        {
          id: "source",
          title: "Source",
          facts: [
            {id: "far", label: "Far", value: "out"},
            {id: "exact", label: "Exact", value: "out"},
          ],
          ports: [
            {id: "far-port", parameterId: "far", direction: "out"},
            {id: "exact-port", parameterId: "exact", direction: "out"},
          ],
        },
        {id: "far-target", title: "Far", facts: [{id: "in", label: "In", value: "in"}], ports: [{id: "in", parameterId: "in", direction: "in"}]},
        {id: "exact-target", title: "Exact", facts: [{id: "in", label: "In", value: "in"}], ports: [{id: "in", parameterId: "in", direction: "in"}]},
      ],
      edges: [
        {id: "far", source: {nodeId: "source", portId: "far-port"}, target: {nodeId: "far-target", portId: "in"}},
        {id: "exact", source: {nodeId: "source", portId: "exact-port"}, target: {nodeId: "exact-target", portId: "in"}},
      ],
    }
    const positioned: PositionedNodeSystem = {
      bounds: {x: 0, y: 0, w: 300, h: 300},
      nodes: [
        {node: exact.nodes[0]!, rect: {x: 0, y: 0, w: 100, h: 150}, ports: [
          {port: exact.nodes[0]!.ports![0]!, center: {x: 100, y: 100}},
          {port: exact.nodes[0]!.ports![1]!, center: {x: 100, y: 130}},
        ]},
        {node: exact.nodes[1]!, rect: {x: 200, y: 0, w: 100, h: 100}, ports: [
          {port: exact.nodes[1]!.ports![0]!, center: {x: 200, y: 0}},
        ]},
        {node: exact.nodes[2]!, rect: {x: 200, y: 60, w: 100, h: 100}, ports: [
          {port: exact.nodes[2]!.ports![0]!, center: {x: 200, y: 100}},
        ]},
      ],
      edges: [],
    }
    expect(orderNodeSystemPortFactsForLayout(exact, positioned, "DOWN")
      .nodes[0]!.facts!.map(({id}) => id)).toEqual(["exact", "far"])
  })

  test("rejects endpoint roles that violate out/EAST to in/WEST", () => {
    const invalid: NodeSystemDocument = {
      ...document,
      nodes: document.nodes.map((entry) => entry.id !== "source" ? entry : {
        ...entry,
        ports: [{id: "out", parameterId: "message", direction: "out", side: "left"}],
      }),
    }
    expect(() => new MetaForNodeSystemLayouter().layout(
      invalid,
      {viewport: {width: 900, height: 600}},
    )).toThrow("source must be out/EAST")
  })

  test("materializes the same UI geometry through the minimal Worker graph", async () => {
    for (const viewport of [{width: 900, height: 600}, {width: 390, height: 844}]) {
      const endpoint = new InlineLayoutWorkerEndpoint()
      const client = new LayoutWorkerClient(endpoint)
      const expected = new MetaForNodeSystemLayouter().layout(document, {viewport})
      const actual = await new MetaForNodeSystemWorkerLayouter(client).layout(document, {viewport}, 4)

      expect(actual).toEqual(expected)
      expect(endpoint.requests.length).toBeGreaterThan(0)
      expect(Object.keys(endpoint.requests[0]!.graph).sort()).toEqual([
        "edges", "layoutOptions", "nodes", "ports", "viewport",
      ])
      expect(JSON.stringify(endpoint.requests[0])).not.toContain("title")
      expect(JSON.stringify(endpoint.requests[0])).not.toContain("facts")
      client.dispose()
    }
  })
})

class InlineLayoutWorkerEndpoint {
  readonly requests: LayoutWorkerRequest[] = []
  readonly messageListeners = new Set<(event: MessageEvent<LayoutWorkerResponse>) => void>()
  readonly errorListeners = new Set<(event: ErrorEvent) => void>()

  postMessage(message: LayoutWorkerRequest): void {
    this.requests.push(structuredClone(message))
    queueMicrotask(() => {
      const response = runLayoutWorkerRequest(message)
      for (const listener of this.messageListeners) {
        listener({data: structuredClone(response)} as MessageEvent<LayoutWorkerResponse>)
      }
    })
  }

  addEventListener(type: "message" | "error", listener: ((event: MessageEvent<LayoutWorkerResponse>) => void) | ((event: ErrorEvent) => void)): void {
    if (type === "message") this.messageListeners.add(listener as (event: MessageEvent<LayoutWorkerResponse>) => void)
    else this.errorListeners.add(listener as (event: ErrorEvent) => void)
  }

  removeEventListener(type: "message" | "error", listener: ((event: MessageEvent<LayoutWorkerResponse>) => void) | ((event: ErrorEvent) => void)): void {
    if (type === "message") this.messageListeners.delete(listener as (event: MessageEvent<LayoutWorkerResponse>) => void)
    else this.errorListeners.delete(listener as (event: ErrorEvent) => void)
  }

  terminate(): void {}
}

function expectExactEdgeEndpoints(layout: PositionedNodeSystem): void {
  const edge = layout.edges[0]!
  const source = node(layout, edge.edge.source.nodeId).ports.find(
    ({port}) => port.id === edge.edge.source.portId,
  )!.center
  const target = node(layout, edge.edge.target.nodeId).ports.find(
    ({port}) => port.id === edge.edge.target.portId,
  )!.center
  expect(edge.points[0]).toEqual(source)
  expect(edge.points.at(-1)).toEqual(target)
}

function expectAllExactEdgeEndpoints(layout: PositionedNodeSystem): void {
  for (const edge of layout.edges) {
    const source = node(layout, edge.edge.source.nodeId).ports.find(
      ({port}) => port.id === edge.edge.source.portId,
    )!.center
    const target = node(layout, edge.edge.target.nodeId).ports.find(
      ({port}) => port.id === edge.edge.target.portId,
    )!.center
    expect(edge.points[0]).toEqual(source)
    expect(edge.points.at(-1)).toEqual(target)
  }
}

function expectOrthogonal(layout: PositionedNodeSystem): void {
  for (const {points} of layout.edges) {
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]!
      const current = points[index]!
      expect(previous.x === current.x || previous.y === current.y).toBe(true)
    }
  }
}

function node(layout: PositionedNodeSystem, id: string) {
  return layout.nodes.find((entry) => entry.node.id === id)!
}
