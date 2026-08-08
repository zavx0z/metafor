import type {
  NodeSystemPoint,
  NodeSystemRect,
  PositionedNodeSystem,
  PositionedNodeSystemEdge,
  PositionedNodeSystemNode,
} from "./model.ts"

export type NodeSystemViewport = Readonly<{
  x: number
  y: number
  scale: number
}>

export type NodeSystemViewportLimits = Readonly<{
  minScale?: number
  maxScale?: number
}>

export type NodeSystemRenderPlan = Readonly<{
  viewport: NodeSystemViewport
  nodes: readonly PositionedNodeSystemNode[]
  edges: readonly PositionedNodeSystemEdge[]
}>

export const DEFAULT_NODE_SYSTEM_VIEWPORT: NodeSystemViewport = Object.freeze({x: 0, y: 0, scale: 1})

export function fitNodeSystemViewport(
  layout: PositionedNodeSystem,
  viewport: NodeSystemRect,
  padding = 36,
  limits: NodeSystemViewportLimits = {},
): NodeSystemViewport {
  const usableW = Math.max(1, viewport.w - Math.max(0, padding) * 2)
  const usableH = Math.max(1, viewport.h - Math.max(0, padding) * 2)
  const scale = clampScale(
    Math.min(usableW / Math.max(1, layout.bounds.w), usableH / Math.max(1, layout.bounds.h)),
    limits,
  )
  return {
    x: viewport.x + (viewport.w - layout.bounds.w * scale) / 2 - layout.bounds.x * scale,
    y: viewport.y + (viewport.h - layout.bounds.h * scale) / 2 - layout.bounds.y * scale,
    scale,
  }
}

export function panNodeSystemViewport(
  viewport: NodeSystemViewport,
  dx: number,
  dy: number,
): NodeSystemViewport {
  return {x: viewport.x + dx, y: viewport.y + dy, scale: viewport.scale}
}

export function zoomNodeSystemViewportAt(
  viewport: NodeSystemViewport,
  factor: number,
  anchor: NodeSystemPoint,
  limits: NodeSystemViewportLimits = {},
): NodeSystemViewport {
  if (!Number.isFinite(factor) || factor <= 0) return viewport
  const nextScale = clampScale(viewport.scale * factor, limits)
  const ratio = nextScale / viewport.scale
  return {
    x: anchor.x - (anchor.x - viewport.x) * ratio,
    y: anchor.y - (anchor.y - viewport.y) * ratio,
    scale: nextScale,
  }
}

export function planNodeSystemViewport(
  layout: PositionedNodeSystem,
  viewport: NodeSystemViewport,
  clip?: NodeSystemRect,
): NodeSystemRenderPlan {
  const nodes = layout.nodes
    .map((entry) => transformNode(entry, viewport))
    .filter((entry) => clip === undefined || intersects(entry.rect, clip))
  const visibleNodeIds = new Set(nodes.map((entry) => entry.node.id))
  const edges = layout.edges
    .map((entry) => transformEdge(entry, viewport))
    .filter((entry) => {
      if (clip === undefined) return true
      if (visibleNodeIds.has(entry.edge.source.nodeId) || visibleNodeIds.has(entry.edge.target.nodeId)) return true
      return intersects(pointsBounds(entry.points), clip)
    })
  return {viewport, nodes, edges}
}

export function hitTestNodeSystem(
  plan: NodeSystemRenderPlan,
  point: NodeSystemPoint,
): PositionedNodeSystemNode | null {
  for (let index = plan.nodes.length - 1; index >= 0; index -= 1) {
    const node = plan.nodes[index]!
    if (contains(node.rect, point)) return node
  }
  return null
}

export function transformNodeSystemPoint(
  point: NodeSystemPoint,
  viewport: NodeSystemViewport,
): NodeSystemPoint {
  return {x: viewport.x + point.x * viewport.scale, y: viewport.y + point.y * viewport.scale}
}

function transformNode(
  entry: PositionedNodeSystemNode,
  viewport: NodeSystemViewport,
): PositionedNodeSystemNode {
  return {
    node: entry.node,
    rect: transformRect(entry.rect, viewport),
    ports: entry.ports.map(({port, center}) => ({
      port,
      center: transformNodeSystemPoint(center, viewport),
    })),
  }
}

function transformEdge(
  entry: PositionedNodeSystemEdge,
  viewport: NodeSystemViewport,
): PositionedNodeSystemEdge {
  return {
    edge: entry.edge,
    points: entry.points.map((point) => transformNodeSystemPoint(point, viewport)),
  }
}

function transformRect(rect: NodeSystemRect, viewport: NodeSystemViewport): NodeSystemRect {
  return {
    x: viewport.x + rect.x * viewport.scale,
    y: viewport.y + rect.y * viewport.scale,
    w: rect.w * viewport.scale,
    h: rect.h * viewport.scale,
  }
}

function pointsBounds(points: readonly NodeSystemPoint[]): NodeSystemRect {
  if (points.length === 0) return {x: 0, y: 0, w: 0, h: 0}
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y)}
}

function contains(rect: NodeSystemRect, point: NodeSystemPoint): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h
}

function intersects(left: NodeSystemRect, right: NodeSystemRect): boolean {
  return left.x + left.w >= right.x && right.x + right.w >= left.x && left.y + left.h >= right.y && right.y + right.h >= left.y
}

function clampScale(value: number, limits: NodeSystemViewportLimits): number {
  const minimum = Math.max(0.01, limits.minScale ?? 0.16)
  const maximum = Math.max(minimum, limits.maxScale ?? 3)
  return Math.min(maximum, Math.max(minimum, value))
}
