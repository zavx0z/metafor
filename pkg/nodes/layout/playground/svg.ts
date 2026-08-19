import type {
  LayoutGraph,
  LayoutPoint,
  LayoutResult,
} from "@nodes/layout"

const SVG_MARGIN = 36
const EPSILON = 0.001

export type PlaygroundGateway = Readonly<{
  edgeId: string
  nodeId: string
  point: LayoutPoint
}>

export function renderLayoutSvg(
  graph: LayoutGraph,
  result: LayoutResult,
  title = `${result.direction} layout`,
): string {
  const childCount = new Map<string, number>()
  for (const node of graph.nodes) {
    if (node.parentId !== undefined) {
      childCount.set(node.parentId, (childCount.get(node.parentId) ?? 0) + 1)
    }
  }
  const nodeInput = new Map(graph.nodes.map((node) => [node.id, node]))
  const nodeGeometry = [...result.nodes].sort(compareById)
  const ports = [...result.ports].sort(compareById)
  const edges = [...result.edges].sort(compareById)
  const gateways = findGatewayPoints(graph, result)
  const viewBox = [
    result.bounds.x - SVG_MARGIN,
    result.bounds.y - SVG_MARGIN,
    result.bounds.width + SVG_MARGIN * 2,
    result.bounds.height + SVG_MARGIN * 2,
  ].map(formatNumber).join(" ")

  const edgeMarkup = edges.map((edge) => {
    const section = edge.sections[0]
    if (section === undefined) return ""
    const points = [section.startPoint, ...section.bendPoints, section.endPoint]
    return [
      `<g class="edge" data-edge-id="${escapeXml(edge.id)}">`,
      `<polyline points="${points.map(pointAttribute).join(" ")}" marker-end="url(#arrow)"/>`,
      ...section.bendPoints.map((point, index) =>
        `<circle class="bend" data-edge-id="${escapeXml(edge.id)}" data-bend-index="${index}" cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="4"/>`),
      edgeLabel(edge.id, points),
      "</g>",
    ].join("")
  }).join("")

  const nodeMarkup = nodeGeometry.map((node) => {
    const compound = (childCount.get(node.id) ?? 0) > 0
    const parentId = nodeInput.get(node.id)?.parentId
    return [
      `<g class="node ${compound ? "compound" : "leaf"}" data-node-id="${escapeXml(node.id)}"${parentId === undefined ? "" : ` data-parent-id="${escapeXml(parentId)}"`}>`,
      `<rect x="${formatNumber(node.x)}" y="${formatNumber(node.y)}" width="${formatNumber(node.width)}" height="${formatNumber(node.height)}" rx="${compound ? 12 : 8}"/>`,
      `<text class="node-id" x="${formatNumber(node.x + 10)}" y="${formatNumber(node.y + 20)}">${escapeXml(node.id)}</text>`,
      `<text class="node-size" x="${formatNumber(node.x + 10)}" y="${formatNumber(node.y + 37)}">${formatNumber(node.width)} × ${formatNumber(node.height)}</text>`,
      "</g>",
    ].join("")
  }).join("")

  const gatewayMarkup = gateways.map((gateway) =>
    `<rect class="gateway" data-edge-id="${escapeXml(gateway.edgeId)}" data-node-id="${escapeXml(gateway.nodeId)}" x="${formatNumber(gateway.point.x - 5)}" y="${formatNumber(gateway.point.y - 5)}" width="10" height="10"/>`).join("")

  const portMarkup = ports.map((port) => {
    const side = port.side
    const labelOffset = side === "WEST" ? -10 : 10
    const anchor = side === "WEST" ? "end" : "start"
    return [
      `<g class="port" data-port-id="${escapeXml(port.id)}" data-side="${side}">`,
      `<circle cx="${formatNumber(port.x)}" cy="${formatNumber(port.y)}" r="6"/>`,
      `<text x="${formatNumber(port.x + labelOffset)}" y="${formatNumber(port.y - 9)}" text-anchor="${anchor}">${escapeXml(port.id)} · ${side}</text>`,
      "</g>",
    ].join("")
  }).join("")

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(title)}" data-direction="${result.direction}" viewBox="${viewBox}">`,
    `<title>${escapeXml(title)}</title>`,
    "<defs>",
    "<marker id=\"arrow\" markerWidth=\"8\" markerHeight=\"8\" refX=\"7\" refY=\"4\" orient=\"auto\" markerUnits=\"strokeWidth\"><path d=\"M0,0 L8,4 L0,8 Z\"/></marker>",
    "<style>",
    ".bounds{fill:#08111d;stroke:#3f566f;stroke-dasharray:8 6;stroke-width:1}.edge polyline{fill:none;stroke:#7dd3fc;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}.edge text{fill:#bae6fd;font:12px ui-monospace,monospace;paint-order:stroke;stroke:#08111d;stroke-width:4}.bend{fill:#08111d;stroke:#fbbf24;stroke-width:2}.gateway{fill:#fb7185;stroke:#fff1f2;stroke-width:1}.node rect{stroke-width:2}.node.compound rect{fill:#162536;fill-opacity:.72;stroke:#64748b;stroke-dasharray:7 4}.node.leaf rect{fill:#172f46;stroke:#60a5fa}.node-id{fill:#f8fafc;font:600 13px ui-monospace,monospace}.node-size{fill:#94a3b8;font:11px ui-monospace,monospace}.port circle{fill:#f8fafc;stroke:#0ea5e9;stroke-width:3}.port text{fill:#e0f2fe;font:10px ui-monospace,monospace;paint-order:stroke;stroke:#08111d;stroke-width:3}",
    "</style>",
    "</defs>",
    `<rect class="bounds" data-kind="layout-bounds" x="${formatNumber(result.bounds.x)}" y="${formatNumber(result.bounds.y)}" width="${formatNumber(result.bounds.width)}" height="${formatNumber(result.bounds.height)}"/>`,
    `<g data-layer="edges">${edgeMarkup}</g>`,
    `<g data-layer="nodes">${nodeMarkup}</g>`,
    `<g data-layer="gateways">${gatewayMarkup}</g>`,
    `<g data-layer="ports">${portMarkup}</g>`,
    "</svg>",
  ].join("")
}

