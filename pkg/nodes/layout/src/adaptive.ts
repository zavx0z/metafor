import type {
  LayoutEdge,
  LayoutGraph,
  LayoutPort,
  LayoutPortSide,
  LayoutResult,
  ResolvedLayoutGraph,
} from "../types/protocol.ts"
import {
  compareResolvedLayoutEvaluations,
  evaluateResolvedLayout,
  type ResolvedLayoutEvaluation,
} from "./layout.ts"

/** Semantic socket capability supplied by the presentation/measurement adapter. */
export type AdaptivePortCapability = "in" | "out" | "inout"

/** Measured socket plus the sides that the adaptive policy may choose. */
export type AdaptiveLayoutPort = Readonly<LayoutPort & {
  capability: AdaptivePortCapability
  allowedSides: readonly LayoutPortSide[]
}>

/** Numeric graph accepted by the independent adaptive policy. */
export type AdaptiveLayoutGraph = Readonly<Omit<LayoutGraph, "ports"> & {
  ports: readonly AdaptiveLayoutPort[]
}>

export type AdaptiveSideAssignment = Readonly<{
  portId: string
  side: LayoutPortSide
}>

export type AdaptiveLayoutDiagnostics = Readonly<{
  candidateBudget: number
  theoreticalCandidateCount: string
  fixedPortCount: number
  dynamicPortCount: number
  generatedCandidates: number
  attemptedCandidates: number
  routableCandidates: number
  rejectedCandidates: number
  selectedSides: readonly AdaptiveSideAssignment[]
}>

export type AdaptiveLayoutOutcome = Readonly<{
  result: LayoutResult
  diagnostics: AdaptiveLayoutDiagnostics
}>

export type AdaptiveCandidateFailure = Readonly<{
  sides: readonly AdaptiveSideAssignment[]
  error: string
}>

export type AdaptiveNoLegalSideWitness = Readonly<{
  code: "NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT"
  reason: "PORT_HAS_NO_ALLOWED_SIDE" | "CAPABILITY_ROLE_CONFLICT" | "NO_ROUTABLE_ASSIGNMENT"
  candidateBudget: number
  theoreticalCandidateCount: string
  dynamicPortIds: readonly string[]
  portId?: string
  edgeId?: string
  role?: "source" | "target"
  attempts: readonly AdaptiveCandidateFailure[]
}>

/** Machine-readable failure for an adaptive graph with no legal side assignment. */
export class AdaptiveLayoutError extends Error {
  readonly code = "NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT"

  constructor(readonly witness: AdaptiveNoLegalSideWitness) {
    super(`${witness.code}: ${witness.reason}`)
    this.name = "AdaptiveLayoutError"
  }
}

/** Hard upper bound for common-solver calls made by one adaptive request. */
export const ADAPTIVE_CANDIDATE_BUDGET = 16

/** Selects sides and returns only the common public geometry contract. */
export function layoutAdaptive(graph: AdaptiveLayoutGraph): LayoutResult {
  return layoutAdaptiveWithDiagnostics(graph).result
}

/**
 * Selects one side per exact socket with a bounded deterministic search.
 * Fixed one-side constraints are removed from the search dimension; dynamic
 * ports are ordered only by semantic ID and share one assignment across every
 * edge that references them.
 */
export function layoutAdaptiveWithDiagnostics(graph: AdaptiveLayoutGraph): AdaptiveLayoutOutcome {
  const normalized = normalizeAdaptiveGraph(graph)
  const dynamicPorts = normalized.ports
    .filter(({allowedSides}) => allowedSides.length === 2)
    .sort((left, right) => compareIds(left.id, right.id))
  const dynamicPortIds = dynamicPorts.map(({id}) => id)
  const theoreticalCandidateCount = (1n << BigInt(dynamicPorts.length)).toString()
  const roleByPort = collectPortRoles(normalized.edges)
  validateCapabilities(normalized.ports, roleByPort, dynamicPortIds, theoreticalCandidateCount)

  const search = createCandidateSearch(dynamicPorts, roleByPort)
  const attempted: CandidateAttempt[] = []
  const routable: RoutableCandidate[] = []
  const expanded = new Set<string>()

  while (attempted.length < ADAPTIVE_CANDIDATE_BUDGET) {
    if (search.pending.length === 0) {
      const anchors = candidateExpansionOrder(routable, attempted)
        .filter(({key}) => !expanded.has(key))
        .slice(0, 4)
      if (anchors.length === 0) break
      for (const anchor of anchors) {
        expanded.add(anchor.key)
        for (let index = 0; index < dynamicPorts.length; index += 1) {
          if (search.seen.size >= ADAPTIVE_CANDIDATE_BUDGET) break
          search.add(flipSide(anchor.sides, index))
        }
      }
      if (search.pending.length === 0) continue
    }

    const sides = search.pending.shift()!
    const key = assignmentKey(sides)
    const resolved = resolveAdaptiveCandidate(normalized, dynamicPortIds, sides)
    try {
      const evaluation = evaluateResolvedLayout(resolved)
      const candidate = {key, sides, evaluation}
      attempted.push(candidate)
      routable.push(candidate)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("NO_LEGAL_LAYOUT")) throw error
      attempted.push({key, sides, error: error.message})
    }
  }

  if (routable.length === 0) {
    throw new AdaptiveLayoutError({
      code: "NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT",
      reason: "NO_ROUTABLE_ASSIGNMENT",
      candidateBudget: ADAPTIVE_CANDIDATE_BUDGET,
      theoreticalCandidateCount,
      dynamicPortIds,
      attempts: attempted.map((candidate) => ({
        sides: materializeAssignment(dynamicPortIds, candidate.sides),
        error: "error" in candidate ? candidate.error : "candidate was not selected",
      })),
    })
  }

  const selected = [...routable].sort((left, right) =>
    compareResolvedLayoutEvaluations(left.evaluation, right.evaluation) || compareIds(left.key, right.key))[0]!
  return {
    result: selected.evaluation.result,
    diagnostics: {
      candidateBudget: ADAPTIVE_CANDIDATE_BUDGET,
      theoreticalCandidateCount,
      fixedPortCount: normalized.ports.length - dynamicPorts.length,
      dynamicPortCount: dynamicPorts.length,
      generatedCandidates: search.seen.size,
      attemptedCandidates: attempted.length,
      routableCandidates: routable.length,
      rejectedCandidates: attempted.length - routable.length,
      selectedSides: [...selected.evaluation.result.ports]
        .sort((left, right) => compareIds(left.id, right.id))
        .map(({id, side}) => ({portId: id, side})),
    },
  }
}

