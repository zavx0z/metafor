import {
  layoutAdaptive,
  layoutAdaptiveWithDiagnostics,
  type AdaptiveLayoutDiagnostics,
  type AdaptiveLayoutPort,
} from "@nodes/layout/adaptive"
import type {
  MeasuredNodeSystem,
  NodeSystemDocument,
  PositionedNodeSystem,
} from "nodes/types"
import {
  materializeMeasuredNodeSystemLayout,
  prepareMeasuredNodeSystemLayout,
  type MeasuredNodeSystemLayoutOptions,
  type MeasuredNodeSystemLayoutRequest,
  type PreparedMeasuredNodeSystemLayout,
} from "./measured-layout.ts"
import {projectAdaptiveMeasuredPort} from "./adaptive-layout-policy.ts"

export {projectAdaptiveMeasuredPort} from "./adaptive-layout-policy.ts"

export type AdaptiveMeasuredNodeSystemLayoutOptions = MeasuredNodeSystemLayoutOptions
export type AdaptiveMeasuredNodeSystemLayoutRequest = MeasuredNodeSystemLayoutRequest

export type AdaptiveMeasuredNodeSystemLayoutOutcome = Readonly<{
  positioned: PositionedNodeSystem
  diagnostics: AdaptiveLayoutDiagnostics
}>

/** Layouts any normalized measured presentation without importing Card or WebGPU. */
export function layoutMeasuredNodeSystemAdaptive(
  measured: MeasuredNodeSystem,
  request: AdaptiveMeasuredNodeSystemLayoutRequest,
  options: AdaptiveMeasuredNodeSystemLayoutOptions = {},
): PositionedNodeSystem {
  const prepared = prepareAdaptiveMeasuredNodeSystemLayout(
    measuredDocument(measured),
    measured,
    request,
    options,
  )
  return materializeMeasuredNodeSystemLayout(prepared, layoutAdaptive(prepared.graph))
}

/** Diagnostic variant for playgrounds and benchmarks over the same public policy. */
export function layoutMeasuredNodeSystemAdaptiveWithDiagnostics(
  measured: MeasuredNodeSystem,
  request: AdaptiveMeasuredNodeSystemLayoutRequest,
  options: AdaptiveMeasuredNodeSystemLayoutOptions = {},
): AdaptiveMeasuredNodeSystemLayoutOutcome {
  const prepared = prepareAdaptiveMeasuredNodeSystemLayout(
    measuredDocument(measured),
    measured,
    request,
    options,
  )
  const outcome = layoutAdaptiveWithDiagnostics(prepared.graph)
  return {
    positioned: materializeMeasuredNodeSystemLayout(prepared, outcome.result),
    diagnostics: outcome.diagnostics,
  }
}

/** Applies the shared identity projection to a presentation-independent measured graph. */
function prepareAdaptiveMeasuredNodeSystemLayout(
  document: NodeSystemDocument,
  measured: MeasuredNodeSystem,
  request: AdaptiveMeasuredNodeSystemLayoutRequest,
  options: AdaptiveMeasuredNodeSystemLayoutOptions,
): PreparedMeasuredNodeSystemLayout<NodeSystemDocument["nodes"][number], NodeSystemDocument["edges"][number], AdaptiveLayoutPort> {
  return prepareMeasuredNodeSystemLayout(
    document,
    measured,
    request,
    options,
    projectAdaptiveMeasuredPort,
  )
}

function measuredDocument(measured: MeasuredNodeSystem): NodeSystemDocument {
  return {
    ...(measured.revision === undefined ? {} : {revision: measured.revision}),
    nodes: measured.nodes.map(({node}) => node),
    edges: measured.edges,
  }
}
