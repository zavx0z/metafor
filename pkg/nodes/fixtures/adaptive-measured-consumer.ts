import {layoutMeasuredNodeSystemAdaptive} from "nodes/adaptive-layout"
import type {MeasuredNodeSystem} from "nodes/types"

export function layoutAdaptiveMeasuredConsumer(measured: MeasuredNodeSystem): number {
  return layoutMeasuredNodeSystemAdaptive(
    measured,
    {viewport: {width: 1_024, height: 768}},
  ).nodes.length
}
