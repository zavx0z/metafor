import type {
  Axis,
  EdgeContext,
  FixedPoint,
  FixedRect,
  HeapItem,
  ParallelClearanceBlock,
  RouteIndex,
  RouteEdge,
  RouteEdgeMetrics,
  RouteGraphDiagnostic,
  RouteGraphInput,
  RouteGraphResult,
  RouteMetrics,
  RouteNode,
  RoutePort,
  RoutedSegment,
  Score,
  SearchState,
  SearchTrace,
  StepDirection,
  TerminalReservation,
  RouteSearchRejection,
  RouteSection,
} from "../types/routing.ts"

const compareIds = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

export function routeGraph(input: RouteGraphInput): RouteGraphResult {
  const index = validateInput(input)
  let firstFailure: unknown
  const results: RouteGraphResult[] = []
  for (const edges of edgeOrderCandidates(index)) {
    try {
      const result = routeGraphInOrder(input, index, edges)
      results.push(result)
    } catch (error) {
      if (!expectedRouteFailure(error)) throw error
      firstFailure ??= error
    }
  }
  if (results.length > 0) return results.sort(compareRouteResults)[0]!
  throw firstFailure
}

function routeGraphInOrder(
  input: RouteGraphInput,
  index: RouteIndex,
  edges: readonly RouteEdge[],
): RouteGraphResult {
  const routed = new Map<string, readonly FixedPoint[]>()
  for (const edge of edges) {
    const context = buildEdgeContext(input, index, edge)
    routed.set(edge.id, routeEdge(input, index, context, routed))
  }
  const sections = index.sortedEdges.map((edge): RouteSection => {
    const points = required(routed.get(edge.id), `missing route for ${edge.id}`)
    return {
      edgeId: edge.id,
      startPoint: points[0]!,
      bendPoints: points.slice(1, -1),
      endPoint: points.at(-1)!,
    }
  })
  const provisional = {
    direction: input.direction,
    unitsPerPixel: input.unitsPerPixel,
    sections,
  }
  const hardViolations = validateRouteGraphResult(input, provisional)
  if (hardViolations.length > 0) {
    throw new Error(`routeGraph produced invalid geometry:\n${hardViolations.join("\n")}`)
  }
  return minimizeParallelBundleCrossings(input, index, {
    ...provisional,
    metrics: measureResult(input, index, sections, hardViolations),
  })
}

function minimizeParallelBundleCrossings(
  input: RouteGraphInput,
  index: RouteIndex,
  initial: RouteGraphResult,
): RouteGraphResult {
  let best = initial
  const groups = new Map<string, RouteEdge[]>()
  for (const edge of index.sortedEdges) {
    const source = required(index.ports.get(edge.sourcePortId), `missing source ${edge.id}`)
    const target = required(index.ports.get(edge.targetPortId), `missing target ${edge.id}`)
    const key = `${source.nodeId}\u0000${target.nodeId}`
    const entries = groups.get(key) ?? []
    entries.push(edge)
    groups.set(key, entries)
  }
  for (const edges of groups.values()) {
    if (edges.length < 2) continue
    const replacement = uncrossParallelBundle(input, index, best.sections, edges)
    if (replacement === null) continue
    const provisional = {
      direction: input.direction,
      unitsPerPixel: input.unitsPerPixel,
      sections: replacement,
    }
    const hardViolations = validateRouteGraphResult(input, provisional)
    if (hardViolations.length > 0) continue
    const candidate: RouteGraphResult = {
      ...provisional,
      metrics: measureResult(input, index, replacement, hardViolations),
    }
    if (compareRouteResults(candidate, best) < 0) best = candidate
  }
  return best
}

function uncrossParallelBundle(
  input: RouteGraphInput,
  index: RouteIndex,
  sections: readonly RouteSection[],
  edges: readonly RouteEdge[],
): readonly RouteSection[] | null {
  const sectionByEdge = new Map(sections.map((section) => [section.edgeId, section]))
  const entries = edges.map((edge) => {
    const source = required(index.ports.get(edge.sourcePortId), `missing source ${edge.id}`)
    const target = required(index.ports.get(edge.targetPortId), `missing target ${edge.id}`)
    const section = required(sectionByEdge.get(edge.id), `missing section ${edge.id}`)
    const points = [section.startPoint, ...section.bendPoints, section.endPoint]
    return {edge, source, target, points}
  })
  if (entries.some(({points}) => points.length !== 6 || !isOrthogonalU(points))) return null
  const sourceOrder = [...entries].sort((left, right) =>
    left.source.center.y - right.source.center.y ||
    left.source.center.x - right.source.center.x ||
    compareIds(left.edge.id, right.edge.id))
  const targetOrder = [...entries].sort((left, right) =>
    left.target.center.y - right.target.center.y ||
    left.target.center.x - right.target.center.x ||
    compareIds(left.edge.id, right.edge.id))
  if (sourceOrder.some((entry, rank) => entry.edge.id !== targetOrder[rank]!.edge.id)) return null

  const backward = sourceOrder[0]!.source.center.x > sourceOrder[0]!.target.center.x
  if (sourceOrder.some(({source, target}) => (source.center.x > target.center.x) !== backward)) return null
  const below = sourceOrder.every(({source, target, points}) =>
    points[2]!.y > Math.max(source.center.y, target.center.y))
  const above = sourceOrder.every(({source, target, points}) =>
    points[2]!.y < Math.min(source.center.y, target.center.y))
  if (!below && !above) return null

  const sourceXs = sourceOrder.map(({points}) => points[1]!.x)
    .sort((left, right) => backward ? right - left : left - right)
  const middleYs = sourceOrder.map(({points}) => points[2]!.y)
    .sort((left, right) => below ? right - left : left - right)
  const targetXs = sourceOrder.map(({points}) => points[3]!.x)
    .sort((left, right) => backward ? left - right : right - left)
  if (!tracksHaveClearance(sourceXs, input.clearance) ||
      !tracksHaveClearance(middleYs, input.clearance) ||
      !tracksHaveClearance(targetXs, input.clearance)) return null

  const replacements = new Map<string, RouteSection>()
  for (let rank = 0; rank < sourceOrder.length; rank += 1) {
    const {edge, source, target} = sourceOrder[rank]!
    const points = simplifyPoints([
      source.center,
      {x: sourceXs[rank]!, y: source.center.y},
      {x: sourceXs[rank]!, y: middleYs[rank]!},
      {x: targetXs[rank]!, y: middleYs[rank]!},
      {x: targetXs[rank]!, y: target.center.y},
      target.center,
    ])
    replacements.set(edge.id, {
      edgeId: edge.id,
      startPoint: points[0]!,
      bendPoints: points.slice(1, -1),
      endPoint: points.at(-1)!,
    })
  }
  return sections.map((section) => replacements.get(section.edgeId) ?? section)
}

function isOrthogonalU(points: readonly FixedPoint[]): boolean {
  if (points.length !== 6) return false
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!
    const to = points[index]!
    const horizontal = from.y === to.y && from.x !== to.x
    const vertical = from.x === to.x && from.y !== to.y
    if ((index % 2 === 1 && !horizontal) || (index % 2 === 0 && !vertical)) return false
  }
  return true
}

function tracksHaveClearance(values: readonly number[], clearance: number): boolean {
  const unique = [...new Set(values)].sort((left, right) => left - right)
  if (unique.length !== values.length) return false
  return unique.slice(1).every((value, index) => value - unique[index]! >= clearance)
}

function expectedRouteFailure(error: unknown): boolean {
  return error instanceof Error && (
    error.message.startsWith("NO_LEGAL_ROUTE ") ||
    error.message.startsWith("routeGraph produced invalid geometry:")
  )
}

function edgeOrderCandidates(index: RouteIndex): readonly (readonly RouteEdge[])[] {
  const port = (id: string): RoutePort => required(index.ports.get(id), `missing port ${id}`)
  const sourceGeometry = (left: RouteEdge, right: RouteEdge): number => {
    const leftSource = port(left.sourcePortId).center
    const rightSource = port(right.sourcePortId).center
    const leftTarget = port(left.targetPortId).center
    const rightTarget = port(right.targetPortId).center
    return leftSource.y - rightSource.y || leftSource.x - rightSource.x ||
      leftTarget.y - rightTarget.y || leftTarget.x - rightTarget.x || compareIds(left.id, right.id)
  }
  const schedules = [
    index.sortedEdges,
    [...index.sortedEdges].sort(sourceGeometry),
    [...index.sortedEdges].sort((left, right) => -sourceGeometry(left, right)),
  ]
  const unique = new Map<string, readonly RouteEdge[]>()
  for (const schedule of schedules) {
    const key = schedule.map(({id}) => id).join("\u0000")
    if (!unique.has(key)) unique.set(key, schedule)
  }
  return [...unique.values()]
}

