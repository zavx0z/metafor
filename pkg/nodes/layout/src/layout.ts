import type {
  LayoutGraph,
  LayoutResult,
} from "../types/protocol.ts"
import type {EngineResult} from "../types/engine.ts"
import type {PlacementInput, PlacementResult} from "../types/placement.ts"
import type {RouteGraphResult} from "../types/routing.ts"
import {placeGraph, placementCandidates, validatePlacement} from "./place-graph.ts"
import {measureRouteGraphResult, routeGraph, validateRouteGraphResult} from "./route-graph.ts"

const COORDINATE_SCALE = 1_000
const DEFAULT_SPACING = 28
const MAX_ROUTED_PLACEMENTS = 8
const MAX_FALLBACK_ROUTED_PLACEMENTS = 24

/**
 * Вычисляет всю геометрию graph: placement, compound compaction и routing.
 * Функция синхронна, детерминирована и не обращается к DOM, Worker или времени.
 *
 * @param graph - Уже измеренный ELK-like graph. Все размеры и offsets задаются
 * в логических пикселях и должны быть конечными положительными числами.
 * @returns Геометрию в логических пикселях с одним route section на edge.
 * @throws Если graph противоречив или для него не существует законной геометрии.
 *
 * @example
 * ```ts
 * const result = layout({
 *   viewport: {width: 900, height: 600},
 *   nodes: [
 *     {id: "source", width: 180, height: 100},
 *     {id: "target", width: 180, height: 100},
 *   ],
 *   ports: [
 *     {id: "source/out", nodeId: "source", y: 72},
 *     {id: "target/in", nodeId: "target", y: 72},
 *   ],
 *   edges: [{id: "message", sourcePortId: "source/out", targetPortId: "target/in"}],
 * })
 * ```
 */
export function layout(graph: LayoutGraph): LayoutResult {
  const input = toPlacementInput(graph)
  return toLayoutResult(layoutEngine(input))
}

