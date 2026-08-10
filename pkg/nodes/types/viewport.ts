import type {PositionedNodeSystemEdge, PositionedNodeSystemNode} from "./model.ts"

/** Renderer viewport transform in logical pixels. */
export type NodeSystemCanvasTransform = Readonly<{x: number; y: number; scale: number}>
export type NodeSystemCanvasTransformLimits = Readonly<{minScale?: number; maxScale?: number}>
export type NodeSystemRenderPlan = Readonly<{
  canvasTransform: NodeSystemCanvasTransform
  nodes: readonly PositionedNodeSystemNode[]
  edges: readonly PositionedNodeSystemEdge[]
}>
