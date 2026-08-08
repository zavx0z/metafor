import {describe, expect, test} from "bun:test"
import type {PositionedNodeSystem} from "./model.ts"
import {
  LibavoidNodeSystemRouter,
  parseAndRouteNodeSystem,
  routePositionedNodeSystem,
} from "./server.ts"
import {
  createNodeSystemRouteRequest,
  NODE_SYSTEM_ROUTE_RESPONSE_KIND,
} from "./routing-contract.ts"

const obstacleLayout: PositionedNodeSystem = {
  revision: "route:1",
  geometryKey: "fixed-geometry",
  bounds: {x: 0, y: 0, w: 400, h: 120},
  nodes: [
    positionedNode("source", 0, 20, [{id: "out", direction: "out"}], [{x: 80, y: 50}]),
    positionedNode("obstacle", 140, 0, [], []),
    positionedNode("target", 280, 20, [{id: "in", direction: "in"}], [{x: 280, y: 50}]),
  ],
  edges: [{
    edge: {
      id: "across",
      source: {nodeId: "source", portId: "out"},
      target: {nodeId: "target", portId: "in"},
    },
    points: [{x: 80, y: 50}, {x: 280, y: 50}],
  }],
}

describe("server Libavoid node-system routing", () => {
  test("routes orthogonally around fixed nodes without moving any node", async () => {
    const routed = await routePositionedNodeSystem(obstacleLayout)
    expect(routed.nodes).toEqual(obstacleLayout.nodes)
    expect(routed.geometryKey).toBe(obstacleLayout.geometryKey)
    expect(routed.edges[0]!.points.length).toBeGreaterThan(2)
    for (const [left, right] of pairs(routed.edges[0]!.points)) {
      expect(left.x === right.x || left.y === right.y).toBe(true)
    }
  })

  test("serializes the shared WASM runtime and preserves the versioned envelope", async () => {
    const router = new LibavoidNodeSystemRouter()
    const [first, second] = await Promise.all([
      parseAndRouteNodeSystem(router, createNodeSystemRouteRequest(obstacleLayout)),
      parseAndRouteNodeSystem(router, createNodeSystemRouteRequest({...obstacleLayout, revision: "route:2"})),
    ])
    expect(first.kind).toBe(NODE_SYSTEM_ROUTE_RESPONSE_KIND)
    expect(second.layout.revision).toBe("route:2")
    expect(first.layout.nodes).toEqual(second.layout.nodes)
  })
})

function positionedNode(
  id: string,
  x: number,
  y: number,
  ports: readonly {id: string; direction: "in" | "out" | "inout"}[],
  centers: readonly {x: number; y: number}[],
) {
  const node = {id, title: id, width: 80, height: 60, ports}
  return {
    node,
    rect: {x, y, w: 80, h: 60},
    ports: ports.map((port, index) => ({port, center: centers[index]!})),
  }
}

function pairs<T>(items: readonly T[]): Array<readonly [T, T]> {
  return items.slice(1).map((item, index) => [items[index]!, item] as const)
}
