/** Internal integer routing contract; public consumers use LayoutResult. */
export type FixedPoint = Readonly<{x: number; y: number}>
export type FixedRect = Readonly<{x: number; y: number; w: number; h: number}>
export type RouteDirection = "RIGHT" | "DOWN"
export type RoutePortSide = "WEST" | "EAST"
export type RouteNode = Readonly<{
  id: string
  parentId?: string
  rect: FixedRect
  /** Own intrinsic card band; children occupy only the remaining compound area. */
  contentRect?: FixedRect
}>
/** Endpoint side already resolved by the owning layout policy. */
export type RoutePort = Readonly<{id: string; nodeId: string; center: FixedPoint; side: RoutePortSide}>
export type RouteEdge = Readonly<{id: string; sourcePortId: string; targetPortId: string}>
export type RouteGraphInput = Readonly<{
  direction: RouteDirection
  unitsPerPixel: number
  clearance: number
  bounds: FixedRect
  viewport: Readonly<{width: number; height: number}>
  nodes: readonly RouteNode[]
  ports: readonly RoutePort[]
  edges: readonly RouteEdge[]
}>
export type RouteSection = Readonly<{edgeId: string; startPoint: FixedPoint; bendPoints: readonly FixedPoint[]; endPoint: FixedPoint}>
export type RouteEdgeMetrics = Readonly<{edgeId: string; crossings: number; turns: number; manhattan: number; detour: number}>
export type RouteMetrics = Readonly<{
  hardViolations: readonly string[]
  totalTurns: number
  maxTurns: number
  totalManhattan: number
  maxManhattan: number
  maxDetour: number
  fitScale: number
  compoundEmptyRatio: number
  clearanceVariance: number
  crossings: number
  maxCrossings: number
  perEdge: readonly RouteEdgeMetrics[]
}>
export type RouteGraphResult = Readonly<{direction: RouteDirection; unitsPerPixel: number; sections: readonly RouteSection[]; metrics: RouteMetrics}>
export type RouteSearchRejection = "pointBlocked" | "segmentIllegal" | "sourceDirection" | "targetDirection" | "hierarchyTransition"

export type Axis = "H" | "V"
export type StepDirection = "WEST" | "NORTH" | "SOUTH" | "EAST"
export type SearchState = Readonly<{
  xi: number
  yi: number
  lastDirection: StepDirection | null
  sourceExited: number
  targetEntered: number
  sourceGatewayY: number | null
  targetGatewayY: number | null
}>
export type Score = Readonly<{crossings: number; turns: number; length: number}>
export type HeapItem = Readonly<{
  state: SearchState
  score: Score
  estimatedTurns: number
  estimatedLength: number
}>
export type ParallelClearanceBlock = Readonly<{
  priorEdgeId: string
  candidateSegment: Readonly<{from: FixedPoint; to: FixedPoint}>
  blockingSegment: Readonly<{from: FixedPoint; to: FixedPoint}>
  axis: Axis
  distance: number
  overlap: number
}>
export type TerminalReservation = Readonly<{
  edgeId: string
  portId: string
  kind: "SOURCE" | "TARGET"
  from: FixedPoint
  to: FixedPoint
}>
export type RoutedSegment = Readonly<{
  priorEdgeId: string
  from: FixedPoint
  to: FixedPoint
}>
export type SearchTrace = {
  xs: number[]
  ys: number[]
  reachableStates: number
  reachableFrontier: unknown[]
  rejectedTransitions: Record<RouteSearchRejection, number>
  firstRejectedHierarchyTransition: unknown | null
  pointBlocks: unknown[]
  pointBlockKeys: Set<string>
  parallelClearanceBlocks: ParallelClearanceBlock[]
  parallelClearanceBlockKeys: Set<string>
}
export type RouteIndex = Readonly<{
  nodes: ReadonlyMap<string, RouteNode>
  ports: ReadonlyMap<string, RoutePort>
  parentByChild: ReadonlyMap<string, string>
  childrenByParent: ReadonlyMap<string, readonly RouteNode[]>
  sortedNodes: readonly RouteNode[]
  sortedEdges: readonly RouteEdge[]
}>
export type EdgeContext = Readonly<{
  edge: RouteEdge
  source: RoutePort
  target: RoutePort
  sourcePortal: FixedPoint
  targetPortal: FixedPoint
  sourceChain: readonly RouteNode[]
  targetChain: readonly RouteNode[]
  owner: RouteNode | null
  area: FixedRect
  obstacles: readonly RouteNode[]
  inflatedObstacles: readonly Readonly<{node: RouteNode; rect: FixedRect}>[]
  terminalReservations: readonly TerminalReservation[]
}>

export type RouteGraphDiagnostic =
  | Readonly<{status: "ROUTABLE"}>
  | Readonly<{status: "INPUT_INVALID"; error: string}>
  | Readonly<{
    status: "NO_LEGAL_ROUTE"
    error: string
    witness: Readonly<{
      edge: RouteEdge
      endpoints: Readonly<{source: RoutePort; target: RoutePort; sourcePortal: FixedPoint; targetPortal: FixedPoint}>
      ancestors: Readonly<{source: readonly string[]; target: readonly string[]; sourceChain: readonly string[]; targetChain: readonly string[]; owner: string | null}>
      candidateAxes: Readonly<{xs: readonly number[]; ys: readonly number[]}>
      reachableStates: number
      reachableFrontier: readonly unknown[]
      rejectedTransitions: Readonly<Record<RouteSearchRejection, number>>
      firstRejectedHierarchyTransition: unknown | null
      pointBlocks: readonly unknown[]
      parallelClearanceBlocks: readonly unknown[]
      blockingRectangles: readonly unknown[]
    }>
  }>