function layoutEngine(input: PlacementInput): EngineResult {
  const placements = placementCandidates(input)
  const stableKey = (placement: PlacementResult): string => JSON.stringify({
    nodes: placement.nodes,
    ports: placement.ports,
    bounds: placement.bounds,
  })
  const preferredKey = input.viewport.width >= input.viewport.height
    ? stableKey(placeGraph(input))
    : null
  const comparePlacementQuality = (left: PlacementResult, right: PlacementResult): number => {
    if (preferredKey !== null) {
      const leftPreferred = stableKey(left) === preferredKey
      const rightPreferred = stableKey(right) === preferredKey
      if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1
    } else {
      if (left.metrics.displayEmptyRatio !== right.metrics.displayEmptyRatio) {
        return left.metrics.displayEmptyRatio - right.metrics.displayEmptyRatio
      }
      if (left.metrics.compoundEmptyRatio !== right.metrics.compoundEmptyRatio) {
        return left.metrics.compoundEmptyRatio - right.metrics.compoundEmptyRatio
      }
      if (left.metrics.fitScale !== right.metrics.fitScale) {
        return right.metrics.fitScale - left.metrics.fitScale
      }
      const leftArea = left.bounds.w * left.bounds.h
      const rightArea = right.bounds.w * right.bounds.h
      if (leftArea !== rightArea) return leftArea - rightArea
    }
    return 0
  }
  const ordered = [...placements].sort((left, right) =>
    comparePlacementQuality(left, right) || compareIds(stableKey(left), stableKey(right)))
  const bounded = boundedPlacements(ordered, MAX_ROUTED_PLACEMENTS)
  const compareRoutingQuality = (left: EngineResult, right: EngineResult): number => {
    const leftMetrics = left.routing.metrics
    const rightMetrics = right.routing.metrics
    const primary = leftMetrics.crossings - rightMetrics.crossings ||
      leftMetrics.maxCrossings - rightMetrics.maxCrossings ||
      leftMetrics.totalTurns - rightMetrics.totalTurns ||
      leftMetrics.maxTurns - rightMetrics.maxTurns ||
      left.placement.metrics.sourceCorridorDeficit - right.placement.metrics.sourceCorridorDeficit ||
      leftMetrics.totalManhattan - rightMetrics.totalManhattan ||
      leftMetrics.maxManhattan - rightMetrics.maxManhattan ||
      leftMetrics.maxDetour - rightMetrics.maxDetour
    if (primary !== 0) return primary
    const leftDetours = [...leftMetrics.perEdge]
      .sort((a, b) => compareIds(a.edgeId, b.edgeId)).map(({detour}) => detour)
    const rightDetours = [...rightMetrics.perEdge]
      .sort((a, b) => compareIds(a.edgeId, b.edgeId)).map(({detour}) => detour)
    for (let index = 0; index < Math.max(leftDetours.length, rightDetours.length); index += 1) {
      const difference = (leftDetours[index] ?? 0) - (rightDetours[index] ?? 0)
      if (difference !== 0) return difference
    }
    return comparePlacementQuality(left.placement, right.placement) ||
      leftMetrics.clearanceVariance - rightMetrics.clearanceVariance ||
      compareIds(stableKey(left.placement), stableKey(right.placement))
  }
  const routable: EngineResult[] = []
  let firstRouteFailure: string | null = null
  let attemptedPlacements = 0
  const routePlacements = (
    candidates: readonly PlacementResult[],
    stopAfterFirstRoutable = false,
  ): void => {
    for (const placement of candidates) {
      attemptedPlacements += 1
      try {
        let acceptedPlacement = placement
        let routing = routeGraph(placement.routeInput)
        const compacted = compactCompoundSideReserves(input, placement, routing)
        if (compacted !== null) {
          const placementViolations = validatePlacement(input, compacted)
          if (placementViolations.length > 0) {
            firstRouteFailure ??= `COMPACTED_PLACEMENT_INVALID ${placementViolations.join(",")}`
            continue
          }
          const measured = measureRouteGraphResult(compacted.routeInput, routing)
          acceptedPlacement = compacted
          routing = measured
        }
        const unusedReserves = [
          ...findUnusedCompoundBottomReserves(input, acceptedPlacement, routing),
          ...findUnusedCompoundSideReserves(input, acceptedPlacement, routing),
        ]
        if (unusedReserves.length > 0) {
          firstRouteFailure ??= `UNUSED_COMPOUND_RESERVE ${unusedReserves.join(",")}`
          continue
        }
        routable.push({placement: acceptedPlacement, routing, candidates: {generated: placements.length, routable: 0}})
        if (stopAfterFirstRoutable) return
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("NO_LEGAL_ROUTE ")) throw error
        firstRouteFailure ??= error.message
      }
    }
  }
  routePlacements(bounded)
  if (routable.length === 0 && bounded.length < ordered.length) {
    const attemptedKeys = new Set(bounded.map(stableKey))
    const fallback = ordered
      .filter((placement) => !attemptedKeys.has(stableKey(placement)))
      .slice(0, MAX_FALLBACK_ROUTED_PLACEMENTS)
    routePlacements(fallback, true)
  }
  if (routable.length > 0) {
    for (const candidate of routable.sort(compareRoutingQuality)) {
      const hardViolations = validateRouteGraphResult(candidate.placement.routeInput, candidate.routing)
      if (hardViolations.length > 0) {
        firstRouteFailure ??= `COMPACTED_ROUTE_INVALID ${hardViolations.join(",")}`
        continue
      }
      return {
        ...candidate,
        routing: measureRouteGraphResult(candidate.placement.routeInput, candidate.routing, hardViolations),
        candidates: {generated: placements.length, routable: routable.length},
      }
    }
  }
  throw new Error(
    `NO_LEGAL_LAYOUT: ${attemptedPlacements}/${placements.length} placements provide no legal route graph` +
    (firstRouteFailure === null ? "" : `; first route failure: ${firstRouteFailure}`),
  )
}