function compareRouteResults(left: RouteGraphResult, right: RouteGraphResult): number {
  const leftMetrics = left.metrics
  const rightMetrics = right.metrics
  const primary = leftMetrics.crossings - rightMetrics.crossings ||
    leftMetrics.maxCrossings - rightMetrics.maxCrossings ||
    leftMetrics.totalTurns - rightMetrics.totalTurns ||
    leftMetrics.maxTurns - rightMetrics.maxTurns ||
    leftMetrics.totalManhattan - rightMetrics.totalManhattan ||
    leftMetrics.maxManhattan - rightMetrics.maxManhattan ||
    leftMetrics.maxDetour - rightMetrics.maxDetour
  if (primary !== 0) return primary
  const leftDetours = [...leftMetrics.perEdge].sort((a, b) => compareIds(a.edgeId, b.edgeId))
  const rightDetours = [...rightMetrics.perEdge].sort((a, b) => compareIds(a.edgeId, b.edgeId))
  for (let index = 0; index < Math.max(leftDetours.length, rightDetours.length); index += 1) {
    const difference = (leftDetours[index]?.detour ?? 0) - (rightDetours[index]?.detour ?? 0)
    if (difference !== 0) return difference
  }
  return leftMetrics.clearanceVariance - rightMetrics.clearanceVariance ||
    compareIds(JSON.stringify(left.sections), JSON.stringify(right.sections))
}

export function diagnoseRouteGraph(input: RouteGraphInput): RouteGraphDiagnostic {
  let index: RouteIndex
  try {
    index = validateInput(input)
  } catch (error) {
    return {status: "INPUT_INVALID", error: error instanceof Error ? error.message : String(error)}
  }
  const prior = new Map<string, readonly FixedPoint[]>()
  for (const edge of index.sortedEdges) {
    const context = buildEdgeContext(input, index, edge)
    const trace: SearchTrace = {
      xs: [],
      ys: [],
      reachableStates: 0,
      reachableFrontier: [],
      rejectedTransitions: {pointBlocked: 0, segmentIllegal: 0, sourceDirection: 0, targetDirection: 0, hierarchyTransition: 0},
      firstRejectedHierarchyTransition: null,
      pointBlocks: [],
      pointBlockKeys: new Set(),
      parallelClearanceBlocks: [],
      parallelClearanceBlockKeys: new Set(),
    }
    try {
      prior.set(edge.id, routeEdge(input, index, context, prior, trace))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.startsWith("NO_LEGAL_ROUTE ")) throw error
      const ancestors = (nodeId: string): string[] => {
        const result: string[] = []
        let current = index.parentByChild.get(nodeId)
        while (current !== undefined) {
          result.push(current)
          current = index.parentByChild.get(current)
        }
        return result
      }
      return {
        status: "NO_LEGAL_ROUTE",
        error: message,
        witness: {
          edge,
          endpoints: {source: context.source, target: context.target, sourcePortal: context.sourcePortal, targetPortal: context.targetPortal},
          ancestors: {
            source: ancestors(context.source.nodeId),
            target: ancestors(context.target.nodeId),
            sourceChain: context.sourceChain.map((node) => node.id),
            targetChain: context.targetChain.map((node) => node.id),
            owner: context.owner?.id ?? null,
          },
          candidateAxes: {xs: trace.xs, ys: trace.ys},
          reachableStates: trace.reachableStates,
          reachableFrontier: trace.reachableFrontier,
          rejectedTransitions: trace.rejectedTransitions,
          firstRejectedHierarchyTransition: trace.firstRejectedHierarchyTransition,
          pointBlocks: trace.pointBlocks,
          parallelClearanceBlocks: trace.parallelClearanceBlocks.map((block) => {
            const priorEdge = required(index.sortedEdges.find((candidate) => candidate.id === block.priorEdgeId), `missing prior edge ${block.priorEdgeId}`)
            const sameSegment = (left: Readonly<{from: FixedPoint; to: FixedPoint}>, right: Readonly<{from: FixedPoint; to: FixedPoint}>): boolean =>
              (samePoint(left.from, right.from) && samePoint(left.to, right.to)) || (samePoint(left.from, right.to) && samePoint(left.to, right.from))
            const sourceTerminal = {from: context.source.center, to: context.sourcePortal}
            const targetTerminal = {from: context.targetPortal, to: context.target.center}
            return {
              ...block,
              priorEdge,
              identity: {
                sameSourcePort: priorEdge.sourcePortId === edge.sourcePortId,
                sameTargetPort: priorEdge.targetPortId === edge.targetPortId,
                sharedEndpointPortIds: [priorEdge.sourcePortId, priorEdge.targetPortId]
                  .filter((portId) => portId === edge.sourcePortId || portId === edge.targetPortId),
              },
              terminalZone: sameSegment(block.candidateSegment, sourceTerminal)
                ? "SOURCE"
                : sameSegment(block.candidateSegment, targetTerminal) ? "TARGET" : "NONE",
            }
          }),
          blockingRectangles: context.obstacles.map((node) => ({id: node.id, parentId: node.parentId ?? null, rect: node.rect, inflated: expandRect(node.rect, input.clearance)})),
        },
      }
    }
  }
  return {status: "ROUTABLE"}
}

export function validateRouteGraphResult(
  input: RouteGraphInput,
  result: Pick<RouteGraphResult, "direction" | "unitsPerPixel" | "sections">,
): readonly string[] {
  const violations: string[] = []
  let index: RouteIndex
  try {
    index = validateInput(input)
  } catch (error) {
    return [`input: ${error instanceof Error ? error.message : String(error)}`]
  }
  if (result.direction !== input.direction) violations.push("direction changed")
  if (result.unitsPerPixel !== input.unitsPerPixel) violations.push("fixed-point scale changed")
  const sections = new Map<string, RouteSection>()
  for (const section of result.sections) {
    if (sections.has(section.edgeId)) violations.push(`duplicate section: ${section.edgeId}`)
    sections.set(section.edgeId, section)
  }
  if (sections.size !== index.sortedEdges.length) violations.push("semantic edge count changed")
  const prior = new Map<string, readonly FixedPoint[]>()
  for (const edge of index.sortedEdges) {
    const section = sections.get(edge.id)
    if (section === undefined) {
      violations.push(`missing section: ${edge.id}`)
      continue
    }
    const points = [section.startPoint, ...section.bendPoints, section.endPoint]
    const context = buildEdgeContext(input, index, edge)
    violations.push(...validatePath(input, index, context, points, prior).map((entry) => `${edge.id}: ${entry}`))
    prior.set(edge.id, points)
  }
  for (const edgeId of sections.keys()) {
    if (!index.sortedEdges.some((edge) => edge.id === edgeId)) violations.push(`unknown section: ${edgeId}`)
  }
  return violations.sort(compareIds)
}

export function measureRouteGraphResult(
  input: RouteGraphInput,
  result: RouteGraphResult,
  hardViolations: readonly string[] = [],
): RouteGraphResult {
  const sortedNodes = [...input.nodes].sort((left, right) => compareIds(left.id, right.id))
  const ports = new Map(input.ports.map((port) => [port.id, port]))
  const childrenByParent = new Map<string, RouteNode[]>()
  for (const node of sortedNodes) {
    if (node.parentId === undefined) continue
    const children = childrenByParent.get(node.parentId) ?? []
    children.push(node)
    childrenByParent.set(node.parentId, children)
  }
  const compounds = sortedNodes.filter((node) => childrenByParent.has(node.id))
  const compoundArea = compounds.reduce((sum, node) => sum + node.rect.w * node.rect.h, 0)
  const occupiedArea = compounds.reduce((sum, node) => sum + childrenByParent.get(node.id)!
    .reduce((childSum, child) => childSum + child.rect.w * child.rect.h, 0), 0)
  const fitScale = Math.min(
    input.viewport.width * input.unitsPerPixel / input.bounds.w,
    input.viewport.height * input.unitsPerPixel / input.bounds.h,
    1,
  )
  return {
    ...result,
    metrics: {
      ...result.metrics,
      hardViolations,
      fitScale,
      compoundEmptyRatio: compoundArea === 0 ? 0 : 1 - occupiedArea / compoundArea,
      clearanceVariance: measureClearanceVariance(input, {sortedNodes, ports}, result.sections),
    },
  }
}

