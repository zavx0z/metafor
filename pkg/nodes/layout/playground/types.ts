import type {LayoutGraph, LayoutResult} from "@nodes/layout"

export type PlaygroundOrientation = "RIGHT" | "DOWN"

export type PlaygroundFixture = Readonly<{
  id: string
  family: string
  label: string
  description: string
  expectedDirection: PlaygroundOrientation
  graph: LayoutGraph
}>

export type PlaygroundPolicy = Readonly<{
  id: string
  label: string
  description: string
  run(graph: LayoutGraph): LayoutResult
}>

export type PlaygroundMetrics = Readonly<{
  direction: LayoutResult["direction"]
  durationMs: number
  nodeCount: number
  compoundCount: number
  portCount: number
  edgeCount: number
  bendCount: number
  gatewayCount: number
  totalManhattan: number
  bounds: LayoutResult["bounds"]
}>

export type PlaygroundRun = Readonly<{
  policyId: string
  input: LayoutGraph
  result: LayoutResult
  metrics: PlaygroundMetrics
  svg: string
}>
