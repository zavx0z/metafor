import {describe, expect, test} from "bun:test"
import {LayoutWorkerClient, runLayoutWorkerRequest} from "nodes/layout-worker"
import type {LayoutWorkerRequest, LayoutWorkerResponse} from "nodes/types"
import {
  measureNodeSystemCard,
  measureNodeSystemCardContentHeight,
  NODE_SYSTEM_PORT_PITCH,
} from "./card-layout.ts"
import {
  FixedNodeSystemCardLayouter,
  FixedNodeSystemCardWorkerLayouter,
  orderFixedNodeSystemCardPortFactsForLayout,
} from "./fixed-card-layout.ts"
import type {NodeSystemDocument, PositionedNodeSystem} from "nodes/types"

const document: NodeSystemDocument = {
  revision: "fixed-card-layout:1",
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

describe("Fixed node-system card layout", () => {
  test("is synchronous, exact-socket and deterministic across input permutations", () => {
    const layouter = new FixedNodeSystemCardLayouter()
    const first = layouter.layout(document, {viewport: {width: 900, height: 600}})
    expect(first).not.toBeInstanceOf(Promise)
    expect(first.revision).toBe("fixed-card-layout:1")
    expectExactEdgeEndpoints(first)
    expectOrthogonal(first)

    const reversed = layouter.layout({
      ...document,
      nodes: [...document.nodes].reverse(),
      edges: [...document.edges].reverse(),
    }, {viewport: {width: 900, height: 600}})
    expect(reversed).toEqual(first)
  })

  test("keeps geometry when runtime incarnations retain their layout identities", () => {
    const stable: NodeSystemDocument = {
      ...document,
      nodes: document.nodes.map((entry) => ({...entry, layoutId: `slot:${entry.id}`})),
    }
    const reincarnated: NodeSystemDocument = {
      ...stable,
      revision: "fixed-card-layout:reloaded",
      nodes: stable.nodes.map((entry) => ({
        ...entry,
        id: `runtime:${entry.id}`,
        ...(entry.parentId === undefined ? {} : {parentId: `runtime:${entry.parentId}`}),
      })).reverse(),
      edges: stable.edges.map((edge) => ({
        ...edge,
        id: `runtime:${edge.id}`,
        source: {...edge.source, nodeId: `runtime:${edge.source.nodeId}`},
        target: {...edge.target, nodeId: `runtime:${edge.target.nodeId}`},
      })).reverse(),
    }
    const layouter = new FixedNodeSystemCardLayouter()

    for (const viewport of [{width: 900, height: 600}, {width: 390, height: 844}]) {
      const before = layouter.layout(stable, {viewport})
      const repeated = Array.from({length: 3}, () => layouter.layout(reincarnated, {viewport}))
      for (const after of repeated) {
        expect(geometryByLayoutIdentity(after)).toEqual(geometryByLayoutIdentity(before))
        expect(after.edges[0]?.edge.id).toBe("runtime:message")
        expectExactEdgeEndpoints(after)
        expectOrthogonal(after)
      }
    }
  })

  test("uses RIGHT for landscape and square, DOWN only for portrait", () => {
    const layouter = new FixedNodeSystemCardLayouter()
    const landscape = layouter.layout(document, {viewport: {width: 900, height: 600}})
    const square = layouter.layout(document, {viewport: {width: 600, height: 600}})
    const portrait = layouter.layout(document, {viewport: {width: 600, height: 900}})
    expect(node(landscape, "target").rect.x).toBeGreaterThan(node(landscape, "source").rect.x)
    expect(node(square, "target").rect.x).toBeGreaterThan(node(square, "source").rect.x)
    expect(node(portrait, "target").rect.y).toBeGreaterThan(node(portrait, "source").rect.y)
    const portraitSource = node(portrait, "source")
    const portraitTarget = node(portrait, "target")
    const verticalGap = portraitTarget.rect.y - portraitSource.rect.y - portraitSource.rect.h
    const edgeOccupiesGap = portrait.edges.some((edge) => edge.points.slice(1).some((to, index) => {
      const from = edge.points[index]!
      return from.y === to.y && from.y > portraitSource.rect.y + portraitSource.rect.h &&
        from.y < portraitTarget.rect.y
    }))
    expect(verticalGap).toBe((edgeOccupiesGap ? 2 : 1) * NODE_SYSTEM_PORT_PITCH)
    expectExactEdgeEndpoints(portrait)
    expectOrthogonal(portrait)
  })

  test("keeps measured compound content and children on one socket-pitch rhythm", () => {
    for (const ownerFacts of [undefined, [{id: "status", label: "Status", value: "active"}]]) {
      const compact: NodeSystemDocument = {
        nodes: [
          {id: "owner", title: "Owner", ...(ownerFacts === undefined ? {} : {facts: ownerFacts})},
          {id: "child-a", parentId: "owner", title: "Child A"},
          {id: "child-b", parentId: "owner", title: "Child B"},
        ],
        edges: [],
      }
      for (const viewport of [{width: 900, height: 600}, {width: 390, height: 844}]) {
        const positioned = new FixedNodeSystemCardLayouter().layout(compact, {viewport})
        const owner = node(positioned, "owner")
        const children = [node(positioned, "child-a"), node(positioned, "child-b")]
        const contentHeight = measureNodeSystemCardContentHeight(owner.node)
        const minChildY = Math.min(...children.map(({rect}) => rect.y))
        const maxChildBottom = Math.max(...children.map(({rect}) => rect.y + rect.h))

        expect(minChildY - owner.rect.y - contentHeight).toBe(NODE_SYSTEM_PORT_PITCH)
        expect(owner.rect.y + owner.rect.h - maxChildBottom).toBe(NODE_SYSTEM_PORT_PITCH)
        expect(Math.min(...children.map(({rect}) => rect.x)) - owner.rect.x).toBe(NODE_SYSTEM_PORT_PITCH)
        expect(owner.rect.x + owner.rect.w - Math.max(...children.map(({rect}) => rect.x + rect.w)))
          .toBe(NODE_SYSTEM_PORT_PITCH)
      }
    }
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
    const layout = new FixedNodeSystemCardLayouter().layout(fanout, {
      viewport: {width: 1_200, height: 700},
    })
    const source = node(layout, "source")
    const targetX = Math.min(...["a", "b", "c"].map((id) => node(layout, `target-${id}`).rect.x))

    expect(targetX - source.rect.x - source.rect.w).toBeGreaterThanOrEqual(4 * NODE_SYSTEM_PORT_PITCH)
    expect(layout.edges).toHaveLength(3)
    expectExactEdgeEndpoints(layout)
    expectOrthogonal(layout)
    expectNoEdgeIntersectsUnrelatedNodeContent(layout)
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
    const portrait = new FixedNodeSystemCardLayouter().layout(
      wideLayer,
      {viewport: {width: 390, height: 844}},
    )
    expect(new Set(portrait.nodes.map(({rect}) => rect.x)).size).toBeGreaterThan(1)
    expect(new Set(portrait.nodes.map(({rect}) => rect.y)).size).toBeGreaterThan(1)
  })

  test("routes two simultaneous sibling lifecycle contours independently of connected row arrival order", () => {
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
    const layouter = new FixedNodeSystemCardLayouter()
    for (const viewport of [{width: 647, height: 1088}, {width: 1200, height: 800}]) {
      const layout = layouter.layout(transition, {viewport})
      const permuted = layouter.layout({
        ...transition,
        nodes: [...transition.nodes].reverse().map((entry) => {
          if (!entry.id.startsWith("service-worker-") || entry.facts === undefined) return entry
          return {...entry, facts: [entry.facts[0]!, entry.facts[2]!, entry.facts[1]!]}
        }),
        edges: [...transition.edges].reverse(),
      }, {viewport})

      expect(layout.nodes).toHaveLength(12)
      expect(layout.edges).toHaveLength(12)
      expect(permuted).toEqual(layout)
      expectAllExactEdgeEndpoints(layout)
      expectOrthogonal(layout)
      expectNoEdgeIntersectsUnrelatedNodeContent(layout)
      expectParallelEdgeClearanceOnBothAxes(layout, NODE_SYSTEM_PORT_PITCH)
    }
  }, 60_000)

  test("proposes counterpart row order but keeps the lower-crossing routed order", () => {
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
    const ordered = orderFixedNodeSystemCardPortFactsForLayout(sortable, observed, "DOWN")
    expect(ordered.nodes.find(({id}) => id === "source")!.facts!.map(({id}) => id)).toEqual([
      "left",
      "identity",
      "right",
    ])
    expect(sortable.nodes[0]!.facts!.map(({id}) => id)).toEqual(["right", "identity", "left"])

    const routed = new FixedNodeSystemCardLayouter().layout(sortable, {
      viewport: {width: 390, height: 844},
    })
    expect(routed.nodes.find(({node}) => node.id === "source")!.node.facts!.map(({id}) => id)).toEqual([
      "right",
      "identity",
      "left",
    ])
    expect(countProperEdgeCrossings(routed)).toBe(0)
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
    expect(orderFixedNodeSystemCardPortFactsForLayout(exact, positioned, "DOWN")
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
    expect(() => new FixedNodeSystemCardLayouter().layout(
      invalid,
      {viewport: {width: 900, height: 600}},
    )).toThrow("source must be out/EAST")
  })

  test("materializes the same UI geometry through the minimal Worker graph", async () => {
    for (const viewport of [{width: 900, height: 600}, {width: 390, height: 844}]) {
      const endpoint = new InlineLayoutWorkerEndpoint()
      const client = new LayoutWorkerClient(endpoint)
      const expected = new FixedNodeSystemCardLayouter().layout(document, {viewport})
      const actual = await new FixedNodeSystemCardWorkerLayouter(client).layout(document, {viewport}, 4)

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

function geometryByLayoutIdentity(layout: PositionedNodeSystem) {
  const layoutIdByNodeId = new Map(layout.nodes.map(({node}) => [node.id, node.layoutId ?? node.id]))
  return {
    bounds: layout.bounds,
    nodes: layout.nodes.map(({node, rect, ports}) => ({
      id: node.layoutId ?? node.id,
      rect,
      ports: ports.map(({port, center}) => ({id: port.id, center})),
    })).sort((left, right) => left.id.localeCompare(right.id)),
    edges: layout.edges.map(({edge, points}) => ({
      id: JSON.stringify([
        layoutIdByNodeId.get(edge.source.nodeId),
        edge.source.portId,
        layoutIdByNodeId.get(edge.target.nodeId),
        edge.target.portId,
      ]),
      points,
    })).sort((left, right) => left.id.localeCompare(right.id)),
  }
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

function countProperEdgeCrossings(layout: PositionedNodeSystem): number {
  let crossings = 0
  for (let leftIndex = 0; leftIndex < layout.edges.length; leftIndex += 1) {
    const left = layout.edges[leftIndex]!.points
    for (let rightIndex = leftIndex + 1; rightIndex < layout.edges.length; rightIndex += 1) {
      const right = layout.edges[rightIndex]!.points
      for (let li = 1; li < left.length; li += 1) {
        for (let ri = 1; ri < right.length; ri += 1) {
          const a = left[li - 1]!
          const b = left[li]!
          const c = right[ri - 1]!
          const d = right[ri]!
          const firstHorizontal = a.y === b.y
          const secondHorizontal = c.y === d.y
          if (firstHorizontal === secondHorizontal) continue
          const horizontalA = firstHorizontal ? a : c
          const horizontalB = firstHorizontal ? b : d
          const verticalA = firstHorizontal ? c : a
          const verticalB = firstHorizontal ? d : b
          if (verticalA.x > Math.min(horizontalA.x, horizontalB.x) &&
              verticalA.x < Math.max(horizontalA.x, horizontalB.x) &&
              horizontalA.y > Math.min(verticalA.y, verticalB.y) &&
              horizontalA.y < Math.max(verticalA.y, verticalB.y)) crossings += 1
        }
      }
    }
  }
  return crossings
}

function expectNoEdgeIntersectsUnrelatedNodeContent(layout: PositionedNodeSystem): void {
  const entries = new Map(layout.nodes.map((entry) => [entry.node.id, entry]))
  const ancestors = (nodeId: string): ReadonlySet<string> => {
    const result = new Set<string>()
    let parentId = entries.get(nodeId)?.node.parentId
    while (parentId !== undefined) {
      result.add(parentId)
      parentId = entries.get(parentId)?.node.parentId
    }
    return result
  }
  for (const edge of layout.edges) {
    const transparentAncestors = new Set([
      ...ancestors(edge.edge.source.nodeId),
      ...ancestors(edge.edge.target.nodeId),
    ])
    for (const entry of layout.nodes) {
      if (entry.node.id === edge.edge.source.nodeId || entry.node.id === edge.edge.target.nodeId) continue
      const obstacle = transparentAncestors.has(entry.node.id)
        ? {...entry.rect, h: measureNodeSystemCard(entry.node).height}
        : entry.rect
      for (let index = 1; index < edge.points.length; index += 1) {
        expect(segmentIntersectsOpenRect(edge.points[index - 1]!, edge.points[index]!, obstacle)).toBeFalse()
      }
    }
  }
}

function segmentIntersectsOpenRect(
  from: Readonly<{x: number; y: number}>,
  to: Readonly<{x: number; y: number}>,
  rect: Readonly<{x: number; y: number; w: number; h: number}>,
): boolean {
  if (from.y === to.y) {
    return from.y > rect.y && from.y < rect.y + rect.h &&
      Math.max(Math.min(from.x, to.x), rect.x) < Math.min(Math.max(from.x, to.x), rect.x + rect.w)
  }
  return from.x > rect.x && from.x < rect.x + rect.w &&
    Math.max(Math.min(from.y, to.y), rect.y) < Math.min(Math.max(from.y, to.y), rect.y + rect.h)
}

function expectParallelEdgeClearanceOnBothAxes(
  layout: PositionedNodeSystem,
  clearance: number,
): void {
  const edgesById = new Map(layout.edges.map(({edge}) => [edge.id, edge]))
  const segments = layout.edges.flatMap((edge) => {
    const points = edge.points
    return points.slice(1).map((to, index) => ({
      edgeId: edge.edge.id,
      from: points[index]!,
      to,
      axis: points[index]!.y === to.y ? "H" as const : "V" as const,
    }))
  })
  for (const axis of ["H", "V"] as const) {
    const distances: number[] = []
    for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
      const left = segments[leftIndex]!
      if (left.axis !== axis) continue
      for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex += 1) {
        const right = segments[rightIndex]!
        if (right.axis !== axis || right.edgeId === left.edgeId) continue
        const leftStart = axis === "H" ? left.from.x : left.from.y
        const leftEnd = axis === "H" ? left.to.x : left.to.y
        const rightStart = axis === "H" ? right.from.x : right.from.y
        const rightEnd = axis === "H" ? right.to.x : right.to.y
        const overlaps = Math.max(Math.min(leftStart, leftEnd), Math.min(rightStart, rightEnd)) <
          Math.min(Math.max(leftStart, leftEnd), Math.max(rightStart, rightEnd))
        if (!overlaps) continue
        const distance = axis === "H"
          ? Math.abs(left.from.y - right.from.y)
          : Math.abs(left.from.x - right.from.x)
        const leftEdge = edgesById.get(left.edgeId)!
        const rightEdge = edgesById.get(right.edgeId)!
        const relatedBundle = (
          leftEdge.source.nodeId === rightEdge.source.nodeId &&
          leftEdge.source.portId === rightEdge.source.portId
        ) || (
          leftEdge.target.nodeId === rightEdge.target.nodeId &&
          leftEdge.target.portId === rightEdge.target.portId
        )
        if (distance === 0 && relatedBundle) continue
        distances.push(distance)
      }
    }
    expect(distances.length).toBeGreaterThan(0)
    expect(Math.min(...distances)).toBeGreaterThanOrEqual(clearance)
  }
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