function compactCompoundSideReserves(
  input: PlacementInput,
  placement: PlacementResult,
  routing: RouteGraphResult,
): PlacementResult | null {
  if (placement.direction !== "DOWN") return null
  const intrinsicById = new Map(input.nodes.map((node) => [node.id, node]))
  const nodeIdsWithPorts = new Set(input.ports.map((port) => port.nodeId))
  const nodeById = new Map(placement.nodes.map((node) => [node.id, node]))
  const childrenByParent = new Map<string, string[]>()
  for (const node of input.nodes) {
    if (node.parentId === undefined) continue
    const children = childrenByParent.get(node.parentId) ?? []
    children.push(node.id)
    childrenByParent.set(node.parentId, children)
  }
  const verticalSegments = routing.sections.flatMap((section) => {
    const points = [section.startPoint, ...section.bendPoints, section.endPoint]
    return points.slice(1).flatMap((to, index) => {
      const from = points[index]!
      return from.x === to.x
        ? [{x: from.x, top: Math.min(from.y, to.y), bottom: Math.max(from.y, to.y)}]
        : []
    })
  })
  let changed = false
  const compactedNodes = placement.nodes.map((node) => {
    const childIds = childrenByParent.get(node.id)
    const intrinsic = intrinsicById.get(node.id)
    if (childIds === undefined || intrinsic === undefined || nodeIdsWithPorts.has(node.id)) return node
    const children = childIds.flatMap((id) => {
      const child = nodeById.get(id)
      return child === undefined ? [] : [child]
    })
    if (children.length === 0) return node
    const tracks = verticalSegments
      .filter(({top, bottom}) => top < node.rect.y + node.rect.h && bottom > node.rect.y)
      .map(({x}) => x)
      .filter((x) => x > node.rect.x && x < node.rect.x + node.rect.w)
    const occupiedLeft = Math.min(...children.map(({rect}) => rect.x), ...tracks)
    const occupiedRight = Math.max(...children.map(({rect}) => rect.x + rect.w), ...tracks)
    let left = Math.max(node.rect.x, occupiedLeft - input.clearance)
    let right = Math.min(node.rect.x + node.rect.w, occupiedRight + input.clearance)
    if (right - left < intrinsic.size.w) {
      const missing = intrinsic.size.w - (right - left)
      const growLeft = Math.min(left - node.rect.x, Math.ceil(missing / 2))
      left -= growLeft
      right = Math.min(node.rect.x + node.rect.w, right + missing - growLeft)
      left = Math.max(node.rect.x, right - intrinsic.size.w)
    }
    if (left === node.rect.x && right === node.rect.x + node.rect.w) return node
    changed = true
    const rect = {...node.rect, x: left, w: right - left}
    return {...node, rect, ...(node.contentRect === undefined ? {} : {contentRect: {...node.contentRect, x: left, w: right - left}})}
  })
  if (!changed) return null
  const compactedNodeById = new Map(compactedNodes.map((node) => [node.id, node]))
  const compactedPorts = placement.ports.map((port) => {
    const node = compactedNodeById.get(port.nodeId)!
    return {...port, center: {...port.center, x: port.side === "WEST" ? node.rect.x : node.rect.x + node.rect.w}}
  })
  const compactedMetrics = measureCompactedPlacement(input, placement, compactedNodes, compactedPorts)
  return {
    ...placement,
    nodes: compactedNodes,
    ports: compactedPorts,
    metrics: compactedMetrics,
    routeInput: {...placement.routeInput, nodes: compactedNodes, ports: compactedPorts},
  }
}

