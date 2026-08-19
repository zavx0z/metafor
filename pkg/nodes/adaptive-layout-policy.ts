import type {AdaptiveLayoutPort} from "@nodes/layout/adaptive"
import type {MeasuredLayoutPortContext} from "./measured-layout.ts"

/** Resolves only adaptive capability/constraint fields over shared measurement. */
export function projectAdaptiveMeasuredPort(
  context: MeasuredLayoutPortContext,
): AdaptiveLayoutPort {
  return {
    id: context.id,
    nodeId: context.layoutNodeId,
    y: context.offsetY,
    capability: context.port.direction,
    allowedSides: context.port.side === "left"
      ? ["WEST"]
      : context.port.side === "right"
        ? ["EAST"]
        : ["WEST", "EAST"],
  }
}
