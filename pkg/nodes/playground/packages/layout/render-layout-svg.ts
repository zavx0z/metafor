import type {
  LayoutGraph,
  LayoutPoint,
  LayoutResult,
} from "@nodes/layout/types"

const SVG_MARGIN = 36
const EPSILON = 0.001
const PORT_LABEL_CHAR_WIDTH = 6.2
const PORT_LABEL_GAP = 6
const PORT_LABEL_GUTTER = 24
const PORT_LABEL_HEIGHT = 22
const PORT_LABEL_HORIZONTAL_PADDING = 8
const PORT_LABEL_MIN_WIDTH = 80

export type PlaygroundGateway = Readonly<{
  edgeId: string
  nodeId: string
  point: LayoutPoint
}>

export type PlaygroundPortLabel = Readonly<{
  portId: string
  side: "WEST" | "EAST"
  text: string
  box: Readonly<{x: number; y: number; width: number; height: number}>
  leader: Readonly<{startPoint: LayoutPoint; endPoint: LayoutPoint}>
}>

export function renderLayoutSvg(
  graph: LayoutGraph,
  result: LayoutResult,
  title = `${result.direction === "RIGHT" ? "Горизонтальная (RIGHT)" : "Вертикальная (DOWN)"} раскладка`,
): string {
  const childCount = new Map<string, number>()
  for (const node of graph.nodes) {
    if (node.parentId !== undefined) {
      childCount.set(node.parentId, (childCount.get(node.parentId) ?? 0) + 1)
    }
  }
  const nodeInput = new Map(graph.nodes.map((node) => [node.id, node]))
  const nodeGeometry = orderNodeGeometryForPainting(graph, result.nodes)
  const ports = [...result.ports].sort(compareById)
  const edges = [...result.edges].sort(compareById)
  const gateways = findGatewayPoints(graph, result)
  const portLabels = layoutPortLabels(result)
  const visibleBounds = portLabels.reduce((bounds, {box}) => ({
    left: Math.min(bounds.left, box.x),
    top: Math.min(bounds.top, box.y),
    right: Math.max(bounds.right, box.x + box.width),
    bottom: Math.max(bounds.bottom, box.y + box.height),
  }), {
    left: result.bounds.x,
    top: result.bounds.y,
    right: result.bounds.x + result.bounds.width,
    bottom: result.bounds.y + result.bounds.height,
  })
  const viewBox = [
    visibleBounds.left - SVG_MARGIN,
    visibleBounds.top - SVG_MARGIN,
    visibleBounds.right - visibleBounds.left + SVG_MARGIN * 2,
    visibleBounds.bottom - visibleBounds.top + SVG_MARGIN * 2,
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

  const nodeEntries = nodeGeometry.map((node) => {
    const compound = (childCount.get(node.id) ?? 0) > 0
    const parentId = nodeInput.get(node.id)?.parentId
    return {node, compound, parentId}
  })

  const compoundBackgroundMarkup = nodeEntries
    .filter(({compound}) => compound)
    .map(({node, parentId}) => [
      `<g class="compound-background" data-node-id="${escapeXml(node.id)}"${parentId === undefined ? "" : ` data-parent-id="${escapeXml(parentId)}"`}>`,
      `<rect x="${formatNumber(node.x)}" y="${formatNumber(node.y)}" width="${formatNumber(node.width)}" height="${formatNumber(node.height)}" rx="12"/>`,
      "</g>",
    ].join(""))
    .join("")

  const compoundChromeMarkup = nodeEntries
    .filter(({compound}) => compound)
    .map(({node, parentId}) => [
      `<g class="node compound" data-node-id="${escapeXml(node.id)}"${parentId === undefined ? "" : ` data-parent-id="${escapeXml(parentId)}"`}>`,
      `<rect x="${formatNumber(node.x)}" y="${formatNumber(node.y)}" width="${formatNumber(node.width)}" height="${formatNumber(node.height)}" rx="12"/>`,
      `<text class="node-id" x="${formatNumber(node.x + 10)}" y="${formatNumber(node.y + 20)}">${escapeXml(node.id)}</text>`,
      `<text class="node-size" x="${formatNumber(node.x + 10)}" y="${formatNumber(node.y + 37)}">${formatNumber(node.width)} × ${formatNumber(node.height)}</text>`,
      "</g>",
    ].join(""))
    .join("")

  const leafNodeMarkup = nodeEntries
    .filter(({compound}) => !compound)
    .map(({node, parentId}) => {
      return [
        `<g class="node leaf" data-node-id="${escapeXml(node.id)}"${parentId === undefined ? "" : ` data-parent-id="${escapeXml(parentId)}"`}>`,
        `<rect x="${formatNumber(node.x)}" y="${formatNumber(node.y)}" width="${formatNumber(node.width)}" height="${formatNumber(node.height)}" rx="8"/>`,
        `<text class="node-id" x="${formatNumber(node.x + 10)}" y="${formatNumber(node.y + 20)}">${escapeXml(node.id)}</text>`,
        `<text class="node-size" x="${formatNumber(node.x + 10)}" y="${formatNumber(node.y + 37)}">${formatNumber(node.width)} × ${formatNumber(node.height)}</text>`,
        "</g>",
      ].join("")
    })
    .join("")

  const gatewayMarkup = gateways.map((gateway) =>
    `<rect class="gateway" data-edge-id="${escapeXml(gateway.edgeId)}" data-node-id="${escapeXml(gateway.nodeId)}" x="${formatNumber(gateway.point.x - 5)}" y="${formatNumber(gateway.point.y - 5)}" width="10" height="10"/>`).join("")

  const portMarkup = ports.map((port) => {
    return [
      `<g class="port" data-port-id="${escapeXml(port.id)}" data-side="${port.side}">`,
      `<circle cx="${formatNumber(port.x)}" cy="${formatNumber(port.y)}" r="6"/>`,
      "</g>",
    ].join("")
  }).join("")
  const portLabelLeaderMarkup = portLabels.map(({portId, side, leader}) =>
    `<line class="port-label-leader" data-label-port-id="${escapeXml(portId)}" data-side="${side}" x1="${formatNumber(leader.startPoint.x)}" y1="${formatNumber(leader.startPoint.y)}" x2="${formatNumber(leader.endPoint.x)}" y2="${formatNumber(leader.endPoint.y)}"/>`).join("")

  const portLabelMarkup = portLabels.map(({portId, side, text, box}) => [
    `<g class="port-label" data-kind="port-label" data-label-port-id="${escapeXml(portId)}" data-side="${side}" data-label-x="${formatNumber(box.x)}" data-label-y="${formatNumber(box.y)}" data-label-width="${formatNumber(box.width)}" data-label-height="${formatNumber(box.height)}">`,
    `<rect class="port-label-box" x="${formatNumber(box.x)}" y="${formatNumber(box.y)}" width="${formatNumber(box.width)}" height="${formatNumber(box.height)}" rx="5"/>`,
    `<text class="port-label-text" x="${formatNumber(box.x + PORT_LABEL_HORIZONTAL_PADDING)}" y="${formatNumber(box.y + 15)}">${escapeXml(text)}</text>`,
    "</g>",
  ].join("")).join("")

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(title)}" data-direction="${result.direction}" viewBox="${viewBox}">`,
    `<title>${escapeXml(title)}</title>`,
    "<defs>",
    "<marker id=\"arrow\" markerWidth=\"8\" markerHeight=\"8\" refX=\"7\" refY=\"4\" orient=\"auto\" markerUnits=\"strokeWidth\"><path class=\"edge-arrow\" d=\"M0,0 L8,4 L0,8 Z\"/></marker>",
    "<style>",
    ".bounds{fill:#08111d;stroke:#3f566f;stroke-dasharray:8 6;stroke-width:1}.compound-background rect{fill:#162536;fill-opacity:.72}.edge polyline{fill:none;stroke:#7dd3fc;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}.edge-arrow{fill:#7dd3fc}.edge text{fill:#bae6fd;font:12px ui-monospace,monospace;paint-order:stroke;stroke:#08111d;stroke-width:4}.bend{fill:#08111d;stroke:#fbbf24;stroke-width:2}.gateway{fill:#fb7185;stroke:#fff1f2;stroke-width:1}.node rect{stroke-width:2}.node.compound rect{fill:none;stroke:#64748b;stroke-dasharray:7 4}.node.leaf rect{fill:#172f46;stroke:#60a5fa}.node-id{fill:#f8fafc;font:600 13px ui-monospace,monospace}.node-size{fill:#94a3b8;font:11px ui-monospace,monospace}.port circle{fill:#f8fafc;stroke:#0ea5e9;stroke-width:3}.port-label-leader{stroke:#64748b;stroke-width:1.5;stroke-dasharray:4 3}.port-label-box{fill:#0b1725;stroke:#64748b;stroke-width:1}.port-label-text{fill:#e0f2fe;font:10px ui-monospace,monospace}",
    "</style>",
    "</defs>",
    `<rect class="bounds" data-kind="layout-bounds" x="${formatNumber(result.bounds.x)}" y="${formatNumber(result.bounds.y)}" width="${formatNumber(result.bounds.width)}" height="${formatNumber(result.bounds.height)}"/>`,
    `<g data-layer="compound-backgrounds" data-layer-owner="nodes">${compoundBackgroundMarkup}</g>`,
    `<g data-layer="edges">${edgeMarkup}</g>`,
    `<g data-layer="port-label-leaders" data-layer-owner="ports">${portLabelLeaderMarkup}</g>`,
    `<g data-layer="compound-chrome" data-layer-owner="nodes">${compoundChromeMarkup}</g>`,
    `<g data-layer="leaf-nodes" data-layer-owner="nodes">${leafNodeMarkup}</g>`,
    `<g data-layer="gateways">${gatewayMarkup}</g>`,
    `<g data-layer="ports">${portMarkup}</g>`,
    `<g data-layer="port-labels" data-layer-owner="ports">${portLabelMarkup}</g>`,
    "</svg>",
  ].join("")
}

