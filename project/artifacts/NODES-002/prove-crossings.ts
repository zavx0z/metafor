import {layout} from "../../../pkg/nodes/layout/src/index.ts"
import type {LayoutGraph, LayoutPoint} from "../../../pkg/nodes/layout/types/protocol.ts"

const inputFile = Bun.argv[2]
if (inputFile === undefined) throw new Error("usage: bun prove-crossings.ts <layout-request.json>")
const graph = await Bun.file(inputFile).json() as LayoutGraph
const results = [layout(graph), layout(graph), layout(graph)]
const permuted = layout({
  ...graph,
  nodes: [...graph.nodes].reverse(),
  ports: [...graph.ports].reverse(),
  edges: [...graph.edges].reverse(),
})
const canonical = JSON.stringify(results[0])
if (!results.every((result) => JSON.stringify(result) === canonical) || JSON.stringify(permuted) !== canonical) {
  throw new Error("layout is not repeat/permutation deterministic")
}

const result = results[0]!
const segments = result.edges.flatMap((edge) => {
  const section = edge.sections[0]
  const points = [section.startPoint, ...section.bendPoints, section.endPoint]
  return points.slice(1).map((to, index) => ({edgeId: edge.id, from: points[index]!, to}))
})
const crossings: Array<Readonly<{
  leftEdgeId: string
  rightEdgeId: string
  point: LayoutPoint
}>> = []
for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
  const left = segments[leftIndex]!
  for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex += 1) {
    const right = segments[rightIndex]!
    if (left.edgeId === right.edgeId) continue
    const point = perpendicularCrossing(left.from, left.to, right.from, right.to)
    if (point !== null) crossings.push({leftEdgeId: left.edgeId, rightEdgeId: right.edgeId, point})
  }
}
const perEdge = new Map<string, number>()
for (const crossing of crossings) {
  perEdge.set(crossing.leftEdgeId, (perEdge.get(crossing.leftEdgeId) ?? 0) + 1)
  perEdge.set(crossing.rightEdgeId, (perEdge.get(crossing.rightEdgeId) ?? 0) + 1)
}

console.log(JSON.stringify({
  input: inputFile,
  direction: result.direction,
  repeats: 3,
  reversedPermutationStable: true,
  totalCrossings: crossings.length,
  maxCrossings: Math.max(0, ...perEdge.values()),
  perEdge: [...perEdge].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([edgeId, count]) => ({edgeId, crossings: count})),
  crossings,
  geometry: result,
}, null, 2))

function perpendicularCrossing(
  a: LayoutPoint,
  b: LayoutPoint,
  c: LayoutPoint,
  d: LayoutPoint,
): LayoutPoint | null {
  const firstHorizontal = a.y === b.y
  const secondHorizontal = c.y === d.y
  if (firstHorizontal === secondHorizontal) return null
  const horizontal = firstHorizontal ? {from: a, to: b} : {from: c, to: d}
  const vertical = firstHorizontal ? {from: c, to: d} : {from: a, to: b}
  const x = vertical.from.x
  const y = horizontal.from.y
  const insideHorizontal = x > Math.min(horizontal.from.x, horizontal.to.x) && x < Math.max(horizontal.from.x, horizontal.to.x)
  const insideVertical = y > Math.min(vertical.from.y, vertical.to.y) && y < Math.max(vertical.from.y, vertical.to.y)
  return insideHorizontal && insideVertical ? {x, y} : null
}
