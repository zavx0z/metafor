import {placementCandidates} from "../../../pkg/nodes/layout/src/place-graph.ts"
import {diagnoseRouteGraph, routeGraph} from "../../../pkg/nodes/layout/src/route-graph.ts"
import type {PlacementInput} from "../../../pkg/nodes/layout/types/placement.ts"
import type {LayoutGraph} from "../../../pkg/nodes/layout/types/protocol.ts"

const inputFile = Bun.argv[2] ?? new URL("live-layout-request-landscape.json", import.meta.url)
const graph = await Bun.file(inputFile).json() as LayoutGraph
const scale = 1_000
const roles = new Map<string, "in" | "out">()
for (const edge of graph.edges) {
  roles.set(edge.sourcePortId, "out")
  roles.set(edge.targetPortId, "in")
}
const fixed = (value: number): number => Math.round(value * scale)
const input: PlacementInput = {
  unitsPerPixel: scale,
  viewport: graph.viewport,
  clearance: fixed(graph.layoutOptions?.clearance ?? graph.layoutOptions?.spacing ?? 28),
  padding: fixed(graph.layoutOptions?.padding ?? graph.layoutOptions?.spacing ?? 28),
  nodeSpacing: fixed(graph.layoutOptions?.spacing ?? 28),
  layerSpacing: fixed(graph.layoutOptions?.layerSpacing ?? graph.layoutOptions?.spacing ?? 28),
  outerPadding: fixed(graph.layoutOptions?.padding ?? graph.layoutOptions?.spacing ?? 28),
  nodes: graph.nodes.map((node) => ({
    id: node.id,
    ...(node.parentId === undefined ? {} : {parentId: node.parentId}),
    size: {w: fixed(node.width), h: fixed(node.height)},
    contentHeight: fixed(node.contentHeight ?? node.height),
  })),
  ports: graph.ports.flatMap((port) => {
    const direction = roles.get(port.id)
    return direction === undefined ? [] : [{
      id: port.id,
      nodeId: port.nodeId,
      offsetY: fixed(port.y),
      side: direction === "out" ? "EAST" as const : "WEST" as const,
      direction,
    }]
  }),
  edges: graph.edges,
}

const failures = new Map<string, number>()
const examples = new Map<string, unknown>()
const candidateResults: unknown[] = []
const compactFailures: unknown[] = []
const candidates = placementCandidates(input)
let routable = 0
for (let index = 0; index < candidates.length; index += 1) {
  const candidate = candidates[index]!
  const fanoutNodes = candidate.nodes.filter(({id}) =>
    id.startsWith("server:") || id.startsWith("bun-process:"))
  const fanoutRows = new Set(fanoutNodes.map(({rect}) => rect.y)).size
  const diagnostic = diagnoseRouteGraph(candidate.routeInput)
  if (diagnostic.status === "ROUTABLE") {
    routable += 1
    candidateResults.push({index, status: diagnostic.status, fanoutRows, metrics: candidate.metrics})
    continue
  }
  const key = diagnostic.status === "NO_LEGAL_ROUTE"
    ? diagnostic.witness.edge.id
    : diagnostic.error
  failures.set(key, (failures.get(key) ?? 0) + 1)
  candidateResults.push({index, status: diagnostic.status, edge: key, fanoutRows, metrics: candidate.metrics})
  if (fanoutRows === 1) compactFailures.push({
    index,
    placement: {bounds: candidate.bounds, nodes: fanoutNodes, ports: candidate.ports, metrics: candidate.metrics},
    diagnostic,
    isolatedFanoutRoutes: candidate.routeInput.edges.flatMap((edge) => {
      const source = candidate.ports.find(({id}) => id === edge.sourcePortId)
      if (source?.nodeId !== diagnostic.witness.endpoints.source.nodeId) return []
      const isolatedInput = {...candidate.routeInput, edges: [edge]}
      const isolatedDiagnostic = diagnoseRouteGraph(isolatedInput)
      return [{edge: edge.id, diagnostic: isolatedDiagnostic, result: isolatedDiagnostic.status === "ROUTABLE" ? routeGraph(isolatedInput) : null}]
    }),
  })
  if (!examples.has(key)) examples.set(key, {
    index,
    placement: {bounds: candidate.bounds, nodes: candidate.nodes, ports: candidate.ports, metrics: candidate.metrics},
    diagnostic,
  })
}

console.log(JSON.stringify({
  viewport: graph.viewport,
  candidates: candidates.length,
  routable,
  failures: [...failures].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
  candidateResults,
  compactFailures,
  examples: Object.fromEntries([...examples].sort(([left], [right]) => left.localeCompare(right))),
}, null, 2))