function validateInput(input: RouteGraphInput): RouteIndex {
  requirePositiveInteger(input.unitsPerPixel, "unitsPerPixel")
  requirePositiveInteger(input.clearance, "clearance")
  requireRect(input.bounds, "bounds")
  requirePositiveInteger(input.viewport.width, "viewport width")
  requirePositiveInteger(input.viewport.height, "viewport height")
  const nodes = new Map<string, RouteNode>()
  for (const node of [...input.nodes].sort((a, b) => compareIds(a.id, b.id))) {
    requireId(node.id, "node")
    requireRect(node.rect, `node ${node.id}`)
    if (node.contentRect !== undefined) {
      requireRect(node.contentRect, `node content ${node.id}`)
      if (!containsRect(node.rect, node.contentRect)) {
        throw new Error(`node content escapes node: ${node.id}`)
      }
    }
    if (nodes.has(node.id)) throw new Error(`duplicate node: ${node.id}`)
    nodes.set(node.id, node)
  }
  const parentByChild = new Map<string, string>()
  const mutableChildren = new Map<string, RouteNode[]>()
  for (const node of nodes.values()) {
    if (node.parentId === undefined) continue
    const parent = nodes.get(node.parentId)
    if (parent === undefined) throw new Error(`unknown parent: ${node.id}/${node.parentId}`)
    if (node.parentId === node.id) throw new Error(`self containment: ${node.id}`)
    if (!containsRect(parent.rect, node.rect)) throw new Error(`child escapes parent: ${node.id}`)
    parentByChild.set(node.id, node.parentId)
    const children = mutableChildren.get(node.parentId) ?? []
    children.push(node)
    mutableChildren.set(node.parentId, children)
  }
  for (const node of nodes.values()) {
    const seen = new Set<string>()
    let current: string | undefined = node.id
    while (current !== undefined) {
      if (seen.has(current)) throw new Error(`containment cycle: ${node.id}`)
      seen.add(current)
      current = parentByChild.get(current)
    }
  }
  const sortedNodes = [...nodes.values()].sort((a, b) => compareIds(a.id, b.id))
  for (let leftIndex = 0; leftIndex < sortedNodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sortedNodes.length; rightIndex += 1) {
      const left = sortedNodes[leftIndex]!
      const right = sortedNodes[rightIndex]!
      if (isAncestor(left.id, right.id, parentByChild) || isAncestor(right.id, left.id, parentByChild)) continue
      if (rectInteriorOverlaps(left.rect, right.rect)) throw new Error(`unrelated node overlap: ${left.id}/${right.id}`)
    }
  }
  const ports = new Map<string, RoutePort>()
  for (const port of [...input.ports].sort((a, b) => compareIds(a.id, b.id))) {
    requireId(port.id, "port")
    if (ports.has(port.id)) throw new Error(`duplicate port: ${port.id}`)
    const node = nodes.get(port.nodeId)
    if (node === undefined) throw new Error(`unknown port node: ${port.id}/${port.nodeId}`)
    requirePoint(port.center, `port ${port.id}`)
    const sideOffset = port.side === "WEST" ? node.rect.x - port.center.x : port.center.x - rectRight(node.rect)
    if (Math.abs(sideOffset) > input.unitsPerPixel) throw new Error(`${port.side} port is detached from node boundary: ${port.id}`)
    if (port.center.y < node.rect.y || port.center.y > rectBottom(node.rect)) throw new Error(`port y escapes node: ${port.id}`)
    ports.set(port.id, port)
  }
  const edgeIds = new Set<string>()
  const sortedEdges = [...input.edges].sort((a, b) => compareIds(a.id, b.id))
  for (const edge of sortedEdges) {
    requireId(edge.id, "edge")
    if (edgeIds.has(edge.id)) throw new Error(`duplicate edge: ${edge.id}`)
    edgeIds.add(edge.id)
    const source = ports.get(edge.sourcePortId)
    const target = ports.get(edge.targetPortId)
    if (source === undefined) throw new Error(`unknown source port: ${edge.id}/${edge.sourcePortId}`)
    if (target === undefined) throw new Error(`unknown target port: ${edge.id}/${edge.targetPortId}`)
    if (source.direction !== "out" || source.side !== "EAST") throw new Error(`source must be out/EAST: ${edge.id}`)
    if (target.direction !== "in" || target.side !== "WEST") throw new Error(`target must be in/WEST: ${edge.id}`)
  }
  const childrenByParent = new Map<string, readonly RouteNode[]>(
    [...mutableChildren.entries()].map(([id, children]) => [id, children.sort((a, b) => compareIds(a.id, b.id))]),
  )
  return {nodes, ports, parentByChild, childrenByParent, sortedNodes, sortedEdges}
}

function buildEdgeContext(input: RouteGraphInput, index: RouteIndex, edge: RouteEdge): EdgeContext {
  const source = required(index.ports.get(edge.sourcePortId), `missing source ${edge.id}`)
  const target = required(index.ports.get(edge.targetPortId), `missing target ${edge.id}`)
  const sourceNode = required(index.nodes.get(source.nodeId), `missing source node ${edge.id}`)
  const targetNode = required(index.nodes.get(target.nodeId), `missing target node ${edge.id}`)
  const sourceAncestors = ancestorNodes(source.nodeId, index)
  const targetAncestors = ancestorNodes(target.nodeId, index)
  const targetIds = new Set(targetAncestors.map((node) => node.id))
  const owner = sourceAncestors.find((node) => targetIds.has(node.id)) ?? null
  const sourceChain = takeUntil(sourceAncestors, owner?.id)
  const targetChain = [...takeUntil(targetAncestors, owner?.id)].reverse()
  const transparent = new Set<string>([
    ...sourceAncestors.map((node) => node.id),
    ...targetAncestors.map((node) => node.id),
  ])
  const obstacles = index.sortedNodes.flatMap((node): RouteNode[] => {
    if (!transparent.has(node.id)) return [node]
    if (node.contentRect === undefined) return []
    return [{...node, rect: node.contentRect}]
  })
  const areaBase = owner?.rect ?? input.bounds
  const area = insetRect(areaBase, input.clearance)
  if (area.w <= 0 || area.h <= 0) throw new Error(`routing owner has no inner area: ${edge.id}`)
  const portals = terminalPortals(source, target, sourceNode, targetNode, input.clearance)
  return {
    edge,
    source,
    target,
    sourcePortal: portals.source,
    targetPortal: portals.target,
    sourceChain,
    targetChain,
    owner,
    area,
    obstacles,
    inflatedObstacles: obstacles.map((node) => ({node, rect: expandRect(node.rect, input.clearance)})),
    terminalReservations: terminalReservations(input, index, edge),
  }
}

