import {FixedNodeSystemCardLayouter} from "@nodes/ui/fixed-card-layout"
import type {NodeSystemDocument} from "nodes/types"

export function layoutFixedCardConsumer(document: NodeSystemDocument): number {
  return new FixedNodeSystemCardLayouter()
    .layout(document, {viewport: {width: 1_024, height: 768}})
    .nodes.length
}
