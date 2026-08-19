import type {
  LayoutGraph,
  LayoutResult,
  ResolvedLayoutGraph,
} from "../types/protocol.ts"
import {layoutResolved} from "./layout.ts"

/** Input accepted by the fixed source-EAST/target-WEST policy. */
export type FixedLayoutGraph = LayoutGraph

/** Geometry returned by the fixed policy, including each resolved port side. */
export type FixedLayoutResult = LayoutResult

/**
 * Applies the fixed endpoint law and runs the shared placement/routing core.
 *
 * Edge source/target are topology roles in this minimal protocol. The fixed
 * policy resolves every source port to `EAST` and every target port to `WEST`.
 * A port used in both roles is rejected before the common solver is entered.
 */
export function layoutFixed(graph: FixedLayoutGraph): FixedLayoutResult {
  return layoutResolved(resolveFixedLayoutGraph(graph))
}

/** Converts the compatibility fixed graph into policy-neutral resolved input. */
export function resolveFixedLayoutGraph(graph: FixedLayoutGraph): ResolvedLayoutGraph {
  const portById = new Map(graph.ports.map((port) => [port.id, port]))
  if (portById.size !== graph.ports.length) throw new Error("Layout port ids must be globally unique")
  const sides = new Map<string, "WEST" | "EAST">()
  for (const edge of graph.edges) {
    setPortSide(sides, edge.sourcePortId, "EAST", edge.id)
    setPortSide(sides, edge.targetPortId, "WEST", edge.id)
    if (!portById.has(edge.sourcePortId)) throw new Error(`Unknown source port: ${edge.id}/${edge.sourcePortId}`)
    if (!portById.has(edge.targetPortId)) throw new Error(`Unknown target port: ${edge.id}/${edge.targetPortId}`)
  }
  return {
    ...graph,
    ports: graph.ports.flatMap((port) => {
      const side = sides.get(port.id)
      return side === undefined ? [] : [{...port, side}]
    }),
  }
}

function setPortSide(
  sides: Map<string, "WEST" | "EAST">,
  portId: string,
  side: "WEST" | "EAST",
  edgeId: string,
): void {
  const previous = sides.get(portId)
  if (previous !== undefined && previous !== side) {
    throw new Error(`Port has conflicting edge roles: ${edgeId}/${portId}`)
  }
  sides.set(portId, side)
}