function routeEdge(
  input: RouteGraphInput,
  index: RouteIndex,
  context: EdgeContext,
  prior: ReadonlyMap<string, readonly FixedPoint[]>,
  trace?: SearchTrace,
): readonly FixedPoint[] {
  const {xs, ys} = candidateAxes(input, index, context, prior)
  const priorSegments = flattenPriorSegments(prior)
  if (trace !== undefined) {
    trace.xs = [...xs]
    trace.ys = [...ys]
  }
  const startXi = xs.indexOf(context.source.center.x)
  const startYi = ys.indexOf(context.source.center.y)
  const targetXi = xs.indexOf(context.target.center.x)
  const targetYi = ys.indexOf(context.target.center.y)
  if (startXi < 0 || startYi < 0 || targetXi < 0 || targetYi < 0) throw new Error(`endpoint omitted from grid: ${context.edge.id}`)
  const start: SearchState = {
    xi: startXi,
    yi: startYi,
    lastDirection: null,
    sourceExited: 0,
    targetEntered: 0,
    sourceGatewayY: null,
    targetGatewayY: null,
  }
  const yIndex = new Map(ys.map((value, index) => [value, index]))
  const searchStateKey = (state: SearchState): number => {
    const gatewayIndex = (value: number | null): number => value === null ? 0 : required(yIndex.get(value), `gateway omitted from y grid: ${context.edge.id}`) + 1
    let key = state.xi
    key = key * ys.length + state.yi
    key = key * 5 + stepDirectionIndex(state.lastDirection)
    key = key * (context.sourceChain.length + 1) + state.sourceExited
    key = key * (context.targetChain.length + 1) + state.targetEntered
    key = key * (ys.length + 1) + gatewayIndex(state.sourceGatewayY)
    key = key * (ys.length + 1) + gatewayIndex(state.targetGatewayY)
    if (!Number.isSafeInteger(key)) throw new Error(`search state key overflow: ${context.edge.id}`)
    return key
  }
  const startKey = searchStateKey(start)
  const startPoint = pointAt(start, xs, ys)
  // A crossing-free straight or H-V-H route dominates every longer grid path.
  // A dominant candidate that still crosses a prior edge cannot short-circuit:
  // crossing-first search may legally spend more turns to remove it.
  const dominantCandidates: FixedPoint[][] = []
  if (
    context.source.center.y === context.target.center.y &&
    context.source.center.x < context.target.center.x
  ) {
    dominantCandidates.push([context.source.center, context.target.center])
  }
  if (context.source.center.x < context.target.center.x) {
    for (const x of xs) {
      if (x <= context.source.center.x || x >= context.target.center.x) continue
      dominantCandidates.push(simplifyPoints([
        context.source.center,
        {x, y: context.source.center.y},
        {x, y: context.target.center.y},
        context.target.center,
      ]) as FixedPoint[])
    }
  }
  const dominant = dominantCandidates
    .filter((points) => validatePath(input, index, context, points, prior).length === 0)
    .map((points) => ({
      points,
      score: {
        crossings: countPathCrossings(points, priorSegments),
        turns: Math.max(0, points.length - 2),
        length: pathLength(points),
      } satisfies Score,
    }))
    .sort((left, right) => compareScores(left.score, right.score) || comparePointPaths(left.points, right.points))[0]
  if (dominant !== undefined && dominant.score.crossings === 0) return dominant.points
  const startScore: Score = {crossings: 0, turns: 0, length: 0}
  const scores = new Map<number, Score>([[startKey, startScore]])
  const previous = new Map<number, number>()
  const states = new Map<number, SearchState>([[startKey, start]])
  const heap = new MinHeap(compareHeapItems)
  const remainingTurns = (state: SearchState, point: FixedPoint): number => {
    if (samePoint(point, context.target.center)) return 0
    const lastAxis = axisOfStepDirection(state.lastDirection)
    const targetIsEast = point.x < context.target.center.x
    if (point.y !== context.target.center.y) {
      if (targetIsEast) return lastAxis === "V" ? 1 : 2
      return lastAxis === "V" ? 3 : 2
    }
    if (targetIsEast) return lastAxis === "V" ? 1 : 0
    return lastAxis === "V" ? 3 : 4
  }
  heap.push({state: start, score: startScore, estimatedTurns: remainingTurns(start, startPoint), estimatedLength: manhattanBetween(startPoint, context.target.center)})
  const pointLegality = new Map<number, boolean>()
  const segmentLegality = new Map<number, boolean>()
  let finalKey: number | null = null
  while (heap.size > 0) {
    const current = heap.pop()!
    const currentKey = searchStateKey(current.state)
    const best = scores.get(currentKey)
    if (best === undefined || compareScores(current.score, best) !== 0) continue
    if (
      current.state.xi === targetXi && current.state.yi === targetYi &&
      current.state.sourceExited === context.sourceChain.length &&
      current.state.targetEntered === context.targetChain.length
    ) {
      finalKey = currentKey
      break
    }
    const currentPoint = pointAt(current.state, xs, ys)
    for (let directionIndex = 0; directionIndex < 4; directionIndex += 1) {
      const nextXi = directionIndex === 0
        ? current.state.xi - 1
        : directionIndex === 3 ? current.state.xi + 1 : current.state.xi
      const nextYi = directionIndex === 1
        ? current.state.yi - 1
        : directionIndex === 2 ? current.state.yi + 1 : current.state.yi
      if (nextXi < 0 || nextYi < 0 || nextXi >= xs.length || nextYi >= ys.length) continue
      const nextPoint: FixedPoint = {x: xs[nextXi]!, y: ys[nextYi]!}
      const direction: StepDirection = directionIndex === 0
        ? "WEST"
        : directionIndex === 1 ? "NORTH" : directionIndex === 2 ? "SOUTH" : "EAST"
      if (isOppositeStepDirection(current.state.lastDirection, direction)) continue
      const reject = (kind: RouteSearchRejection): void => {
        if (trace === undefined) return
        trace.rejectedTransitions[kind] += 1
        if (kind === "hierarchyTransition" && trace.firstRejectedHierarchyTransition === null) {
          trace.firstRejectedHierarchyTransition = {from: currentPoint, to: nextPoint, state: current.state}
        }
      }
      const nextPointKey = nextXi * ys.length + nextYi
      let isPointBlocked = pointLegality.get(nextPointKey)
      if (isPointBlocked === undefined) {
        isPointBlocked = pointBlocked(nextPoint, input, context, trace)
        pointLegality.set(nextPointKey, isPointBlocked)
      }
      if (isPointBlocked) { reject("pointBlocked"); continue }
      const horizontalSegmentCount = ys.length * Math.max(0, xs.length - 1)
      const segmentKey = current.state.yi === nextYi
        ? current.state.yi * Math.max(0, xs.length - 1) + Math.min(current.state.xi, nextXi)
        : horizontalSegmentCount + current.state.xi * Math.max(0, ys.length - 1) + Math.min(current.state.yi, nextYi)
      let isSegmentLegal = segmentLegality.get(segmentKey)
      if (isSegmentLegal === undefined) {
        isSegmentLegal = segmentLegal(currentPoint, nextPoint, input, index, context, prior, trace, priorSegments)
        segmentLegality.set(segmentKey, isSegmentLegal)
      }
      if (!isSegmentLegal) { reject("segmentIllegal"); continue }
      if (current.state.lastDirection === null && !(nextPoint.y === currentPoint.y && nextPoint.x > currentPoint.x)) { reject("sourceDirection"); continue }
      if (nextXi === targetXi && nextYi === targetYi && !(currentPoint.y === nextPoint.y && currentPoint.x < nextPoint.x)) { reject("targetDirection"); continue }
      const axis: Axis = currentPoint.y === nextPoint.y ? "H" : "V"
      const transitioned = transitionHierarchy(current.state, nextXi, nextYi, currentPoint, nextPoint, context, direction)
      if (transitioned === null) { reject("hierarchyTransition"); continue }
      const stepLength = manhattanBetween(currentPoint, nextPoint)
      const score: Score = {
        crossings: current.score.crossings + countSegmentCrossings(currentPoint, nextPoint, priorSegments),
        turns: current.score.turns + (current.state.lastDirection !== null && axisOfStepDirection(current.state.lastDirection) !== axis ? 1 : 0),
        length: current.score.length + stepLength,
      }
      const nextState = transitioned
      const nextKey = searchStateKey(nextState)
      const old = scores.get(nextKey)
      if (old !== undefined && compareScores(score, old) >= 0) continue
      scores.set(nextKey, score)
      previous.set(nextKey, currentKey)
      states.set(nextKey, nextState)
      heap.push({state: nextState, score, estimatedTurns: score.turns + remainingTurns(nextState, nextPoint), estimatedLength: score.length + manhattanBetween(nextPoint, context.target.center)})
    }
  }
  if (finalKey === null) {
    if (trace !== undefined) {
      trace.reachableStates = states.size
      trace.reachableFrontier = [...states.entries()]
        .map(([key, state]) => ({key, point: pointAt(state, xs, ys), state, score: scores.get(key), distanceToTarget: manhattanBetween(pointAt(state, xs, ys), context.target.center)}))
        .sort((left, right) => left.distanceToTarget - right.distanceToTarget || left.key - right.key)
        .slice(0, 12)
    }
    throw new Error(`NO_LEGAL_ROUTE ${context.edge.id}: fixed rectangles provide no corridor at clearance ${input.clearance}`)
  }
  const reversed: FixedPoint[] = []
  let key: number | undefined = finalKey
  while (key !== undefined) {
    const state = required(states.get(key), `missing search state ${key}`)
    reversed.push(pointAt(state, xs, ys))
    key = previous.get(key)
  }
  return simplifyPoints(reversed.reverse())
}

function candidateAxes(
  input: RouteGraphInput,
  index: RouteIndex,
  context: EdgeContext,
  prior: ReadonlyMap<string, readonly FixedPoint[]>,
): Readonly<{xs: number[]; ys: number[]}> {
  const xs = new Set<number>([
    context.source.center.x,
    context.target.center.x,
    context.sourcePortal.x,
    context.targetPortal.x,
    context.area.x,
    rectRight(context.area),
  ])
  const ys = new Set<number>([
    context.source.center.y,
    context.target.center.y,
    context.area.y,
    rectBottom(context.area),
  ])
  for (const node of context.obstacles) {
    const {x, y, w, h} = node.rect
    for (const value of [x - input.clearance, x + w + input.clearance]) xs.add(value)
    for (const value of [y - input.clearance, y + h + input.clearance]) ys.add(value)
  }
  for (const node of [...context.sourceChain, ...context.targetChain]) {
    xs.add(node.rect.x)
    xs.add(rectRight(node.rect))
    ys.add(node.rect.y)
    ys.add(rectBottom(node.rect))
    if (input.direction === "RIGHT") {
      xs.add(node.rect.x - input.clearance)
      xs.add(rectRight(node.rect) + input.clearance)
      ys.add(node.rect.y - input.clearance)
      ys.add(rectBottom(node.rect) + input.clearance)
    }
  }
  for (const port of index.ports.values()) {
    // Other ports reserve horizontal terminal stubs. Their X endpoints are
    // already represented by node sides and side +/- clearance; only the two
    // Y lanes around the stub add visibility coordinates for this edge.
    ys.add(port.center.y - input.clearance)
    ys.add(port.center.y + input.clearance)
  }
  for (const [priorEdgeId, points] of prior.entries()) {
    const priorEdge = required(
      index.sortedEdges.find((candidate) => candidate.id === priorEdgeId),
      `missing prior edge ${priorEdgeId}`,
    )
    const canBundle = relatedBundleEdges(context.edge, priorEdge)
    for (let index = 1; index < points.length; index += 1) {
      const left = points[index - 1]!
      const right = points[index]!
      if (left.x === right.x) {
        if (canBundle) xs.add(left.x)
        xs.add(left.x - input.clearance)
        xs.add(left.x + input.clearance)
      } else {
        if (canBundle) ys.add(left.y)
        ys.add(left.y - input.clearance)
        ys.add(left.y + input.clearance)
      }
    }
  }
  return {
    xs: [...xs].filter(Number.isSafeInteger).sort((a, b) => a - b),
    ys: [...ys].filter(Number.isSafeInteger).sort((a, b) => a - b),
  }
}

