import type {
  NodeSystemEdge,
  NodeSystemNode,
  NodeSystemPort,
  PositionedNodeSystemEdge,
  PositionedNodeSystemNode,
} from "./model.ts"

/** Renderer viewport transform in logical pixels. */
export type NodeSystemCanvasTransform = Readonly<{x: number; y: number; scale: number}>
export type NodeSystemCanvasTransformLimits = Readonly<{minScale?: number; maxScale?: number}>
export type NodeSystemRenderPlan<
  TNode extends NodeSystemNode = NodeSystemNode,
  TPort extends NodeSystemPort = NodeSystemPort,
  TEdge extends NodeSystemEdge = NodeSystemEdge,
> = Readonly<{
  canvasTransform: NodeSystemCanvasTransform
  nodes: readonly PositionedNodeSystemNode<TNode, TPort>[]
  edges: readonly PositionedNodeSystemEdge<TEdge>[]
}>
