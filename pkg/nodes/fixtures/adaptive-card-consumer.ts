import {AdaptiveNodeSystemCardLayouter} from "@nodes/ui/adaptive-card-layout"
import type {NodeSystemCardPreset} from "@nodes/ui/card-model"

export function layoutAdaptiveCardConsumer(document: NodeSystemCardPreset): number {
  return new AdaptiveNodeSystemCardLayouter()
    .layout(document, {viewport: {width: 1_024, height: 768}})
    .nodes.length
}
