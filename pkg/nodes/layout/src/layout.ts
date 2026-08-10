import type {
  LayoutGraph,
  LayoutResult,
} from "../types/protocol.ts"
import type {EngineResult} from "../types/engine.ts"
import type {PlacementInput, PlacementResult} from "../types/placement.ts"
import type {RouteGraphResult} from "../types/routing.ts"
import {placeGraph, placementCandidates} from "./place-graph.ts"
import {routeGraph} from "./route-graph.ts"

const COORDINATE_SCALE = 1_000
const DEFAULT_SPACING = 28

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
  const compareRoutingQuality = (left: EngineResult, right: EngineResult): number => {
    const leftMetrics = left.routing.metrics
    const rightMetrics = right.routing.metrics
    const primary = leftMetrics.totalTurns - rightMetrics.totalTurns ||
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
    return leftMetrics.clearanceVariance - rightMetrics.clearanceVariance ||
      leftMetrics.crossings - rightMetrics.crossings ||
      compareIds(stableKey(left.placement), stableKey(right.placement))
  }
  for (let start = 0; start < ordered.length;) {
    let end = start + 1
    while (end < ordered.length && comparePlacementQuality(ordered[start]!, ordered[end]!) === 0) end += 1
    const routable: EngineResult[] = []
    for (const placement of ordered.slice(start, end)) {
      try {
        const routing = routeGraph(placement.routeInput)
        routable.push({placement, routing, candidates: {generated: placements.length, routable: 0}})
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("NO_LEGAL_ROUTE ")) throw error
      }
    }
    if (routable.length > 0) {
      const best = routable.sort(compareRoutingQuality)[0]!
      return {...best, candidates: {generated: placements.length, routable: routable.length}}
    }
    start = end
  }
  throw new Error(`NO_LEGAL_LAYOUT: ${placements.length} generated placements provide no legal route graph`)
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
    padding: Math.max(scaled(padding), scaled(clearance) * 2),
    nodeSpacing: scaled(spacing),
    layerSpacing: scaled(layerSpacing),
    outerPadding: scaled(padding),
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      ...(node.parentId === undefined ? {} : {parentId: node.parentId}),
      size: {w: scaledPositive(node.width, `node.width:${node.id}`), h: scaledPositive(node.height, `node.height:${node.id}`)},
    })),
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