export function findGatewayPoints(graph: LayoutGraph, result: LayoutResult): readonly PlaygroundGateway[] {
  const compoundIds = new Set(graph.nodes.flatMap((node) =>
    node.parentId === undefined ? [] : [node.parentId]))
  const compounds = result.nodes.filter((node) => compoundIds.has(node.id))
  const gateways: PlaygroundGateway[] = []
  const seen = new Set<string>()
  for (const edge of [...result.edges].sort(compareById)) {
    const section = edge.sections[0]
    if (section === undefined) continue
    const points = [section.startPoint, ...section.bendPoints, section.endPoint]
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1]!
      const to = points[index]!
      for (const node of compounds) {
        for (const point of segmentBoundaryIntersections(from, to, node)) {
          const key = `${edge.id}\0${node.id}\0${formatNumber(point.x)}\0${formatNumber(point.y)}`
          if (seen.has(key)) continue
          seen.add(key)
          gateways.push({edgeId: edge.id, nodeId: node.id, point})
        }
      }
    }
  }
  return gateways
}

function segmentBoundaryIntersections(
  from: LayoutPoint,
  to: LayoutPoint,
  rectangle: Readonly<{x: number; y: number; width: number; height: number}>,
): readonly LayoutPoint[] {
  const right = rectangle.x + rectangle.width
  const bottom = rectangle.y + rectangle.height
  if (Math.abs(from.y - to.y) <= EPSILON) {
    if (from.y <= rectangle.y + EPSILON || from.y >= bottom - EPSILON) return []
    const leftX = Math.min(from.x, to.x)
    const rightX = Math.max(from.x, to.x)
    return [rectangle.x, right]
      .filter((x) => x >= leftX - EPSILON && x <= rightX + EPSILON)
      .map((x) => ({x, y: from.y}))
  }
  if (Math.abs(from.x - to.x) <= EPSILON) {
    if (from.x <= rectangle.x + EPSILON || from.x >= right - EPSILON) return []
    const topY = Math.min(from.y, to.y)
    const bottomY = Math.max(from.y, to.y)
    return [rectangle.y, bottom]
      .filter((y) => y >= topY - EPSILON && y <= bottomY + EPSILON)
      .map((y) => ({x: from.x, y}))
  }
  return []
}

function edgeLabel(id: string, points: readonly LayoutPoint[]): string {
  const middle = points[Math.floor(points.length / 2)]
  if (middle === undefined) return ""
  return `<text x="${formatNumber(middle.x + 7)}" y="${formatNumber(middle.y - 7)}">${escapeXml(id)}</text>`
}

function pointAttribute(point: LayoutPoint): string {
  return `${formatNumber(point.x)},${formatNumber(point.y)}`
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`SVG coordinate must be finite: ${value}`)
  const rounded = Math.round(value * 1_000) / 1_000
  return Object.is(rounded, -0) ? "0" : String(rounded)
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;")
}

function compareById(left: Readonly<{id: string}>, right: Readonly<{id: string}>): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}
