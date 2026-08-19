import {NodeSystemSurface} from "@nodes/ui/surface"
import type {PositionedNodeSystemCard} from "@nodes/ui/card-model"

export function renderCustomPositionedConsumer(layout: PositionedNodeSystemCard): NodeSystemSurface {
  const surface = new NodeSystemSurface()
  surface.setLayout(layout)
  return surface
}
