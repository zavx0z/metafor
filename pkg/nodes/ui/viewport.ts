import type {
  NodeSystemPoint,
  NodeSystemRect,
  PositionedNodeSystem,
  PositionedNodeSystemEdge,
  PositionedNodeSystemNode,
} from "../types/model.ts"
import type {
  NodeSystemCanvasTransform,
  NodeSystemCanvasTransformLimits,
  NodeSystemRenderPlan,
} from "../types/viewport.ts"

/** Position and scale of the infinite graph canvas inside its UIDisplay. */
export const DEFAULT_NODE_SYSTEM_CANVAS_TRANSFORM: NodeSystemCanvasTransform = Object.freeze({x: 0, y: 0, scale: 1})

export function fitNodeSystemCanvasTransform(
  layout: PositionedNodeSystem,
  displayRect: NodeSystemRect,
  padding = 36,
  limits: NodeSystemCanvasTransformLimits = {},
): NodeSystemCanvasTransform {
  const usableW = Math.max(1, displayRect.w - Math.max(0, padding) * 2)
  const usableH = Math.max(1, displayRect.h - Math.max(0, padding) * 2)
  const scale = clampScale(
    Math.min(usableW / Math.max(1, layout.bounds.w), usableH / Math.max(1, layout.bounds.h)),
    limits,
  )
  return {
    x: displayRect.x + (displayRect.w - layout.bounds.w * scale) / 2 - layout.bounds.x * scale,
    y: displayRect.y + (displayRect.h - layout.bounds.h * scale) / 2 - layout.bounds.y * scale,
    scale,
  }
}

export function panNodeSystemCanvasTransform(
  transform: NodeSystemCanvasTransform,
  dx: number,
  dy: number,
): NodeSystemCanvasTransform {
  return {x: transform.x + dx, y: transform.y + dy, scale: transform.scale}
}

export function zoomNodeSystemCanvasTransformAt(
  transform: NodeSystemCanvasTransform,
  factor: number,
  anchor: NodeSystemPoint,
  limits: NodeSystemCanvasTransformLimits = {},
): NodeSystemCanvasTransform {
  if (!Number.isFinite(factor) || factor <= 0) return transform
  const nextScale = clampScale(transform.scale * factor, limits)
  const ratio = nextScale / transform.scale
  return {
    x: anchor.x - (anchor.x - transform.x) * ratio,
    y: anchor.y - (anchor.y - transform.y) * ratio,
    scale: nextScale,
  }
}

export function planNodeSystemCanvasViewport(
  layout: PositionedNodeSystem,
  canvasTransform: NodeSystemCanvasTransform,
  clip?: NodeSystemRect,
): NodeSystemRenderPlan {
  const nodes = layout.nodes
    .map((entry) => transformNode(entry, canvasTransform))
    .filter((entry) => clip === undefined || intersects(entry.rect, clip))
  const visibleNodeIds = new Set(nodes.map((entry) => entry.node.id))
  const edges = layout.edges
    .map((entry) => transformEdge(entry, canvasTransform))
    .filter((entry) => {
      if (clip === undefined) return true
      if (visibleNodeIds.has(entry.edge.source.nodeId) || visibleNodeIds.has(entry.edge.target.nodeId)) return true
      return intersects(pointsBounds(entry.points), clip)
    })
  return {canvasTransform, nodes, edges}
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
  transform: NodeSystemCanvasTransform,
): NodeSystemPoint {
  return {x: transform.x + point.x * transform.scale, y: transform.y + point.y * transform.scale}
}

function transformNode(
  entry: PositionedNodeSystemNode,
  transform: NodeSystemCanvasTransform,
): PositionedNodeSystemNode {
  return {
    node: entry.node,
    rect: transformRect(entry.rect, transform),
    ports: entry.ports.map(({port, center}) => ({
      port,
      center: transformNodeSystemPoint(center, transform),
    })),
  }
}

function transformEdge(
  entry: PositionedNodeSystemEdge,
  transform: NodeSystemCanvasTransform,
): PositionedNodeSystemEdge {
  return {
    edge: entry.edge,
    points: entry.points.map((point) => transformNodeSystemPoint(point, transform)),
  }
}

function transformRect(rect: NodeSystemRect, transform: NodeSystemCanvasTransform): NodeSystemRect {
  return {
    x: transform.x + rect.x * transform.scale,
    y: transform.y + rect.y * transform.scale,
    w: rect.w * transform.scale,
    h: rect.h * transform.scale,
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

function clampScale(value: number, limits: NodeSystemCanvasTransformLimits): number {
  const minimum = Math.max(0.01, limits.minScale ?? 0.16)
  const maximum = Math.max(minimum, limits.maxScale ?? 3)
  return Math.min(maximum, Math.max(minimum, value))
}