function measureCompactedPlacement(
  input: PlacementInput,
  placement: PlacementResult,
  nodes: PlacementResult["nodes"],
  ports: PlacementResult["ports"],
): PlacementResult["metrics"] {
  const intrinsicById = new Map(input.nodes.map((node) => [node.id, node]))
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const childrenByParent = new Map<string, string[]>()
  for (const node of input.nodes) {
    if (node.parentId === undefined) continue
    const children = childrenByParent.get(node.parentId) ?? []
    children.push(node.id)
    childrenByParent.set(node.parentId, children)
  }
  const compounds = nodes.filter((node) => childrenByParent.has(node.id))
  const compoundEmptyRatios = compounds.map((node) => {
    const ownContentArea = node.rect.w * intrinsicById.get(node.id)!.contentHeight
    const childArea = childrenByParent.get(node.id)!.reduce((sum, id) => {
      const child = nodeById.get(id)!
      return sum + child.rect.w * child.rect.h
    }, 0)
    return 1 - (ownContentArea + childArea) / (node.rect.w * node.rect.h)
  })
  const compoundArea = compounds.reduce((sum, node) => sum + node.rect.w * node.rect.h, 0)
  const occupiedArea = compounds.reduce((sum, node, index) =>
    sum + node.rect.w * node.rect.h * (1 - compoundEmptyRatios[index]!), 0)
  const fitScale = Math.min(
    input.viewport.width * input.unitsPerPixel / placement.bounds.w,
    input.viewport.height * input.unitsPerPixel / placement.bounds.h,
    1,
  )
  const visibleContentArea = nodes.reduce((sum, node) =>
    sum + node.rect.w * intrinsicById.get(node.id)!.contentHeight, 0)
  const viewportArea = input.viewport.width * input.unitsPerPixel * input.viewport.height * input.unitsPerPixel
  const displayEmptyRatio = Math.max(0, 1 - visibleContentArea * fitScale ** 2 / viewportArea)
  const portById = new Map(ports.map((port) => [port.id, port]))
  const forwardBySource = new Map<string, Array<Readonly<{sourceId: string; targetId: string}>>>()
  for (const edge of input.edges) {
    const source = portById.get(edge.sourcePortId)
    const target = portById.get(edge.targetPortId)
    if (source === undefined || target === undefined) continue
    const sourceRect = nodeById.get(source.nodeId)!.rect
    const targetRect = nodeById.get(target.nodeId)!.rect
    if (targetRect.y <= sourceRect.y) continue
    const entries = forwardBySource.get(source.nodeId) ?? []
    entries.push({sourceId: source.id, targetId: target.id})
    forwardBySource.set(source.nodeId, entries)
  }
  const sourceCorridorDeficit = [...forwardBySource.values()].reduce((total, entries) => {
    const requiredRunway = (entries.length + 1) * input.clearance
    return total + entries.reduce((sum, {sourceId, targetId}) => {
      const source = portById.get(sourceId)!
      const target = portById.get(targetId)!
      return sum + Math.max(0, source.center.x + requiredRunway - target.center.x)
    }, 0)
  }, 0)
  return {
    ...placement.metrics,
    fitScale,
    displayEmptyRatio,
    compoundEmptyRatio: compoundArea === 0 ? 0 : 1 - occupiedArea / compoundArea,
    maxCompoundEmptyRatio: Math.max(0, ...compoundEmptyRatios),
    sourceCorridorDeficit,
  }
}

function findUnusedCompoundBottomReserves(
  input: PlacementInput,
  placement: PlacementResult,
  routing: RouteGraphResult,
): readonly string[] {
  if (placement.direction !== "RIGHT") return []
  const nodeById = new Map(placement.nodes.map((node) => [node.id, node]))
  const intrinsicById = new Map(input.nodes.map((node) => [node.id, node]))
  const childrenByParent = new Map<string, string[]>()
  for (const node of input.nodes) {
    if (node.parentId === undefined) continue
    const children = childrenByParent.get(node.parentId) ?? []
    children.push(node.id)
    childrenByParent.set(node.parentId, children)
  }
  const routePoints = routing.sections.flatMap((section) => [
    section.startPoint,
    ...section.bendPoints,
    section.endPoint,
  ])
  const result: string[] = []
  for (const [parentId, childIds] of childrenByParent) {
    const parent = nodeById.get(parentId)
    const intrinsic = intrinsicById.get(parentId)
    if (parent === undefined || intrinsic === undefined) continue
    let occupiedBottom = parent.rect.y + intrinsic.size.h
    for (const childId of childIds) {
      const child = nodeById.get(childId)
      if (child !== undefined) occupiedBottom = Math.max(occupiedBottom, child.rect.y + child.rect.h)
    }
    for (const point of routePoints) {
      if (
        point.x >= parent.rect.x &&
        point.x <= parent.rect.x + parent.rect.w &&
        point.y >= parent.rect.y &&
        point.y <= parent.rect.y + parent.rect.h
      ) occupiedBottom = Math.max(occupiedBottom, point.y)
    }
    const unused = parent.rect.y + parent.rect.h - occupiedBottom - input.clearance
    if (unused > 0) result.push(`${parentId}:${unused}`)
  }
  return result.sort(compareIds)
}

