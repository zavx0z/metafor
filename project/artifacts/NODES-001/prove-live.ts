import {layout} from "../../../pkg/nodes/layout/src/index.ts"
import type {LayoutGraph, LayoutPoint, LayoutRectangle, LayoutResult} from "../../../pkg/nodes/layout/types/protocol.ts"

const inputFile = Bun.argv[2]
if (inputFile === undefined) throw new Error("usage: bun prove-live.ts <layout-request.json>")
const graph = await Bun.file(inputFile).json() as LayoutGraph
const clearance = graph.layoutOptions?.clearance ?? graph.layoutOptions?.spacing ?? 28
const results = [layout(graph), layout(graph), layout(graph)]
const permuted = layout({...graph, nodes: [...graph.nodes].reverse(), ports: [...graph.ports].reverse(), edges: [...graph.edges].reverse()})
const canonical = JSON.stringify(results[0])
if (!results.every((result) => JSON.stringify(result) === canonical) || JSON.stringify(permuted) !== canonical) {
  throw new Error("layout is not repeat/permutation deterministic")
}
const result = results[0]!
const nodeInput = new Map(graph.nodes.map((node) => [node.id, node]))
const nodeGeometry = new Map(result.nodes.map((node) => [node.id, node]))
const portInput = new Map(graph.ports.map((port) => [port.id, port]))
const portGeometry = new Map(result.ports.map((port) => [port.id, port]))
const parent = new Map(graph.nodes.flatMap((node) => node.parentId === undefined ? [] : [[node.id, node.parentId] as const]))
const ancestors = (nodeId: string): ReadonlySet<string> => {
  const ids = new Set<string>()
  let current = parent.get(nodeId)
  while (current !== undefined) {
    ids.add(current)
    current = parent.get(current)
  }
  return ids
}
const segments = result.edges.flatMap((edge) => {
  const section = edge.sections[0]
  const points = [section.startPoint, ...section.bendPoints, section.endPoint]
  return points.slice(1).map((to, index) => ({edgeId: edge.id, from: points[index]!, to}))
})
for (const segment of segments) {
  if (segment.from.x !== segment.to.x && segment.from.y !== segment.to.y) {
    throw new Error(`non-orthogonal segment: ${segment.edgeId}`)
  }
}
for (const edge of graph.edges) {
  const routed = result.edges.find(({id}) => id === edge.id)
  if (routed === undefined) throw new Error(`missing edge: ${edge.id}`)
  const source = portGeometry.get(edge.sourcePortId)
  const target = portGeometry.get(edge.targetPortId)
  const section = routed.sections[0]
  if (source === undefined || target === undefined ||
    section.startPoint.x !== source.x || section.startPoint.y !== source.y ||
    section.endPoint.x !== target.x || section.endPoint.y !== target.y) {
    throw new Error(`inexact endpoint: ${edge.id}`)
  }
  const sourceNode = portInput.get(edge.sourcePortId)!.nodeId
  const targetNode = portInput.get(edge.targetPortId)!.nodeId
  const transparent = new Set([...ancestors(sourceNode), ...ancestors(targetNode)])
  const edgeSegments = segments.filter((segment) => segment.edgeId === edge.id)
  for (const node of graph.nodes) {
    if (node.id === sourceNode || node.id === targetNode) continue
    const geometry = nodeGeometry.get(node.id)!
    const obstacle = transparent.has(node.id)
      ? {x: geometry.x, y: geometry.y, width: geometry.width, height: node.contentHeight ?? node.height}
      : geometry
    const inflated = expand(obstacle, clearance)
    if (edgeSegments.some(({from, to}) => segmentIntersectsOpenRect(from, to, inflated))) {
      throw new Error(`edge-node clearance: ${edge.id}/${node.id}`)
    }
  }
}

const parallelMinimum = (axis: "H" | "V"): number => {
  const distances: number[] = []
  for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
    const left = segments[leftIndex]!
    const leftAxis = left.from.y === left.to.y ? "H" : "V"
    if (leftAxis !== axis) continue
    for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex += 1) {
      const right = segments[rightIndex]!
      const rightAxis = right.from.y === right.to.y ? "H" : "V"
      if (rightAxis !== axis || right.edgeId === left.edgeId) continue
      const leftStart = axis === "H" ? left.from.x : left.from.y
      const leftEnd = axis === "H" ? left.to.x : left.to.y
      const rightStart = axis === "H" ? right.from.x : right.from.y
      const rightEnd = axis === "H" ? right.to.x : right.to.y
      const overlap = Math.max(Math.min(leftStart, leftEnd), Math.min(rightStart, rightEnd)) <
        Math.min(Math.max(leftStart, leftEnd), Math.max(rightStart, rightEnd))
      if (!overlap) continue
      distances.push(axis === "H" ? Math.abs(left.from.y - right.from.y) : Math.abs(left.from.x - right.from.x))
    }
  }
  return distances.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...distances)
}
const parallelH = parallelMinimum("H")
const parallelV = parallelMinimum("V")
if (parallelH < clearance || parallelV < clearance) throw new Error(`edge-edge clearance: H=${parallelH}, V=${parallelV}`)
const fitScale = Math.min(graph.viewport.width / result.bounds.width, graph.viewport.height / result.bounds.height, 1)
const visibleArea = result.nodes.reduce((sum, node) => {
  const input = nodeInput.get(node.id)!
  return sum + node.width * (input.contentHeight ?? input.height)
}, 0)
const displayEmptyRatio = Math.max(0, 1 - visibleArea * fitScale ** 2 / (graph.viewport.width * graph.viewport.height))

console.log(JSON.stringify({
  input: {viewport: graph.viewport, nodes: graph.nodes.length, ports: graph.ports.length, edges: graph.edges.length, clearance},
  proof: {
    direction: result.direction,
    repeats: 3,
    reversedPermutationStable: true,
    exactEndpoints: graph.edges.length,
    orthogonalSegments: segments.length,
    unrelatedInflatedObstacleViolations: 0,
    minimumParallelClearance: {
      horizontal: Number.isFinite(parallelH) ? parallelH : null,
      vertical: Number.isFinite(parallelV) ? parallelV : null,
    },
    bounds: result.bounds,
    fitScale,
    displayEmptyRatio,
  },
  geometry: result,
}, null, 2))

function expand(rect: LayoutRectangle, amount: number): LayoutRectangle {
  return {x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2}
}

function segmentIntersectsOpenRect(from: LayoutPoint, to: LayoutPoint, rect: LayoutRectangle): boolean {
  if (from.y === to.y) {
    return from.y > rect.y && from.y < rect.y + rect.height &&
      Math.max(Math.min(from.x, to.x), rect.x) < Math.min(Math.max(from.x, to.x), rect.x + rect.width)
  }
  return from.x > rect.x && from.x < rect.x + rect.width &&
    Math.max(Math.min(from.y, to.y), rect.y) < Math.min(Math.max(from.y, to.y), rect.y + rect.height)
}