/** Orders every compound before its descendants while keeping sibling order stable. */
export function orderNodeGeometryForPainting(
  graph: Pick<LayoutGraph, "nodes">,
  geometry: LayoutResult["nodes"],
): LayoutResult["nodes"] {
  const geometryById = new Map(geometry.map((node) => [node.id, node]))
  const parentIdByNode = new Map(graph.nodes.map((node) => [node.id, node.parentId]))
  const childIdsByParent = new Map<string, string[]>()
  const rootIds: string[] = []

  for (const node of geometry) {
    const parentId = parentIdByNode.get(node.id)
    if (parentId === undefined || !geometryById.has(parentId)) {
      rootIds.push(node.id)
      continue
    }
    const childIds = childIdsByParent.get(parentId) ?? []
    childIds.push(node.id)
    childIdsByParent.set(parentId, childIds)
  }

  rootIds.sort(compareStrings)
  for (const childIds of childIdsByParent.values()) childIds.sort(compareStrings)

  const ordered: LayoutResult["nodes"][number][] = []
  const visited = new Set<string>()
  const appendSubtree = (id: string): void => {
    if (visited.has(id)) return
    visited.add(id)
    const node = geometryById.get(id)
    if (node === undefined) return
    ordered.push(node)
    for (const childId of childIdsByParent.get(id) ?? []) appendSubtree(childId)
  }

  for (const id of rootIds) appendSubtree(id)
  for (const {id} of [...geometry].sort(compareById)) appendSubtree(id)
  return ordered
}

