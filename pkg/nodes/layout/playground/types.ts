import type {LayoutResult} from "@nodes/layout"
import type {AdaptiveLayoutGraph} from "@nodes/layout/adaptive"

export type PlaygroundOrientation = "RIGHT" | "DOWN"

export type PlaygroundFixture = Readonly<{
  id: string
  family: string
  label: string
  description: string
  expectedDirection: PlaygroundOrientation
  graph: AdaptiveLayoutGraph
}>

export type PlaygroundPolicyOutcome = Readonly<{
  result: LayoutResult
  diagnostics: unknown
}>

export type PlaygroundPolicy = Readonly<{
  id: string
  label: string
  description: string
  run(graph: AdaptiveLayoutGraph): PlaygroundPolicyOutcome
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
  input: AdaptiveLayoutGraph
  result: LayoutResult
  policyDiagnostics: unknown
  metrics: PlaygroundMetrics
  svg: string
}>
