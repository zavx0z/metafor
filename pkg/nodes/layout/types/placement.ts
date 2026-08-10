import type {FixedRect, RouteDirection, RouteEdge, RouteGraphInput, RouteNode, RoutePort, RoutePortDirection, RoutePortSide} from "./routing.ts"

/** Internal integer solver contract; never crosses the package boundary. */

export type IntrinsicNode = Readonly<{
  id: string
  parentId?: string
  size: Readonly<{w: number; h: number}>
  contentHeight: number
}>
export type IntrinsicPort = Readonly<{id: string; nodeId: string; offsetY: number; side: RoutePortSide; direction: RoutePortDirection}>
export type PlacementInput = Readonly<{
  unitsPerPixel: number
  clearance: number
  viewport: Readonly<{width: number; height: number}>
  padding: number
  nodeSpacing: number
  layerSpacing: number
  outerPadding: number
  nodes: readonly IntrinsicNode[]
  ports: readonly IntrinsicPort[]
  edges: readonly RouteEdge[]
}>
export type PlacementMetrics = Readonly<{
  direction: RouteDirection
  width: number
  height: number
  fitScale: number
  displayEmptyRatio: number
  compoundEmptyRatio: number
  maxCompoundEmptyRatio: number
  sourceCorridorDeficit: number
  hardViolations: readonly string[]
}>
export type PlacementResult = Readonly<{
  direction: RouteDirection
  nodes: readonly RouteNode[]
  ports: readonly RoutePort[]
  bounds: FixedRect
  metrics: PlacementMetrics
  routeInput: RouteGraphInput
}>

export type Size = Readonly<{w: number; h: number}>
export type LocalPlacement = Readonly<{
  size: Size
  childOffsets: ReadonlyMap<string, Readonly<{x: number; y: number}>>
}>
export type ChildRelation = Readonly<{
  edgeId: string
  sourceChild: string
  targetChild: string
  sourcePort: IntrinsicPort
  targetPort: IntrinsicPort
}>
export type RankResult = Readonly<{
  ranks: ReadonlyMap<string, number>
  order: readonly string[]
  backwardSources: ReadonlySet<string>
  relations: readonly ChildRelation[]
}>
export type PackingPolicy =
  | Readonly<{kind: "LAYERED"; reserveCorridors: boolean}>
  | Readonly<{
    kind: "PORTRAIT_FLOW"
    rootWidthPermille: number
    nestedWidthPermille: number
    compactSources: boolean
  }>
