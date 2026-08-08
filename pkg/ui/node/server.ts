import {
  routeEdges,
  type ElkGraph,
  type ElkPoint,
  type ElkPort,
  type LibavoidRoutingOptions,
} from "@mr_mint/elkjs-libavoid"
import type {
  NodeSystemPoint,
  PositionedNodeSystem,
  PositionedNodeSystemEdge,
  PositionedNodeSystemNode,
} from "./model.ts"
import {
  createNodeSystemRouteResponse,
  parseNodeSystemRouteRequest,
} from "./routing-contract.ts"
import {validatePositionedNodeSystem} from "./validation.ts"

export {
  createNodeSystemRouteResponse,
  parseNodeSystemRouteRequest,
} from "./routing-contract.ts"

export type LibavoidNodeSystemRouterOptions = Readonly<{
  routing?: LibavoidRoutingOptions
}>

/**
 * Bun/server-only adapter. Calls are serialized because the WASM module owns a
 * shared native runtime even though every request builds an isolated router.
 */
export class LibavoidNodeSystemRouter {
  #tail: Promise<void> = Promise.resolve()

  constructor(private readonly options: LibavoidNodeSystemRouterOptions = {}) {}

  route(layout: PositionedNodeSystem): Promise<PositionedNodeSystem> {
    const result = this.#tail.then(() => routePositionedNodeSystem(layout, this.options.routing))
    this.#tail = result.then(() => undefined, () => undefined)
    return result
  }
}

export async function routePositionedNodeSystem(
  layout: PositionedNodeSystem,
  options: LibavoidRoutingOptions = {},
): Promise<PositionedNodeSystem> {
  validatePositionedNodeSystem(layout)
  const graph = toLibavoidGraph(layout)
  const routes = await routeEdges(graph, {
    routingType: "orthogonal",
    shapeBufferDistance: 10,
    idealNudgingDistance: 8,
    portDirectionPenalty: 120,
    selfLoopHandling: "fallback",
    ...options,
  })
  const edges = layout.edges.map((entry): PositionedNodeSystemEdge => {
    const route = routes.get(entry.edge.id)
    if (route === undefined) throw new Error(`Libavoid omitted edge: ${entry.edge.id}`)
    return {
      edge: entry.edge,
      points: compactPoints([route.sourcePoint, ...route.bendPoints, route.targetPoint]),
    }
  })
  const result = {...layout, edges}
  validatePositionedNodeSystem(result)
  return result
}

export function parseAndRouteNodeSystem(
  router: LibavoidNodeSystemRouter,
  value: unknown,
): Promise<ReturnType<typeof createNodeSystemRouteResponse>> {
  const request = parseNodeSystemRouteRequest(value)
  return router.route(request.layout).then(createNodeSystemRouteResponse)
}

function toLibavoidGraph(layout: PositionedNodeSystem): ElkGraph {
  return {
    id: "node-system-root",
    children: layout.nodes.map(toLibavoidNode),
    edges: layout.edges.map(({edge}) => ({
      id: edge.id,
      source: edge.source.nodeId,
      target: edge.target.nodeId,
      ...(edge.source.portId === undefined ? {} : {sourcePort: libavoidPortId(edge.source.nodeId, edge.source.portId)}),
      ...(edge.target.portId === undefined ? {} : {targetPort: libavoidPortId(edge.target.nodeId, edge.target.portId)}),
    })),
  }
}

function toLibavoidNode(entry: PositionedNodeSystemNode) {
  return {
    id: entry.node.id,
    x: entry.rect.x,
    y: entry.rect.y,
    width: entry.rect.w,
    height: entry.rect.h,
    ports: entry.ports.map(({port, center}): ElkPort => ({
      id: libavoidPortId(entry.node.id, port.id),
      x: center.x - entry.rect.x - 0.5,
      y: center.y - entry.rect.y - 0.5,
      width: 1,
      height: 1,
      properties: {"elk.port.side": portSide(entry, center)},
    })),
  }
}

function portSide(entry: PositionedNodeSystemNode, center: NodeSystemPoint): "NORTH" | "EAST" | "SOUTH" | "WEST" {
  const localX = center.x - entry.rect.x
  const localY = center.y - entry.rect.y
  const distances = [
    {side: "WEST" as const, value: Math.abs(localX)},
    {side: "EAST" as const, value: Math.abs(entry.rect.w - localX)},
    {side: "NORTH" as const, value: Math.abs(localY)},
    {side: "SOUTH" as const, value: Math.abs(entry.rect.h - localY)},
  ]
  distances.sort((left, right) => left.value - right.value)
  return distances[0]!.side
}

function libavoidPortId(nodeId: string, portId: string): string {
  return `${nodeId}\u0000${portId}`
}

function compactPoints(points: readonly ElkPoint[]): readonly NodeSystemPoint[] {
  const result: NodeSystemPoint[] = []
  for (const point of points) {
    const previous = result.at(-1)
    if (previous?.x === point.x && previous.y === point.y) continue
    result.push({x: point.x, y: point.y})
  }
  if (result.length < 2) throw new Error("Libavoid returned an incomplete route")
  return result
}
