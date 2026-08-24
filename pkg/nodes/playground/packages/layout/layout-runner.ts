import type {LayoutPoint, LayoutResult} from "@nodes/layout/types"
import {getPlaygroundPolicy} from "./layout-policies.ts"
import {findGatewayPoints, renderLayoutSvg} from "./render-layout-svg.ts"
import type {
  PlaygroundFixture,
  PlaygroundMetrics,
  PlaygroundPolicyId,
  PlaygroundRun,
} from "./layout-playground-types.ts"

export function runPlaygroundLayout(
  policyId: PlaygroundPolicyId,
  input: PlaygroundFixture["graph"],
): PlaygroundRun {
  const policy = getPlaygroundPolicy(policyId)
  const startedAt = performance.now()
  const {result, diagnostics: policyDiagnostics} = policy.run(input)
  const durationMs = performance.now() - startedAt
  const metrics = measureResult(input, result, durationMs)
  return {
    policyId,
    input,
    result,
    policyDiagnostics,
    metrics,
    svg: renderLayoutSvg(input, result, `${policy.label} · ${formatDirection(result.direction)}`),
  }
}

function formatDirection(direction: LayoutResult["direction"]): string {
  return direction === "RIGHT" ? "Горизонтальная (RIGHT)" : "Вертикальная (DOWN)"
}

export function measureResult(
  input: PlaygroundFixture["graph"],
  result: LayoutResult,
  durationMs: number,
): PlaygroundMetrics {
  const compoundIds = new Set(input.nodes.flatMap((node) =>
    node.parentId === undefined ? [] : [node.parentId]))
  const bendCount = result.edges.reduce((total, edge) =>
    total + (edge.sections[0]?.bendPoints.length ?? 0), 0)
  const totalManhattan = result.edges.reduce((total, edge) => {
    const section = edge.sections[0]
    if (section === undefined) return total
    const points = [section.startPoint, ...section.bendPoints, section.endPoint]
    return total + points.slice(1).reduce((edgeTotal, point, index) =>
      edgeTotal + manhattan(points[index]!, point), 0)
  }, 0)
  return {
    direction: result.direction,
    durationMs,
    nodeCount: result.nodes.length,
    compoundCount: result.nodes.filter((node) => compoundIds.has(node.id)).length,
    portCount: result.ports.length,
    edgeCount: result.edges.length,
    bendCount,
    gatewayCount: findGatewayPoints(input, result).length,
    totalManhattan,
    bounds: result.bounds,
  }
}

function manhattan(left: LayoutPoint, right: LayoutPoint): number {
  return Math.abs(right.x - left.x) + Math.abs(right.y - left.y)
}
