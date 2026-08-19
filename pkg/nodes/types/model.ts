export type NodeSystemPortDirection = "in" | "out" | "inout"
export type NodeSystemPortSide = "left" | "right"
/** Stable producer-owned semantic family shared by an edge and both sockets. */
export type NodeSystemConnectionType = string

export type NodeSystemPort = Readonly<{
  id: string
  /** Semantic capability; presentation anchors are owned by an adapter. */
  direction: NodeSystemPortDirection
  /** Determines socket color; never inferred from direction. */
  connectionType?: NodeSystemConnectionType
  /** Optional visual side; message direction remains independent. */
  side?: NodeSystemPortSide
}>

export type NodeSystemNode = Readonly<{
  id: string
  /**
   * Стабильная presentation identity для автоматической раскладки.
   * Domain `id` может обозначать сменяемое runtime-воплощение; `layoutId`
   * сохраняет тот же структурный слот между его последовательными incarnation.
   * Значение не отображается и не заменяет domain identity в actions/edges.
   */
  layoutId?: string
  /**
   * Optional visual containment. This is not an edge or a transport: the
   * producer remains responsible for the meaning of the relation.
   */
  parentId?: string
  order?: number
  ports?: readonly NodeSystemPort[]
}>

export type NodeSystemEndpoint = Readonly<{
  nodeId: string
  /** Every edge terminates at a socket owned by a concrete parameter. */
  portId: string
}>

export type NodeSystemEdge = Readonly<{
  id: string
  source: NodeSystemEndpoint
  target: NodeSystemEndpoint
  /** Must match both endpoint sockets when connection semantics are provided. */
  connectionType?: NodeSystemConnectionType
  order?: number
}>

/**
 * Immutable, structured-clone-safe input. Coordinates are deliberately absent:
 * they belong to the layout result, not to the producing architecture.
 */
export type NodeSystemDocument<
  TNode extends NodeSystemNode = NodeSystemNode,
  TEdge extends NodeSystemEdge = NodeSystemEdge,
> = Readonly<{
  revision?: string | number
  nodes: readonly TNode[]
  edges: readonly TEdge[]
}>

export type NodeSystemPoint = Readonly<{x: number; y: number}>
export type NodeSystemRect = Readonly<{x: number; y: number; w: number; h: number}>

export type PositionedNodeSystemPort<TPort extends NodeSystemPort = NodeSystemPort> = Readonly<{
  port: TPort
  /** Side selected by the layout policy; independent from the semantic constraint. */
  side: NodeSystemPortSide
  center: NodeSystemPoint
}>

export type PositionedNodeSystemNode<
  TNode extends NodeSystemNode = NodeSystemNode,
  TPort extends NodeSystemPort = NodeSystemPort,
> = Readonly<{
  node: TNode
  rect: NodeSystemRect
  ports: readonly PositionedNodeSystemPort<TPort>[]
}>

export type PositionedNodeSystemEdge<TEdge extends NodeSystemEdge = NodeSystemEdge> = Readonly<{
  edge: TEdge
  points: readonly NodeSystemPoint[]
}>

export type PositionedNodeSystem<
  TNode extends NodeSystemNode = NodeSystemNode,
  TPort extends NodeSystemPort = NodeSystemPort,
  TEdge extends NodeSystemEdge = NodeSystemEdge,
> = Readonly<{
  revision?: string | number
  /** Exact card/port measurement key used for this positioned geometry. */
  geometryKey?: string
  bounds: NodeSystemRect
  nodes: readonly PositionedNodeSystemNode<TNode, TPort>[]
  edges: readonly PositionedNodeSystemEdge<TEdge>[]
}>