function pointBlocked(point: FixedPoint, input: RouteGraphInput, context: EdgeContext, trace?: SearchTrace): boolean {
  const record = (reason: unknown): void => {
    if (trace === undefined) return
    const key = JSON.stringify({point, reason})
    if (trace.pointBlockKeys.has(key)) return
    trace.pointBlockKeys.add(key)
    trace.pointBlocks.push({point, reason})
  }
  if (!containsPoint(context.area, point) && !samePoint(point, context.source.center) && !samePoint(point, context.target.center)) {
    record({kind: "ROUTING_AREA", area: context.area})
    return true
  }
  for (const {node: obstacle, rect: inflated} of context.inflatedObstacles) {
    if (!insideOpen(inflated, point)) continue
    if (
      (obstacle.id === context.source.nodeId || obstacle.id === context.target.nodeId) &&
      insideFacingTerminalZone(point, context)
    ) continue
    if (obstacle.id === context.source.nodeId && onStub(point, context.source.center, context.sourcePortal)) continue
    if (obstacle.id === context.target.nodeId && onStub(point, context.targetPortal, context.target.center)) continue
    record({kind: "INFLATED_NODE", nodeId: obstacle.id, rect: obstacle.rect, inflated})
    return true
  }
  return false
}

function segmentLegal(
  from: FixedPoint,
  to: FixedPoint,
  input: RouteGraphInput,
  index: RouteIndex,
  context: EdgeContext,
  prior: ReadonlyMap<string, readonly FixedPoint[]>,
  trace?: SearchTrace,
  flattenedPrior?: readonly RoutedSegment[],
): boolean {
  if (from.x !== to.x && from.y !== to.y) return false
  if (!containsPoint(context.area, from) && !samePoint(from, context.source.center) && !samePoint(from, context.target.center)) return false
  if (!containsPoint(context.area, to) && !samePoint(to, context.source.center) && !samePoint(to, context.target.center)) return false
  for (const {node: obstacle, rect: inflated} of context.inflatedObstacles) {
    if (!segmentIntersectsOpenRect(from, to, inflated)) continue
    if (
      (obstacle.id === context.source.nodeId || obstacle.id === context.target.nodeId) &&
      obstacleIntersectionInsideFacingTerminalZone(from, to, inflated, context)
    ) continue
    if (obstacle.id === context.source.nodeId && obstacleIntersectionOnStub(from, to, inflated, context.source.center, context.sourcePortal)) continue
    if (obstacle.id === context.target.nodeId && obstacleIntersectionOnStub(from, to, inflated, context.targetPortal, context.target.center)) continue
    return false
  }
  for (const reservation of context.terminalReservations) {
    if (parallelTooClose(from, to, reservation.from, reservation.to, input.clearance)) return false
  }
  const priorSegments = flattenedPrior ?? flattenPriorSegments(prior)
  for (const segment of priorSegments) {
      const priorEdgeId = segment.priorEdgeId
      const blockingFrom = segment.from
      const blockingTo = segment.to
      if (parallelTooClose(from, to, blockingFrom, blockingTo, input.clearance)) {
        const priorEdge = required(
          index.sortedEdges.find((candidate) => candidate.id === priorEdgeId),
          `missing prior edge ${priorEdgeId}`,
        )
        if (sharedEndpointStubAllows(from, to, blockingFrom, blockingTo, context, priorEdge)) continue
        if (
          relatedBundleEdges(context.edge, priorEdge) &&
          collinearSegmentsOverlap(from, to, blockingFrom, blockingTo)
        ) continue
        if (trace !== undefined) {
          const horizontal = from.y === to.y
          const overlap = horizontal
            ? Math.min(Math.max(from.x, to.x), Math.max(blockingFrom.x, blockingTo.x)) - Math.max(Math.min(from.x, to.x), Math.min(blockingFrom.x, blockingTo.x))
            : Math.min(Math.max(from.y, to.y), Math.max(blockingFrom.y, blockingTo.y)) - Math.max(Math.min(from.y, to.y), Math.min(blockingFrom.y, blockingTo.y))
          const block: ParallelClearanceBlock = {
            priorEdgeId,
            candidateSegment: {from, to},
            blockingSegment: {from: blockingFrom, to: blockingTo},
            axis: horizontal ? "H" : "V",
            distance: horizontal ? Math.abs(from.y - blockingFrom.y) : Math.abs(from.x - blockingFrom.x),
            overlap,
          }
          const key = `${priorEdgeId}|${pointKey(from)}|${pointKey(to)}|${pointKey(blockingFrom)}|${pointKey(blockingTo)}`
          if (!trace.parallelClearanceBlockKeys.has(key)) {
            trace.parallelClearanceBlockKeys.add(key)
            trace.parallelClearanceBlocks.push(block)
          }
        }
        return false
      }
  }
  return true
}

function flattenPriorSegments(prior: ReadonlyMap<string, readonly FixedPoint[]>): readonly RoutedSegment[] {
  const result: RoutedSegment[] = []
  for (const [priorEdgeId, points] of prior.entries()) {
    for (let index = 1; index < points.length; index += 1) result.push({priorEdgeId, from: points[index - 1]!, to: points[index]!})
  }
  return result
}

function countPathCrossings(points: readonly FixedPoint[], priorSegments: readonly RoutedSegment[]): number {
  let crossings = 0
  for (let index = 1; index < points.length; index += 1) {
    crossings += countSegmentCrossings(points[index - 1]!, points[index]!, priorSegments)
  }
  return crossings
}

function countSegmentCrossings(
  from: FixedPoint,
  to: FixedPoint,
  priorSegments: readonly RoutedSegment[],
): number {
  let crossings = 0
  for (const segment of priorSegments) {
    if (properPerpendicularCrossing(from, to, segment.from, segment.to)) crossings += 1
  }
  return crossings
}

function terminalReservations(
  input: RouteGraphInput,
  index: RouteIndex,
  currentEdge: RouteEdge,
): readonly TerminalReservation[] {
  const result: TerminalReservation[] = []
  for (const edge of index.sortedEdges) {
    if (edge.id === currentEdge.id) continue
    const source = required(index.ports.get(edge.sourcePortId), `missing source ${edge.id}`)
    const target = required(index.ports.get(edge.targetPortId), `missing target ${edge.id}`)
    const sourceNode = required(index.nodes.get(source.nodeId), `missing source node ${edge.id}`)
    const targetNode = required(index.nodes.get(target.nodeId), `missing target node ${edge.id}`)
    const portals = terminalPortals(source, target, sourceNode, targetNode, input.clearance)
    const add = (port: RoutePort, kind: "SOURCE" | "TARGET", portal: FixedPoint): void => {
      if (port.id === currentEdge.sourcePortId || port.id === currentEdge.targetPortId) return
      result.push({edgeId: edge.id, portId: port.id, kind, from: port.center, to: portal})
    }
    add(source, "SOURCE", portals.source)
    add(target, "TARGET", portals.target)
  }
  return result
}

function sharedEndpointStubAllows(
  from: FixedPoint,
  to: FixedPoint,
  blockingFrom: FixedPoint,
  blockingTo: FixedPoint,
  context: EdgeContext,
  priorEdge: RouteEdge,
): boolean {
  const sharedStubs: Array<readonly [FixedPoint, FixedPoint]> = []
  if (priorEdge.sourcePortId === context.edge.sourcePortId) {
    sharedStubs.push([context.source.center, context.sourcePortal])
  }
  if (priorEdge.targetPortId === context.edge.targetPortId) {
    sharedStubs.push([context.targetPortal, context.target.center])
  }
  return sharedStubs.some(([stubFrom, stubTo]) =>
    collinearOverlapContainedInStub(from, to, blockingFrom, blockingTo, stubFrom, stubTo))
}

