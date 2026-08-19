import type {NodeSystemEdge, NodeSystemNode, NodeSystemPort} from "./model.ts"

/** Numeric anchor produced by a presentation adapter for one semantic port. */
export type MeasuredNodeSystemPort = Readonly<{
  port: NodeSystemPort
  /** Logical-pixel offset from the measured node's top boundary. */
  offsetY: number
}>

/** Intrinsic geometry of one semantic node, independent from presentation content. */
export type MeasuredNodeSystemNode = Readonly<{
  node: NodeSystemNode
  width: number
  height: number
  /** Bottom boundary of occupied own content, excluding decorative padding. */
  contentHeight: number
  ports: readonly MeasuredNodeSystemPort[]
}>

/**
 * Normalized structured-clone-safe boundary between presentation measurement
 * and layout policies. It deliberately contains no Card, text, DOM or renderer state.
 */
export type MeasuredNodeSystem = Readonly<{
  revision?: string | number
  geometryKey: string
  nodes: readonly MeasuredNodeSystemNode[]
  edges: readonly NodeSystemEdge[]
}>
