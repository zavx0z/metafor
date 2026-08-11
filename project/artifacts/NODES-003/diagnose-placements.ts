import {createHash} from "node:crypto"
import {readFileSync, writeFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

import {placementCandidates} from "../../../pkg/nodes/layout/src/place-graph.ts"
import {diagnoseRouteGraph, routeGraph} from "../../../pkg/nodes/layout/src/route-graph.ts"
import type {LayoutGraph} from "../../../pkg/nodes/layout/types/protocol.ts"
import type {PlacementInput} from "../../../pkg/nodes/layout/types/placement.ts"

const directory = dirname(fileURLToPath(import.meta.url))
const fixtureName = "two-tab-layout-portrait.json"
const fixtureSource = readFileSync(join(directory, fixtureName), "utf8")
const graph = JSON.parse(fixtureSource) as LayoutGraph
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex")

const input = toPlacementInput(graph)
const candidates = placementCandidates(input)
const representativeWitnesses = new Map<string, unknown>()
const results = candidates.map((placement, index) => {
  try {
    const routing = routeGraph(placement.routeInput)
    return {
      index,
      status: "ROUTABLE" as const,
      bounds: placement.bounds,
      placementMetrics: placement.metrics,
      routingMetrics: routing.metrics,
    }
  } catch (error) {
    const diagnostic = diagnoseRouteGraph(placement.routeInput)
    const firstFailureEdgeId = diagnostic.status === "NO_LEGAL_ROUTE"
      ? diagnostic.witness.edge.id
      : diagnostic.status
    if (!representativeWitnesses.has(firstFailureEdgeId)) {
      representativeWitnesses.set(firstFailureEdgeId, diagnostic)
    }
    return {
      index,
      status: "NO_LEGAL_ROUTE" as const,
      bounds: placement.bounds,
      placementMetrics: placement.metrics,
      error: error instanceof Error ? error.message : String(error),
      firstFailureEdgeId,
    }
  }
})

const firstFailureCounts = new Map<string, number>()
for (const result of results) {
  const edgeId = result.status === "ROUTABLE" ? result.status : result.firstFailureEdgeId
  firstFailureCounts.set(edgeId, (firstFailureCounts.get(edgeId) ?? 0) + 1)
}

const report = {
  fixture: fixtureName,
  fixtureSha256: sha256(fixtureSource),
  candidates: candidates.length,
  routable: results.filter(({status}) => status === "ROUTABLE").length,
  firstFailureCounts: Object.fromEntries([...firstFailureCounts].sort(([left], [right]) => left < right ? -1 : 1)),
  representativeWitnesses: Object.fromEntries([...representativeWitnesses].sort(([left], [right]) => left < right ? -1 : 1)),
  results,
}
const output = `${JSON.stringify(report, null, 2)}\n`
const outputName = process.env.NODES003_DIAGNOSTIC_OUTPUT ?? "placements-diagnostic.json"
writeFileSync(join(directory, outputName), output)
process.stdout.write(`${JSON.stringify({
  fixture: report.fixture,
  fixtureSha256: report.fixtureSha256,
  candidates: report.candidates,
  routable: report.routable,
  firstFailureCounts: report.firstFailureCounts,
  output: outputName,
  diagnosticSha256: sha256(output),
}, null, 2)}\n`)

function toPlacementInput(value: LayoutGraph): PlacementInput {
  const unitsPerPixel = 1_000
  const spacing = positive(value.layoutOptions?.spacing ?? 28, "spacing")
  const clearance = positive(value.layoutOptions?.clearance ?? spacing, "clearance")
  const padding = positive(value.layoutOptions?.padding ?? spacing, "padding")
  const layerSpacing = Math.max(positive(value.layoutOptions?.layerSpacing ?? spacing, "layerSpacing"), clearance)
  const portById = new Map(value.ports.map((port) => [port.id, port]))
  if (portById.size !== value.ports.length) throw new Error("Layout port ids must be globally unique")
  const roles = new Map<string, "in" | "out">()
  for (const edge of value.edges) {
    setPortRole(roles, edge.sourcePortId, "out", edge.id)
    setPortRole(roles, edge.targetPortId, "in", edge.id)
    if (!portById.has(edge.sourcePortId)) throw new Error(`Unknown source port: ${edge.id}/${edge.sourcePortId}`)
    if (!portById.has(edge.targetPortId)) throw new Error(`Unknown target port: ${edge.id}/${edge.targetPortId}`)
  }
  const scaled = (coordinate: number): number => {
    const result = Math.round(coordinate * unitsPerPixel)
    if (!Number.isSafeInteger(result)) throw new Error(`Layout coordinate exceeds safe range: ${coordinate}`)
    return result
  }
  return {
    unitsPerPixel,
    viewport: {
      width: positive(value.viewport.width, "viewport.width"),
      height: positive(value.viewport.height, "viewport.height"),
    },
    clearance: scaled(clearance),
    padding: scaled(padding),
    nodeSpacing: scaled(spacing),
    layerSpacing: scaled(layerSpacing),
    outerPadding: scaled(padding),
    nodes: value.nodes.map((node) => {
      const height = scaled(positive(node.height, `node.height:${node.id}`))
      const contentHeight = scaled(positive(node.contentHeight ?? node.height, `node.contentHeight:${node.id}`))
      if (contentHeight > height) throw new Error(`node.contentHeight must not exceed height: ${node.id}`)
      return {
        id: node.id,
        ...(node.parentId === undefined ? {} : {parentId: node.parentId}),
        size: {w: scaled(positive(node.width, `node.width:${node.id}`)), h: height},
        contentHeight,
      }
    }),
    ports: value.ports.flatMap((port) => {
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
    edges: value.edges.map((edge) => ({
      id: edge.id,
      sourcePortId: edge.sourcePortId,
      targetPortId: edge.targetPortId,
    })),
  }
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive`)
  return value
}

function setPortRole(
  roles: Map<string, "in" | "out">,
  portId: string,
  role: "in" | "out",
  edgeId: string,
): void {
  const previous = roles.get(portId)
  if (previous !== undefined && previous !== role) {
    throw new Error(`Port has conflicting edge roles: ${edgeId}/${portId}`)
  }
  roles.set(portId, role)
}