function relatedBundleEdges(left: RouteEdge, right: RouteEdge): boolean {
  return left.sourcePortId === right.sourcePortId || left.targetPortId === right.targetPortId
}

function collinearSegmentsOverlap(
  leftFrom: FixedPoint,
  leftTo: FixedPoint,
  rightFrom: FixedPoint,
  rightTo: FixedPoint,
): boolean {
  if (
    leftFrom.y === leftTo.y &&
    rightFrom.y === rightTo.y &&
    leftFrom.y === rightFrom.y
  ) {
    return Math.max(Math.min(leftFrom.x, leftTo.x), Math.min(rightFrom.x, rightTo.x)) <
      Math.min(Math.max(leftFrom.x, leftTo.x), Math.max(rightFrom.x, rightTo.x))
  }
  if (
    leftFrom.x === leftTo.x &&
    rightFrom.x === rightTo.x &&
    leftFrom.x === rightFrom.x
  ) {
    return Math.max(Math.min(leftFrom.y, leftTo.y), Math.min(rightFrom.y, rightTo.y)) <
      Math.min(Math.max(leftFrom.y, leftTo.y), Math.max(rightFrom.y, rightTo.y))
  }
  return false
}

function collinearOverlapContainedInStub(
  from: FixedPoint,
  to: FixedPoint,
  blockingFrom: FixedPoint,
  blockingTo: FixedPoint,
  stubFrom: FixedPoint,
  stubTo: FixedPoint,
): boolean {
  if (
    from.y === to.y &&
    blockingFrom.y === blockingTo.y &&
    stubFrom.y === stubTo.y &&
    from.y === blockingFrom.y &&
    from.y === stubFrom.y
  ) {
    const overlapFrom = Math.max(Math.min(from.x, to.x), Math.min(blockingFrom.x, blockingTo.x))
    const overlapTo = Math.min(Math.max(from.x, to.x), Math.max(blockingFrom.x, blockingTo.x))
    return overlapFrom < overlapTo &&
      overlapFrom >= Math.min(stubFrom.x, stubTo.x) &&
      overlapTo <= Math.max(stubFrom.x, stubTo.x)
  }
  if (
    from.x === to.x &&
    blockingFrom.x === blockingTo.x &&
    stubFrom.x === stubTo.x &&
    from.x === blockingFrom.x &&
    from.x === stubFrom.x
  ) {
    const overlapFrom = Math.max(Math.min(from.y, to.y), Math.min(blockingFrom.y, blockingTo.y))
    const overlapTo = Math.min(Math.max(from.y, to.y), Math.max(blockingFrom.y, blockingTo.y))
    return overlapFrom < overlapTo &&
      overlapFrom >= Math.min(stubFrom.y, stubTo.y) &&
      overlapTo <= Math.max(stubFrom.y, stubTo.y)
  }
  return false
}

function terminalPortals(
  source: RoutePort,
  target: RoutePort,
  sourceNode: RouteNode,
  targetNode: RouteNode,
  clearance: number,
): Readonly<{source: FixedPoint; target: FixedPoint}> {
  let sourceX = portPortalX(source, sourceNode, clearance)
  let targetX = portPortalX(target, targetNode, clearance)
  if (source.center.x < target.center.x && sourceX > targetX) {
    const meetingX = source.center.x + Math.floor((target.center.x - source.center.x) / 2)
    sourceX = meetingX
    targetX = meetingX
  }
  return {
    source: {x: sourceX, y: source.center.y},
    target: {x: targetX, y: target.center.y},
  }
}

function insideFacingTerminalZone(point: FixedPoint, context: EdgeContext): boolean {
  if (context.sourcePortal.x !== context.targetPortal.x) return false
  return point.x >= context.source.center.x && point.x <= context.target.center.x &&
    point.y >= Math.min(context.source.center.y, context.target.center.y) &&
    point.y <= Math.max(context.source.center.y, context.target.center.y)
}

function obstacleIntersectionInsideFacingTerminalZone(
  from: FixedPoint,
  to: FixedPoint,
  obstacle: FixedRect,
  context: EdgeContext,
): boolean {
  if (context.sourcePortal.x !== context.targetPortal.x) return false
  const zone: FixedRect = {
    x: context.source.center.x,
    y: Math.min(context.source.center.y, context.target.center.y),
    w: context.target.center.x - context.source.center.x,
    h: Math.abs(context.target.center.y - context.source.center.y),
  }
  if (from.y === to.y) {
    if (from.y < zone.y || from.y > rectBottom(zone)) return false
    const intersectionMin = Math.max(Math.min(from.x, to.x), obstacle.x)
    const intersectionMax = Math.min(Math.max(from.x, to.x), rectRight(obstacle))
    return intersectionMin >= zone.x && intersectionMax <= rectRight(zone)
  }
  if (from.x !== to.x || from.x < zone.x || from.x > rectRight(zone)) return false
  const intersectionMin = Math.max(Math.min(from.y, to.y), obstacle.y)
  const intersectionMax = Math.min(Math.max(from.y, to.y), rectBottom(obstacle))
  return intersectionMin >= zone.y && intersectionMax <= rectBottom(zone)
}

function portPortalX(port: RoutePort, node: RouteNode, clearance: number): number {
  return port.side === "EAST"
    ? Math.max(port.center.x, rectRight(node.rect)) + clearance
    : Math.min(port.center.x, node.rect.x) - clearance
}

function transitionHierarchy(
  state: SearchState,
  nextXi: number,
  nextYi: number,
  from: FixedPoint,
  to: FixedPoint,
  context: EdgeContext,
  lastDirection: StepDirection | null,
): SearchState | null {
  let sourceExited = state.sourceExited
  let targetEntered = state.targetEntered
  let sourceGatewayY = state.sourceGatewayY
  let targetGatewayY = state.targetGatewayY
  for (let index = 0; index < context.sourceChain.length; index += 1) {
    const rect = context.sourceChain[index]!.rect
    if (runsAlongBoundary(from, to, rect)) return null
    const wasInside = containsPoint(rect, from)
    const isInside = containsPoint(rect, to)
    if (!wasInside && isInside) return null
    if (wasInside && !isInside) {
      if (index !== sourceExited || !horizontalSideCrossing(from, to, rect)) return null
      if (sourceGatewayY !== null && sourceGatewayY !== from.y) return null
      sourceGatewayY = from.y
      sourceExited += 1
    }
  }
  for (let index = 0; index < context.targetChain.length; index += 1) {
    const rect = context.targetChain[index]!.rect
    if (runsAlongBoundary(from, to, rect)) return null
    const wasInside = containsPoint(rect, from)
    const isInside = containsPoint(rect, to)
    if (wasInside && !isInside) return null
    if (!wasInside && isInside) {
      if (index !== targetEntered || !horizontalSideCrossing(from, to, rect)) return null
      if (targetGatewayY !== null && targetGatewayY !== from.y) return null
      targetGatewayY = from.y
      targetEntered += 1
    }
  }
  return {
    xi: nextXi,
    yi: nextYi,
    lastDirection,
    sourceExited,
    targetEntered,
    sourceGatewayY,
    targetGatewayY,
  }
}

function validatePath(
  input: RouteGraphInput,
  routeIndex: RouteIndex,
  context: EdgeContext,
  points: readonly FixedPoint[],
  prior: ReadonlyMap<string, readonly FixedPoint[]>,
): readonly string[] {
  const violations: string[] = []
  if (points.length < 2) return ["fewer than two points"]
  if (!samePoint(points[0]!, context.source.center)) violations.push("source attachment changed")
  if (!samePoint(points.at(-1)!, context.target.center)) violations.push("target attachment changed")
  let state: SearchState = {
    xi: 0,
    yi: 0,
    lastDirection: null,
    sourceExited: 0,
    targetEntered: 0,
    sourceGatewayY: null,
    targetGatewayY: null,
  }
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!
    const to = points[index]!
    if (samePoint(from, to)) violations.push(`duplicate point at ${index}`)
    if (from.x !== to.x && from.y !== to.y) violations.push(`non-orthogonal segment at ${index}`)
    if (!segmentLegal(from, to, input, routeIndex, context, prior)) violations.push(`clearance/obstacle violation at ${index}`)
    const transitioned = transitionHierarchy(state, state.xi, state.yi, from, to, context, stepDirectionBetween(from, to))
    if (transitioned === null) violations.push(`hierarchy transition violation at ${index}`)
    else state = transitioned
    if (index >= 2) {
      const previous = points[index - 2]!
      if ((previous.x === from.x && from.x === to.x) || (previous.y === from.y && from.y === to.y)) {
        violations.push(`unsimplified collinear point at ${index - 1}`)
      }
    }
  }
  if (!(points[1]!.y === points[0]!.y && points[1]!.x > points[0]!.x)) violations.push("source does not leave EAST")
  if (!(points.at(-2)!.y === points.at(-1)!.y && points.at(-2)!.x < points.at(-1)!.x)) violations.push("target does not enter from WEST")
  if (state.sourceExited !== context.sourceChain.length) violations.push("source ancestor chain not fully exited")
  if (state.targetEntered !== context.targetChain.length) violations.push("target ancestor chain not fully entered")
  return violations
}

