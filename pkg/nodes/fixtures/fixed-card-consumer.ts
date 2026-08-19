import {FixedNodeSystemCardLayouter} from "@nodes/ui/fixed-card-layout"
import type {NodeSystemCardPreset} from "@nodes/ui/card-model"

export function layoutFixedCardConsumer(document: NodeSystemCardPreset): number {
  return new FixedNodeSystemCardLayouter()
    .layout(document, {viewport: {width: 1_024, height: 768}})
    .nodes.length
}
