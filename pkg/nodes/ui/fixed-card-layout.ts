import type {LayoutPort} from "@nodes/layout"
import {layoutFixed, type FixedLayoutGraph} from "@nodes/layout/fixed"
import type {LayoutWorkerClient} from "nodes/layout-worker"
import {memoizedTextMeasurer} from "./card-layout.ts"
import {
  canonicalizeConnectedNodeSystemCardFacts,
  compareRoutingObjective,
  isRecoverableLayoutError,
  layoutNodeSystemCardSync,
  materializeNodeSystemCardLayoutPass,
  nodeSystemCardPortFactOrderCandidates,
  orderNodeSystemCardPortFactsForLayout,
  prepareNodeSystemCardLayoutPass,
  type NodeSystemCardLayoutOptions,
  type NodeSystemCardLayoutPass,
  type NodeSystemCardLayoutPolicy,
  type NodeSystemCardLayoutRequest,
} from "./card-layout-adapter.ts"
import type {
  NodeSystemCardPreset,
  PositionedNodeSystemCard,
} from "./card-model.ts"
import type {MeasuredLayoutPortContext} from "nodes/measured-layout"

/** Options for the fixed-port card presentation adapter. */
export type FixedNodeSystemCardLayoutOptions = NodeSystemCardLayoutOptions
export type FixedNodeSystemCardLayoutRequest = NodeSystemCardLayoutRequest

const fixedCardPolicy: NodeSystemCardLayoutPolicy<LayoutPort> = {
  projectPort: projectFixedMeasuredPort,
  layout: (graph) => layoutFixed(graph as FixedLayoutGraph),
}

/** Measures fixed-port cards and materializes their complete UI geometry. */
export class FixedNodeSystemCardLayouter {
  constructor(private readonly options: FixedNodeSystemCardLayoutOptions = {}) {}

  layout(
    document: NodeSystemCardPreset,
    request: FixedNodeSystemCardLayoutRequest,
  ): PositionedNodeSystemCard {
    return layoutNodeSystemCardSync(document, request, this.options, fixedCardPolicy)
  }
}

/**
 * Product adapter: measurement stays on main thread, while both placement and
 * routing run through the minimal fixed {@link LayoutWorkerClient} protocol.
 */
export class FixedNodeSystemCardWorkerLayouter {
  constructor(
    private readonly worker: LayoutWorkerClient,
    private readonly options: FixedNodeSystemCardLayoutOptions = {},
  ) {}

  async layout(
    document: NodeSystemCardPreset,
    request: FixedNodeSystemCardLayoutRequest,
    generation: number,
  ): Promise<PositionedNodeSystemCard> {
    const measureText = memoizedTextMeasurer(this.options.measureText)
    const canonicalDocument = canonicalizeConnectedNodeSystemCardFacts(document)
    const first = await this.layoutPass(canonicalDocument, request, measureText, generation)
    let best = first
    for (const candidate of nodeSystemCardPortFactOrderCandidates(canonicalDocument, first)) {
      try {
        const ordered = await this.layoutPass(candidate, request, measureText, generation)
        if (compareRoutingObjective(ordered.result, best.result) < 0) best = ordered
      } catch (error) {
        if (isRecoverableLayoutError(error)) continue
        throw error
      }
    }
    return best.positioned
  }

  private async layoutPass(
    document: NodeSystemCardPreset,
    request: FixedNodeSystemCardLayoutRequest,
    measureText: FixedNodeSystemCardLayoutOptions["measureText"],
    generation: number,
  ): Promise<NodeSystemCardLayoutPass> {
    const prepared = prepareNodeSystemCardLayoutPass(
      document,
      request,
      this.options,
      measureText,
      projectFixedMeasuredPort,
    )
    const response = await this.worker.layout({generation, graph: prepared.graph})
    return materializeNodeSystemCardLayoutPass(prepared, response.result)
  }
}

/** Compatibility name for the policy-neutral Card row-anchor ordering helper. */
export const orderFixedNodeSystemCardPortFactsForLayout = orderNodeSystemCardPortFactsForLayout

function projectFixedMeasuredPort(context: MeasuredLayoutPortContext): LayoutPort {
  const actualSide = context.port.side ?? (context.port.direction === "in" ? "left" : "right")
  for (const {edgeId, role} of context.roles) {
    if (role === "source" && (context.port.direction !== "out" || actualSide !== "right")) {
      throw new Error(`source must be out/EAST: ${edgeId}`)
    }
    if (role === "target" && (context.port.direction !== "in" || actualSide !== "left")) {
      throw new Error(`target must be in/WEST: ${edgeId}`)
    }
  }
  return {
    id: context.id,
    nodeId: context.layoutNodeId,
    y: context.offsetY,
  }
}