type NormalizedAdaptivePort = Readonly<Omit<AdaptiveLayoutPort, "allowedSides"> & {
  allowedSides: readonly [LayoutPortSide] | readonly [LayoutPortSide, LayoutPortSide]
}>

type NormalizedAdaptiveGraph = Readonly<Omit<AdaptiveLayoutGraph, "ports" | "nodes" | "edges"> & {
  nodes: AdaptiveLayoutGraph["nodes"]
  ports: readonly NormalizedAdaptivePort[]
  edges: readonly LayoutEdge[]
}>

type PortRole = Readonly<{source: boolean; target: boolean; sourceEdgeId?: string; targetEdgeId?: string}>
type CandidateSides = readonly LayoutPortSide[]
type CandidateAttempt = Readonly<{
  key: string
  sides: CandidateSides
  evaluation?: ResolvedLayoutEvaluation
  error?: string
}>
type RoutableCandidate = Readonly<{
  key: string
  sides: CandidateSides
  evaluation: ResolvedLayoutEvaluation
}>

function normalizeAdaptiveGraph(graph: AdaptiveLayoutGraph): NormalizedAdaptiveGraph {
  const portIds = new Set<string>()
  const ports = [...graph.ports]
    .sort((left, right) => compareIds(left.id, right.id))
    .map((port): NormalizedAdaptivePort => {
      if (portIds.has(port.id)) throw new Error("Layout port ids must be globally unique")
      portIds.add(port.id)
      if (port.capability !== "in" && port.capability !== "out" && port.capability !== "inout") {
        throw new Error(`Invalid adaptive port capability: ${port.id}/${String(port.capability)}`)
      }
      const allowedSides = normalizeAllowedSides(port)
      return {...port, allowedSides}
    })
  const edges = [...graph.edges].sort((left, right) => compareIds(left.id, right.id))
  const usedPortIds = new Set(edges.flatMap(({sourcePortId, targetPortId}) => [sourcePortId, targetPortId]))
  for (const edge of edges) {
    if (!portIds.has(edge.sourcePortId)) throw new Error(`Unknown source port: ${edge.id}/${edge.sourcePortId}`)
    if (!portIds.has(edge.targetPortId)) throw new Error(`Unknown target port: ${edge.id}/${edge.targetPortId}`)
  }
  return {
    ...graph,
    nodes: [...graph.nodes].sort((left, right) => compareIds(left.id, right.id)),
    ports: ports.filter(({id}) => usedPortIds.has(id)),
    edges,
  }
}

function normalizeAllowedSides(port: AdaptiveLayoutPort): NormalizedAdaptivePort["allowedSides"] {
  const unique = [...new Set(port.allowedSides)]
  if (unique.some((side) => side !== "WEST" && side !== "EAST")) {
    throw new Error(`Invalid adaptive port side: ${port.id}`)
  }
  const ordered = (["WEST", "EAST"] as const).filter((side) => unique.includes(side))
  if (ordered.length === 0) {
    throw new AdaptiveLayoutError({
      code: "NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT",
      reason: "PORT_HAS_NO_ALLOWED_SIDE",
      candidateBudget: ADAPTIVE_CANDIDATE_BUDGET,
      theoreticalCandidateCount: "0",
      dynamicPortIds: [],
      portId: port.id,
      attempts: [],
    })
  }
  return ordered.length === 1 ? [ordered[0]!] : [ordered[0]!, ordered[1]!]
}

