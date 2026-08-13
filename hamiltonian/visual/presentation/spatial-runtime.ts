import type {UiRuntimeViewPointSnapshot} from "@ui/elements"

type HamiltonianSceneNodeLike = Readonly<{parent: unknown}>

export type HamiltonianSpatialRuntimeLike = Readonly<{
  space: unknown
  hud: unknown
  display: HamiltonianSceneNodeLike | null
  viewPointSnapshot(): UiRuntimeViewPointSnapshot
}>

export type HamiltonianSpatialSurfaceLike = Readonly<{
  node: HamiltonianSceneNodeLike
}>

export type HamiltonianSpatialRuntimeSnapshot = Readonly<{
  valid: boolean
  displayInSpace: boolean
  graphInDisplay: boolean
  inspectorInHud: boolean
  canvasControlsInHud: boolean
  tree: "Space>UIDisplay>graph;HUD>inspector,canvas-controls" | "invalid"
  viewPoint: UiRuntimeViewPointSnapshot
}>

/** Read-only evidence from the actual engine object tree, not declared labels. */
export function captureHamiltonianSpatialRuntime(
  runtime: HamiltonianSpatialRuntimeLike,
  graph: HamiltonianSpatialSurfaceLike,
  inspector: HamiltonianSpatialSurfaceLike,
  canvasControls: HamiltonianSpatialSurfaceLike,
): HamiltonianSpatialRuntimeSnapshot {
  const displayInSpace = runtime.display !== null && runtime.display.parent === runtime.space
  const graphInDisplay = runtime.display !== null && graph.node.parent === runtime.display
  const inspectorInHud = inspector.node.parent === runtime.hud
  const canvasControlsInHud = canvasControls.node.parent === runtime.hud
  const valid = displayInSpace && graphInDisplay && inspectorInHud && canvasControlsInHud
  return {
    valid,
    displayInSpace,
    graphInDisplay,
    inspectorInHud,
    canvasControlsInHud,
    tree: valid ? "Space>UIDisplay>graph;HUD>inspector,canvas-controls" : "invalid",
    viewPoint: runtime.viewPointSnapshot(),
  }
}

export function serializeHamiltonianViewPoint(snapshot: UiRuntimeViewPointSnapshot): string {
  return JSON.stringify(snapshot)
}