/** Places debug labels outside route bounds and attaches each with one straight leader. */
export function layoutPortLabels(result: LayoutResult): readonly PlaygroundPortLabel[] {
  return (["WEST", "EAST"] as const).flatMap((side) => {
    const ports = result.ports
      .filter((port) => port.side === side)
      .sort((left, right) => left.y - right.y || compareById(left, right))
    let nextTop = result.bounds.y
    return ports.map((port): PlaygroundPortLabel => {
      const text = `${port.id} · ${side}`
      const width = Math.max(
        PORT_LABEL_MIN_WIDTH,
        text.length * PORT_LABEL_CHAR_WIDTH + PORT_LABEL_HORIZONTAL_PADDING * 2,
      )
      const y = Math.max(port.y - PORT_LABEL_HEIGHT / 2, nextTop)
      nextTop = y + PORT_LABEL_HEIGHT + PORT_LABEL_GAP
      const x = side === "WEST"
        ? result.bounds.x - PORT_LABEL_GUTTER - width
        : result.bounds.x + result.bounds.width + PORT_LABEL_GUTTER
      const box = {x, y, width, height: PORT_LABEL_HEIGHT}
      return {
        portId: port.id,
        side,
        text,
        box,
        leader: {
          startPoint: {x: port.x, y: port.y},
          endPoint: {
            x: side === "WEST" ? box.x + box.width : box.x,
            y: box.y + box.height / 2,
          },
        },
      }
    })
  })
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
  if (!Number.isFinite(value)) throw new Error(`Координата SVG должна быть конечным числом: ${value}`)
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
  return compareStrings(left.id, right.id)
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
