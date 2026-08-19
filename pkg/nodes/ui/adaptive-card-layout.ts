import {
  AdaptiveLayoutError,
  layoutAdaptive,
  type AdaptiveLayoutGraph,
  type AdaptiveLayoutPort,
} from "@nodes/layout/adaptive"
import {
  layoutNodeSystemCardSync,
  type NodeSystemCardLayoutOptions,
  type NodeSystemCardLayoutPolicy,
  type NodeSystemCardLayoutRequest,
} from "./card-layout-adapter.ts"
import type {NodeSystemCardPreset, PositionedNodeSystemCard} from "./card-model.ts"
import {projectAdaptiveMeasuredPort} from "nodes/adaptive-layout"

export type AdaptiveNodeSystemCardLayoutOptions = NodeSystemCardLayoutOptions
export type AdaptiveNodeSystemCardLayoutRequest = NodeSystemCardLayoutRequest

const adaptiveCardPolicy: NodeSystemCardLayoutPolicy<AdaptiveLayoutPort> = {
  projectPort: projectAdaptiveMeasuredPort,
  layout: (graph) => layoutAdaptive(graph as AdaptiveLayoutGraph),
  isRecoverableError: (error) => error instanceof AdaptiveLayoutError,
}

/** Measures Card presentation, selects adaptive sides and materializes exact sockets. */
export class AdaptiveNodeSystemCardLayouter {
  constructor(private readonly options: AdaptiveNodeSystemCardLayoutOptions = {}) {}

  layout(
    document: NodeSystemCardPreset,
    request: AdaptiveNodeSystemCardLayoutRequest,
  ): PositionedNodeSystemCard {
    return layoutNodeSystemCardSync(document, request, this.options, adaptiveCardPolicy)
  }
}