function findUnusedCompoundSideReserves(
  input: PlacementInput,
  placement: PlacementResult,
  routing: RouteGraphResult,
): readonly string[] {
  if (placement.direction !== "DOWN") return []
  const nodeById = new Map(placement.nodes.map((node) => [node.id, node]))
  const nodeIdsWithPorts = new Set(input.ports.map((port) => port.nodeId))
  const childrenByParent = new Map<string, string[]>()
  for (const node of input.nodes) {
    if (node.parentId === undefined) continue
    const children = childrenByParent.get(node.parentId) ?? []
    children.push(node.id)
    childrenByParent.set(node.parentId, children)
  }
  const verticalSegments = routing.sections.flatMap((section) => {
    const points = [section.startPoint, ...section.bendPoints, section.endPoint]
    return points.slice(1).flatMap((to, index) => {
      const from = points[index]!
      return from.x === to.x
        ? [{x: from.x, top: Math.min(from.y, to.y), bottom: Math.max(from.y, to.y)}]
        : []
    })
  })
  const result: string[] = []
  for (const [parentId, childIds] of childrenByParent) {
    const parent = nodeById.get(parentId)
    const children = childIds.flatMap((id) => {
      const child = nodeById.get(id)
      return child === undefined ? [] : [child]
    })
    if (parent === undefined || children.length === 0 || nodeIdsWithPorts.has(parentId)) continue
    const parentLeft = parent.rect.x
    const parentRight = parent.rect.x + parent.rect.w
    const childLeft = Math.min(...children.map(({rect}) => rect.x))
    const childRight = Math.max(...children.map(({rect}) => rect.x + rect.w))
    const tracks = verticalSegments
      .filter(({top, bottom}) => top < parent.rect.y + parent.rect.h && bottom > parent.rect.y)
      .map(({x}) => x)
    const sides = [
      {name: "left", coordinates: [parentLeft, ...tracks.filter((x) => x > parentLeft && x < childLeft), childLeft]},
      {name: "right", coordinates: [childRight, ...tracks.filter((x) => x > childRight && x < parentRight), parentRight]},
    ] as const
    for (const side of sides) {
      const coordinates = [...new Set(side.coordinates)].sort((left, right) => left - right)
      const maximumGap = Math.max(...coordinates.slice(1).map((value, index) => value - coordinates[index]!))
      if (maximumGap > input.clearance) result.push(`${parentId}:${side.name}:${maximumGap}`)
    }
  }
  return result.sort(compareIds)
}

function boundedPlacements(
  ordered: readonly PlacementResult[],
  limit: number,
): readonly PlacementResult[] {
  if (ordered.length <= limit) return ordered
  const selected = new Set<number>()
  // Placement candidates are already ordered by product quality. Keep most of
  // the bounded routing budget on that head while still sampling the tail for
  // a structurally different fallback. A half/head split skipped the first
  // routable high-quality placement of a bidirectional cross-compound contour.
  const preferredCount = Math.ceil(limit * 3 / 4)
  for (let index = 0; index < preferredCount; index += 1) selected.add(index)
  const remaining = limit - selected.size
  for (let index = 1; index <= remaining; index += 1) {
    selected.add(Math.round(index * (ordered.length - 1) / remaining))
  }
  return [...selected].sort((left, right) => left - right).map((index) => ordered[index]!)
}

