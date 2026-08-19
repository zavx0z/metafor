import {layoutAdaptive, type AdaptiveLayoutGraph} from "@nodes/layout/adaptive"

export function layoutAdaptiveConsumer(graph: AdaptiveLayoutGraph): number {
  const result = layoutAdaptive(graph)
  return result.nodes.length + result.edges.length
}
