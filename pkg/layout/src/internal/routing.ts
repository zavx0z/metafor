/** Internal integer routing contract; public consumers use LayoutResult. */
export type FixedPoint = Readonly<{x: number; y: number}>
export type FixedRect = Readonly<{x: number; y: number; w: number; h: number}>
export type RouteDirection = "RIGHT" | "DOWN"
export type RoutePortSide = "WEST" | "EAST"
export type RoutePortDirection = "in" | "out"
export type RouteNode = Readonly<{id: string; parentId?: string; rect: FixedRect}>
export type RoutePort = Readonly<{id: string; nodeId: string; center: FixedPoint; side: RoutePortSide; direction: RoutePortDirection}>
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
export type RouteEdgeMetrics = Readonly<{edgeId: string; turns: number; manhattan: number; detour: number}>
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
  perEdge: readonly RouteEdgeMetrics[]
}>
export type RouteGraphResult = Readonly<{direction: RouteDirection; unitsPerPixel: number; sections: readonly RouteSection[]; metrics: RouteMetrics}>
export type RouteSearchRejection = "pointBlocked" | "segmentIllegal" | "sourceDirection" | "targetDirection" | "hierarchyTransition"
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