function toPlacementInput(graph: LayoutGraph): PlacementInput {
  const spacing = positive(graph.layoutOptions?.spacing, DEFAULT_SPACING, "spacing")
  const clearance = positive(graph.layoutOptions?.clearance, spacing, "clearance")
  const padding = positive(graph.layoutOptions?.padding, spacing, "padding")
  const layerSpacing = Math.max(positive(graph.layoutOptions?.layerSpacing, spacing, "layerSpacing"), clearance)
  const portById = new Map(graph.ports.map((port) => [port.id, port]))
  if (portById.size !== graph.ports.length) throw new Error("Layout port ids must be globally unique")
  const roles = new Map<string, "in" | "out">()
  for (const edge of graph.edges) {
    setPortRole(roles, edge.sourcePortId, "out", edge.id)
    setPortRole(roles, edge.targetPortId, "in", edge.id)
    if (!portById.has(edge.sourcePortId)) throw new Error(`Unknown source port: ${edge.id}/${edge.sourcePortId}`)
    if (!portById.has(edge.targetPortId)) throw new Error(`Unknown target port: ${edge.id}/${edge.targetPortId}`)
  }
  return {
    unitsPerPixel: COORDINATE_SCALE,
    viewport: {
      width: positive(graph.viewport.width, undefined, "viewport.width"),
      height: positive(graph.viewport.height, undefined, "viewport.height"),
    },
    clearance: scaled(clearance),
    padding: scaled(padding),
    nodeSpacing: scaled(spacing),
    layerSpacing: scaled(layerSpacing),
    outerPadding: scaled(padding),
    nodes: graph.nodes.map((node) => {
      const height = scaledPositive(node.height, `node.height:${node.id}`)
      const contentHeight = scaledPositive(node.contentHeight ?? node.height, `node.contentHeight:${node.id}`)
      if (contentHeight > height) throw new Error(`node.contentHeight must not exceed height: ${node.id}`)
      return {
        id: node.id,
        ...(node.parentId === undefined ? {} : {parentId: node.parentId}),
        size: {w: scaledPositive(node.width, `node.width:${node.id}`), h: height},
        contentHeight,
      }
    }),
    ports: graph.ports.flatMap((port) => {
      const direction = roles.get(port.id)
      if (direction === undefined) return []
      return [{
        id: port.id,
        nodeId: port.nodeId,
        offsetY: scaled(port.y),
        side: direction === "out" ? "EAST" as const : "WEST" as const,
        direction,
      }]
    }),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sourcePortId: edge.sourcePortId,
      targetPortId: edge.targetPortId,
    })),
  }
}

function toLayoutResult(result: EngineResult): LayoutResult {
  return {
    direction: result.placement.direction,
    bounds: rectangle(result.placement.bounds),
    nodes: result.placement.nodes.map((node) => ({id: node.id, ...rectangle(node.rect)})),
    ports: result.placement.ports.map((port) => ({
      id: port.id,
      x: pixels(port.center.x),
      y: pixels(port.center.y),
    })),
    edges: result.routing.sections.map((section) => ({
      id: section.edgeId,
      sections: [{
        startPoint: point(section.startPoint),
        bendPoints: section.bendPoints.map(point),
        endPoint: point(section.endPoint),
      }],
    })),
  }
}

function setPortRole(roles: Map<string, "in" | "out">, portId: string, role: "in" | "out", edgeId: string): void {
  const previous = roles.get(portId)
  if (previous !== undefined && previous !== role) throw new Error(`Port has conflicting edge roles: ${edgeId}/${portId}`)
  roles.set(portId, role)
}

function positive(value: number | undefined, fallback: number | undefined, label: string): number {
  const candidate = value ?? fallback
  if (candidate === undefined || !Number.isFinite(candidate) || candidate <= 0) {
    throw new Error(`${label} must be positive`)
  }
  return candidate
}

function scaledPositive(value: number, label: string): number {
  positive(value, undefined, label)
  return scaled(value)
}

function scaled(value: number): number {
  const result = Math.round(value * COORDINATE_SCALE)
  if (!Number.isSafeInteger(result)) throw new Error(`Layout coordinate exceeds the safe range: ${value}`)
  return result
}

function pixels(value: number): number {
  return value / COORDINATE_SCALE
}

function point(value: Readonly<{x: number; y: number}>): Readonly<{x: number; y: number}> {
  return {x: pixels(value.x), y: pixels(value.y)}
}

function rectangle(value: Readonly<{x: number; y: number; w: number; h: number}>): Readonly<{x: number; y: number; width: number; height: number}> {
  return {x: pixels(value.x), y: pixels(value.y), width: pixels(value.w), height: pixels(value.h)}
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