function measureResult(
  input: RouteGraphInput,
  index: RouteIndex,
  sections: readonly RouteSection[],
  hardViolations: readonly string[],
): RouteMetrics {
  const crossingsByEdge = countCrossingsByEdge(sections)
  const perEdge = sections.map((section): RouteEdgeMetrics => {
    const points = [section.startPoint, ...section.bendPoints, section.endPoint]
    const manhattan = pathLength(points)
    const direct = manhattanBetween(points[0]!, points.at(-1)!)
    return {
      edgeId: section.edgeId,
      crossings: crossingsByEdge.get(section.edgeId) ?? 0,
      turns: Math.max(0, points.length - 2),
      manhattan,
      detour: manhattan - direct,
    }
  })
  const compounds = index.sortedNodes.filter((node) => (index.childrenByParent.get(node.id)?.length ?? 0) > 0)
  const compoundArea = compounds.reduce((sum, node) => sum + node.rect.w * node.rect.h, 0)
  const occupiedArea = compounds.reduce(
    (sum, node) => sum + (index.childrenByParent.get(node.id) ?? []).reduce((childSum, child) => childSum + child.rect.w * child.rect.h, 0),
    0,
  )
  const fitScale = Math.min(
    input.viewport.width * input.unitsPerPixel / input.bounds.w,
    input.viewport.height * input.unitsPerPixel / input.bounds.h,
    1,
  )
  return {
    hardViolations,
    totalTurns: perEdge.reduce((sum, edge) => sum + edge.turns, 0),
    maxTurns: Math.max(0, ...perEdge.map((edge) => edge.turns)),
    totalManhattan: perEdge.reduce((sum, edge) => sum + edge.manhattan, 0),
    maxManhattan: Math.max(0, ...perEdge.map((edge) => edge.manhattan)),
    maxDetour: Math.max(0, ...perEdge.map((edge) => edge.detour)),
    fitScale,
    compoundEmptyRatio: compoundArea === 0 ? 0 : 1 - occupiedArea / compoundArea,
    clearanceVariance: measureClearanceVariance(input, index, sections),
    crossings: [...crossingsByEdge.values()].reduce((sum, value) => sum + value, 0) / 2,
    maxCrossings: Math.max(0, ...crossingsByEdge.values()),
    perEdge,
  }
}

function measureClearanceVariance(
  input: RouteGraphInput,
  index: Pick<RouteIndex, "sortedNodes" | "ports">,
  sections: readonly RouteSection[],
): number {
  const values: number[] = []
  for (const section of sections) {
    const edge = input.edges.find((candidate) => candidate.id === section.edgeId)!
    const sourceNode = index.ports.get(edge.sourcePortId)!.nodeId
    const targetNode = index.ports.get(edge.targetPortId)!.nodeId
    const points = [section.startPoint, ...section.bendPoints, section.endPoint]
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      const from = points[pointIndex - 1]!
      const to = points[pointIndex]!
      for (const node of index.sortedNodes) {
        if (node.id === sourceNode || node.id === targetNode) continue
        const distance = segmentRectDistance(from, to, node.rect)
        if (distance >= input.clearance && distance <= input.clearance * 4) values.push(distance)
      }
    }
  }
  if (values.length === 0) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
}

function countCrossingsByEdge(sections: readonly RouteSection[]): ReadonlyMap<string, number> {
  const crossings = new Map<string, number>()
  for (let leftIndex = 0; leftIndex < sections.length; leftIndex += 1) {
    const left = [sections[leftIndex]!.startPoint, ...sections[leftIndex]!.bendPoints, sections[leftIndex]!.endPoint]
    for (let rightIndex = leftIndex + 1; rightIndex < sections.length; rightIndex += 1) {
      const right = [sections[rightIndex]!.startPoint, ...sections[rightIndex]!.bendPoints, sections[rightIndex]!.endPoint]
      for (let li = 1; li < left.length; li += 1) {
        for (let ri = 1; ri < right.length; ri += 1) {
          if (!properPerpendicularCrossing(left[li - 1]!, left[li]!, right[ri - 1]!, right[ri]!)) continue
          const leftEdgeId = sections[leftIndex]!.edgeId
          const rightEdgeId = sections[rightIndex]!.edgeId
          crossings.set(leftEdgeId, (crossings.get(leftEdgeId) ?? 0) + 1)
          crossings.set(rightEdgeId, (crossings.get(rightEdgeId) ?? 0) + 1)
        }
      }
    }
  }
  return crossings
}

function simplifyPoints(points: readonly FixedPoint[]): readonly FixedPoint[] {
  const result: FixedPoint[] = []
  for (const point of points) {
    if (samePoint(result.at(-1), point)) continue
    result.push(point)
    while (result.length >= 3) {
      const a = result.at(-3)!
      const b = result.at(-2)!
      const c = result.at(-1)!
      if (!((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y))) break
      result.splice(result.length - 2, 1)
    }
  }
  return result
}

function ancestorNodes(nodeId: string, index: RouteIndex): readonly RouteNode[] {
  const result: RouteNode[] = []
  let current = index.parentByChild.get(nodeId)
  while (current !== undefined) {
    result.push(required(index.nodes.get(current), `missing ancestor ${current}`))
    current = index.parentByChild.get(current)
  }
  return result
}

function takeUntil(nodes: readonly RouteNode[], ownerId: string | undefined): readonly RouteNode[] {
  if (ownerId === undefined) return nodes
  const index = nodes.findIndex((node) => node.id === ownerId)
  return index < 0 ? nodes : nodes.slice(0, index)
}

function isAncestor(ancestor: string, descendant: string, parentByChild: ReadonlyMap<string, string>): boolean {
  let current = parentByChild.get(descendant)
  while (current !== undefined) {
    if (current === ancestor) return true
    current = parentByChild.get(current)
  }
  return false
}

function insetRect(rect: FixedRect, amount: number): FixedRect {
  return {x: rect.x + amount, y: rect.y + amount, w: rect.w - amount * 2, h: rect.h - amount * 2}
}

function expandRect(rect: FixedRect, amount: number): FixedRect {
  return {x: rect.x - amount, y: rect.y - amount, w: rect.w + amount * 2, h: rect.h + amount * 2}
}

function rectRight(rect: FixedRect): number { return rect.x + rect.w }
function rectBottom(rect: FixedRect): number { return rect.y + rect.h }

function containsRect(outer: FixedRect, inner: FixedRect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && rectRight(inner) <= rectRight(outer) && rectBottom(inner) <= rectBottom(outer)
}

function rectInteriorOverlaps(left: FixedRect, right: FixedRect): boolean {
  return Math.max(left.x, right.x) < Math.min(rectRight(left), rectRight(right)) &&
    Math.max(left.y, right.y) < Math.min(rectBottom(left), rectBottom(right))
}

function containsPoint(rect: FixedRect, point: FixedPoint): boolean {
  return point.x >= rect.x && point.x <= rectRight(rect) && point.y >= rect.y && point.y <= rectBottom(rect)
}

function insideOpen(rect: FixedRect, point: FixedPoint): boolean {
  return point.x > rect.x && point.x < rectRight(rect) && point.y > rect.y && point.y < rectBottom(rect)
}

function segmentIntersectsOpenRect(from: FixedPoint, to: FixedPoint, rect: FixedRect): boolean {
  if (from.y === to.y) {
    return from.y > rect.y && from.y < rectBottom(rect) &&
      Math.max(Math.min(from.x, to.x), rect.x) < Math.min(Math.max(from.x, to.x), rectRight(rect))
  }
  return from.x > rect.x && from.x < rectRight(rect) &&
    Math.max(Math.min(from.y, to.y), rect.y) < Math.min(Math.max(from.y, to.y), rectBottom(rect))
}

function onStub(point: FixedPoint, from: FixedPoint, to: FixedPoint): boolean {
  return point.y === from.y && point.y === to.y && point.x >= Math.min(from.x, to.x) && point.x <= Math.max(from.x, to.x)
}

function segmentOnStub(a: FixedPoint, b: FixedPoint, from: FixedPoint, to: FixedPoint): boolean {
  return onStub(a, from, to) && onStub(b, from, to)
}

