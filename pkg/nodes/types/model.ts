/** Visual state owned by the node-system presentation model. */
export type NodeSystemTone = "neutral" | "live" | "paused" | "warn"

export type NodeSystemPortDirection = "in" | "out" | "inout"
export type NodeSystemPortSide = "left" | "right"

export type NodeSystemPort = Readonly<{
  id: string
  /** Parameter row that owns and visually contains this socket. */
  parameterId: string
  direction: NodeSystemPortDirection
  /** Optional visual side; message direction remains independent. */
  side?: NodeSystemPortSide
}>

export type NodeSystemFact = Readonly<{
  id: string
  label: string
  value: string
  tone?: NodeSystemTone
}>

/** Serializable action description. Execution remains owned by the producer. */
export type NodeSystemAction = Readonly<{
  id: string
  label: string
  enabled?: boolean
  tone?: NodeSystemTone
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
  title: string
  kind?: string
  summary?: string
  tone?: NodeSystemTone
  order?: number
  /** Minimum requested width; the shared card metric may expand it. */
  width?: number
  /** Minimum requested height; the shared card metric may expand it. */
  height?: number
  ports?: readonly NodeSystemPort[]
  facts?: readonly NodeSystemFact[]
  actions?: readonly NodeSystemAction[]
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
  label?: string
  tone?: NodeSystemTone
  order?: number
}>

/**
 * Immutable, structured-clone-safe input. Coordinates are deliberately absent:
 * they belong to the layout result, not to the producing architecture.
 */
export type NodeSystemDocument = Readonly<{
  revision?: string | number
  nodes: readonly NodeSystemNode[]
  edges: readonly NodeSystemEdge[]
}>

export type NodeSystemPoint = Readonly<{x: number; y: number}>
export type NodeSystemRect = Readonly<{x: number; y: number; w: number; h: number}>

export type PositionedNodeSystemPort = Readonly<{
  port: NodeSystemPort
  center: NodeSystemPoint
}>

export type PositionedNodeSystemNode = Readonly<{
  node: NodeSystemNode
  rect: NodeSystemRect
  ports: readonly PositionedNodeSystemPort[]
}>

export type PositionedNodeSystemEdge = Readonly<{
  edge: NodeSystemEdge
  points: readonly NodeSystemPoint[]
}>

export type PositionedNodeSystem = Readonly<{
  revision?: string | number
  /** Exact card/port measurement key used for this positioned geometry. */
  geometryKey?: string
  bounds: NodeSystemRect
  nodes: readonly PositionedNodeSystemNode[]
  edges: readonly PositionedNodeSystemEdge[]
}>