function collectPortRoles(edges: readonly LayoutEdge[]): ReadonlyMap<string, PortRole> {
  const mutable = new Map<string, {source: boolean; target: boolean; sourceEdgeId?: string; targetEdgeId?: string}>()
  for (const edge of edges) {
    const source = mutable.get(edge.sourcePortId) ?? {source: false, target: false}
    source.source = true
    source.sourceEdgeId ??= edge.id
    mutable.set(edge.sourcePortId, source)
    const target = mutable.get(edge.targetPortId) ?? {source: false, target: false}
    target.target = true
    target.targetEdgeId ??= edge.id
    mutable.set(edge.targetPortId, target)
  }
  return mutable
}

function validateCapabilities(
  ports: readonly NormalizedAdaptivePort[],
  roleByPort: ReadonlyMap<string, PortRole>,
  dynamicPortIds: readonly string[],
  theoreticalCandidateCount: string,
): void {
  for (const port of ports) {
    const role = roleByPort.get(port.id)
    if (role?.source && port.capability === "in") {
      throw capabilityError(port.id, role.sourceEdgeId!, "source", dynamicPortIds, theoreticalCandidateCount)
    }
    if (role?.target && port.capability === "out") {
      throw capabilityError(port.id, role.targetEdgeId!, "target", dynamicPortIds, theoreticalCandidateCount)
    }
  }
}

function capabilityError(
  portId: string,
  edgeId: string,
  role: "source" | "target",
  dynamicPortIds: readonly string[],
  theoreticalCandidateCount: string,
): AdaptiveLayoutError {
  return new AdaptiveLayoutError({
    code: "NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT",
    reason: "CAPABILITY_ROLE_CONFLICT",
    candidateBudget: ADAPTIVE_CANDIDATE_BUDGET,
    theoreticalCandidateCount,
    dynamicPortIds,
    portId,
    edgeId,
    role,
    attempts: [],
  })
}

function createCandidateSearch(
  dynamicPorts: readonly NormalizedAdaptivePort[],
  roleByPort: ReadonlyMap<string, PortRole>,
): {pending: CandidateSides[]; seen: Set<string>; add(sides: CandidateSides): void} {
  const pending: CandidateSides[] = []
  const seen = new Set<string>()
  const add = (sides: CandidateSides): void => {
    if (seen.size >= ADAPTIVE_CANDIDATE_BUDGET) return
    const key = assignmentKey(sides)
    if (seen.has(key)) return
    seen.add(key)
    pending.push(sides)
  }
  if (dynamicPorts.length === 0) {
    add([])
    return {pending, seen, add}
  }
  const rolePreferred = dynamicPorts.map((port, index) => preferredSide(port.id, index, roleByPort.get(port.id)))
  add(rolePreferred)
  add(rolePreferred.map(oppositeSide))
  add(dynamicPorts.map(() => "WEST"))
  add(dynamicPorts.map(() => "EAST"))
  add(dynamicPorts.map((_, index) => index % 2 === 0 ? "WEST" : "EAST"))
  add(dynamicPorts.map((_, index) => index % 2 === 0 ? "EAST" : "WEST"))
  return {pending, seen, add}
}

function candidateExpansionOrder(
  routable: readonly RoutableCandidate[],
  attempted: readonly CandidateAttempt[],
): readonly CandidateAttempt[] {
  const legal = [...routable].sort((left, right) =>
    compareResolvedLayoutEvaluations(left.evaluation, right.evaluation) || compareIds(left.key, right.key))
  const legalKeys = new Set(legal.map(({key}) => key))
  return [...legal, ...attempted.filter(({key}) => !legalKeys.has(key)).sort((left, right) => compareIds(left.key, right.key))]
}

function resolveAdaptiveCandidate(
  graph: NormalizedAdaptiveGraph,
  dynamicPortIds: readonly string[],
  sides: CandidateSides,
): ResolvedLayoutGraph {
  const selected = new Map(dynamicPortIds.map((id, index) => [id, sides[index]!]))
  return {
    ...graph,
    ports: graph.ports.map((port) => ({
      id: port.id,
      nodeId: port.nodeId,
      y: port.y,
      side: selected.get(port.id) ?? port.allowedSides[0],
    })),
  }
}

function materializeAssignment(
  dynamicPortIds: readonly string[],
  sides: CandidateSides,
): readonly AdaptiveSideAssignment[] {
  return dynamicPortIds.map((portId, index) => ({portId, side: sides[index]!}))
}

function preferredSide(portId: string, index: number, role: PortRole | undefined): LayoutPortSide {
  if (role?.source && !role.target) return "EAST"
  if (role?.target && !role.source) return "WEST"
  return (stableHash(portId) + index) % 2 === 0 ? "WEST" : "EAST"
}

function stableHash(value: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function flipSide(sides: CandidateSides, index: number): CandidateSides {
  return sides.map((side, candidateIndex) => candidateIndex === index ? oppositeSide(side) : side)
}

function oppositeSide(side: LayoutPortSide): LayoutPortSide {
  return side === "WEST" ? "EAST" : "WEST"
}

function assignmentKey(sides: CandidateSides): string {
  return sides.map((side) => side === "WEST" ? "W" : "E").join("") || "fixed"
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