function obstacleIntersectionOnStub(
  a: FixedPoint,
  b: FixedPoint,
  obstacle: FixedRect,
  stubFrom: FixedPoint,
  stubTo: FixedPoint,
): boolean {
  if (a.y !== b.y || a.y !== stubFrom.y || a.y !== stubTo.y) return false
  const intersectionMin = Math.max(Math.min(a.x, b.x), obstacle.x)
  const intersectionMax = Math.min(Math.max(a.x, b.x), rectRight(obstacle))
  const stubMin = Math.min(stubFrom.x, stubTo.x)
  const stubMax = Math.max(stubFrom.x, stubTo.x)
  return intersectionMin >= stubMin && intersectionMax <= stubMax
}

function parallelTooClose(a: FixedPoint, b: FixedPoint, c: FixedPoint, d: FixedPoint, clearance: number): boolean {
  const aHorizontal = a.y === b.y
  const cHorizontal = c.y === d.y
  if (aHorizontal !== cHorizontal) return false
  if (aHorizontal) {
    const overlap = Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) < Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
    return overlap && Math.abs(a.y - c.y) < clearance
  }
  const overlap = Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) < Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
  return overlap && Math.abs(a.x - c.x) < clearance
}

function runsAlongBoundary(from: FixedPoint, to: FixedPoint, rect: FixedRect): boolean {
  if (from.x === to.x && (from.x === rect.x || from.x === rectRight(rect))) {
    return Math.max(Math.min(from.y, to.y), rect.y) < Math.min(Math.max(from.y, to.y), rectBottom(rect))
  }
  if (from.y === to.y && (from.y === rect.y || from.y === rectBottom(rect))) {
    return Math.max(Math.min(from.x, to.x), rect.x) < Math.min(Math.max(from.x, to.x), rectRight(rect))
  }
  return false
}

function horizontalSideCrossing(from: FixedPoint, to: FixedPoint, rect: FixedRect): boolean {
  if (from.y !== to.y || from.y <= rect.y || from.y >= rectBottom(rect)) return false
  const min = Math.min(from.x, to.x)
  const max = Math.max(from.x, to.x)
  return (min < rect.x && max >= rect.x) || (min <= rectRight(rect) && max > rectRight(rect))
}

function properPerpendicularCrossing(a: FixedPoint, b: FixedPoint, c: FixedPoint, d: FixedPoint): boolean {
  const aHorizontal = a.y === b.y
  const cHorizontal = c.y === d.y
  if (aHorizontal === cHorizontal) return false
  const horizontalA = aHorizontal ? a : c
  const horizontalB = aHorizontal ? b : d
  const verticalA = aHorizontal ? c : a
  const verticalB = aHorizontal ? d : b
  const x = verticalA.x
  const y = horizontalA.y
  return x > Math.min(horizontalA.x, horizontalB.x) && x < Math.max(horizontalA.x, horizontalB.x) &&
    y > Math.min(verticalA.y, verticalB.y) && y < Math.max(verticalA.y, verticalB.y)
}

function segmentRectDistance(from: FixedPoint, to: FixedPoint, rect: FixedRect): number {
  if (from.y === to.y) {
    const overlapsX = Math.max(Math.min(from.x, to.x), rect.x) <= Math.min(Math.max(from.x, to.x), rectRight(rect))
    if (!overlapsX) return Number.POSITIVE_INFINITY
    if (from.y < rect.y) return rect.y - from.y
    if (from.y > rectBottom(rect)) return from.y - rectBottom(rect)
    return 0
  }
  const overlapsY = Math.max(Math.min(from.y, to.y), rect.y) <= Math.min(Math.max(from.y, to.y), rectBottom(rect))
  if (!overlapsY) return Number.POSITIVE_INFINITY
  if (from.x < rect.x) return rect.x - from.x
  if (from.x > rectRight(rect)) return from.x - rectRight(rect)
  return 0
}

function pathLength(points: readonly FixedPoint[]): number {
  let total = 0
  for (let index = 1; index < points.length; index += 1) total += manhattanBetween(points[index - 1]!, points[index]!)
  return total
}

function manhattanBetween(left: FixedPoint, right: FixedPoint): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y)
}

function pointAt(state: Pick<SearchState, "xi" | "yi">, xs: readonly number[], ys: readonly number[]): FixedPoint {
  return {x: xs[state.xi]!, y: ys[state.yi]!}
}

function stepDirectionBetween(from: FixedPoint, to: FixedPoint): StepDirection | null {
  if (from.y === to.y) return to.x > from.x ? "EAST" : to.x < from.x ? "WEST" : null
  if (from.x === to.x) return to.y > from.y ? "SOUTH" : to.y < from.y ? "NORTH" : null
  return null
}

function axisOfStepDirection(direction: StepDirection | null): Axis | null {
  return direction === null ? null : direction === "WEST" || direction === "EAST" ? "H" : "V"
}

function isOppositeStepDirection(previous: StepDirection | null, next: StepDirection): boolean {
  return (previous === "WEST" && next === "EAST") ||
    (previous === "EAST" && next === "WEST") ||
    (previous === "NORTH" && next === "SOUTH") ||
    (previous === "SOUTH" && next === "NORTH")
}

function stepDirectionIndex(direction: StepDirection | null): number {
  return direction === null ? 0 : direction === "WEST" ? 1 : direction === "NORTH" ? 2 : direction === "SOUTH" ? 3 : 4
}

function pointKey(point: FixedPoint): string { return `${signedKey(point.x)},${signedKey(point.y)}` }
function signedKey(value: number): string { return `${value < 0 ? "-" : "+"}${Math.abs(value).toString().padStart(16, "0")}` }

function compareScores(left: Score, right: Score): number {
  return left.crossings - right.crossings || left.turns - right.turns || left.length - right.length
}

function compareHeapItems(left: HeapItem, right: HeapItem): number {
  return left.score.crossings - right.score.crossings ||
    left.estimatedTurns - right.estimatedTurns ||
    left.estimatedLength - right.estimatedLength ||
    left.score.turns - right.score.turns ||
    left.score.length - right.score.length ||
    compareStates(left.state, right.state)
}

function comparePointPaths(left: readonly FixedPoint[], right: readonly FixedPoint[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftPoint = left[index]
    const rightPoint = right[index]
    if (leftPoint === undefined || rightPoint === undefined) return leftPoint === undefined ? -1 : 1
    const difference = leftPoint.x - rightPoint.x || leftPoint.y - rightPoint.y
    if (difference !== 0) return difference
  }
  return 0
}

function compareStates(left: SearchState, right: SearchState): number {
  const nullable = (leftValue: number | null, rightValue: number | null): number =>
    leftValue === rightValue ? 0 : leftValue === null ? -1 : rightValue === null ? 1 : leftValue - rightValue
  return left.xi - right.xi ||
    left.yi - right.yi ||
    stepDirectionIndex(left.lastDirection) - stepDirectionIndex(right.lastDirection) ||
    left.sourceExited - right.sourceExited ||
    left.targetEntered - right.targetEntered ||
    nullable(left.sourceGatewayY, right.sourceGatewayY) ||
    nullable(left.targetGatewayY, right.targetGatewayY)
}

class MinHeap {
  readonly #items: HeapItem[] = []
  constructor(private readonly compare: (left: HeapItem, right: HeapItem) => number) {}
  get size(): number { return this.#items.length }
  push(item: HeapItem): void {
    this.#items.push(item)
    let index = this.#items.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.compare(this.#items[parent]!, item) <= 0) break
      this.#items[index] = this.#items[parent]!
      index = parent
    }
    this.#items[index] = item
  }
  pop(): HeapItem | undefined {
    const first = this.#items[0]
    const last = this.#items.pop()
    if (this.#items.length === 0 || last === undefined) return first
    let index = 0
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      if (left >= this.#items.length) break
      const child = right < this.#items.length && this.compare(this.#items[right]!, this.#items[left]!) < 0 ? right : left
      if (this.compare(last, this.#items[child]!) <= 0) break
      this.#items[index] = this.#items[child]!
      index = child
    }
    this.#items[index] = last
    return first
  }
}

function requireId(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} id is empty`)
}

function requirePoint(point: FixedPoint, label: string): void {
  if (!Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) throw new Error(`${label} is not fixed-point integer geometry`)
}

function requireRect(rect: FixedRect, label: string): void {
  requirePoint({x: rect.x, y: rect.y}, label)
  if (!Number.isSafeInteger(rect.w) || !Number.isSafeInteger(rect.h) || rect.w <= 0 || rect.h <= 0) {
    throw new Error(`${label} is not a positive fixed-point rectangle`)
  }
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`)
}

function samePoint(left: FixedPoint | undefined, right: FixedPoint | undefined): boolean {
  return left !== undefined && right !== undefined && left.x === right.x && left.y === right.y
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message)
  return value
}
