import {layoutFixed, type FixedLayoutGraph} from "@nodes/layout/fixed"

export function layoutFixedConsumer(graph: FixedLayoutGraph): number {
  const result = layoutFixed(graph)
  return result.nodes.length + result.edges.length
}
