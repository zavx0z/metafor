import {NodeSystemSurface} from "@nodes/ui/surface"
import type {PositionedNodeSystem} from "nodes/types"

export function renderCustomPositionedConsumer(layout: PositionedNodeSystem): NodeSystemSurface {
  const surface = new NodeSystemSurface()
  surface.setLayout(layout)
  return surface
}
