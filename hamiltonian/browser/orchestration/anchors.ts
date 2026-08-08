import type {NodeSystemPoint} from "@ui/node"

export const HAMILTONIAN_NODE_ANCHORS_STORAGE_KEY = "hamiltonian-orchestration-node-anchors-v1"
const MAX_ANCHORS = 512

export type HamiltonianNodeGeometry = NodeSystemPoint & Readonly<{width?: number}>
export type HamiltonianNodeGeometries = ReadonlyMap<string, HamiltonianNodeGeometry>

type StoredAnchor = Readonly<{nodeId: string; x: number; y: number; width?: number}>
type StoredAnchors = Readonly<{
  kind: "hamiltonian.node-anchors.v1"
  anchors: readonly StoredAnchor[]
}>

/** Parses origin-local presentation state without making it a topology fact. */
export function parseHamiltonianNodeAnchors(raw: string | null): Map<string, HamiltonianNodeGeometry> {
  if (raw === null) return new Map()
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return new Map()
  }
  if (!isRecord(value) || value.kind !== "hamiltonian.node-anchors.v1" || !Array.isArray(value.anchors)) {
    return new Map()
  }
  const anchors = new Map<string, HamiltonianNodeGeometry>()
  for (const entry of value.anchors.slice(-MAX_ANCHORS)) {
    if (!isRecord(entry) || typeof entry.nodeId !== "string" || entry.nodeId.length === 0) continue
    if (typeof entry.x !== "number" || !Number.isFinite(entry.x)) continue
    if (typeof entry.y !== "number" || !Number.isFinite(entry.y)) continue
    const width = typeof entry.width === "number" && Number.isFinite(entry.width) && entry.width > 0
      ? entry.width
      : undefined
    anchors.delete(entry.nodeId)
    anchors.set(entry.nodeId, {x: entry.x, y: entry.y, ...(width === undefined ? {} : {width})})
  }
  return anchors
}

export function serializeHamiltonianNodeAnchors(anchors: HamiltonianNodeGeometries): string {
  const entries: StoredAnchor[] = [...anchors]
    .slice(-MAX_ANCHORS)
    .map(([nodeId, point]) => ({
      nodeId,
      x: point.x,
      y: point.y,
      ...(point.width === undefined ? {} : {width: point.width}),
    }))
  const stored: StoredAnchors = {kind: "hamiltonian.node-anchors.v1", anchors: entries}
  return JSON.stringify(stored)
}

/** Returns a new last-used ordered map and bounds durable presentation state. */
export function withHamiltonianNodeAnchor(
  anchors: HamiltonianNodeGeometries,
  nodeId: string,
  point: NodeSystemPoint,
  limit = MAX_ANCHORS,
): Map<string, HamiltonianNodeGeometry> {
  if (nodeId.length === 0 || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("Invalid Hamiltonian node anchor")
  }
  const maximum = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : MAX_ANCHORS
  const next = new Map(anchors)
  const previous = next.get(nodeId)
  next.delete(nodeId)
  next.set(nodeId, {
    x: point.x,
    y: point.y,
    ...(previous?.width === undefined ? {} : {width: previous.width}),
  })
  while (next.size > maximum) next.delete(next.keys().next().value!)
  return next
}

/** Persists the complete user-controlled card geometry in last-used order. */
export function withHamiltonianNodeGeometry(
  anchors: HamiltonianNodeGeometries,
  nodeId: string,
  geometry: HamiltonianNodeGeometry,
  limit = MAX_ANCHORS,
): Map<string, HamiltonianNodeGeometry> {
  if (
    nodeId.length === 0 ||
    !Number.isFinite(geometry.x) ||
    !Number.isFinite(geometry.y) ||
    geometry.width === undefined ||
    !Number.isFinite(geometry.width) ||
    geometry.width <= 0
  ) {
    throw new Error("Invalid Hamiltonian node geometry")
  }
  const maximum = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : MAX_ANCHORS
  const next = new Map(anchors)
  next.delete(nodeId)
  next.set(nodeId, {x: geometry.x, y: geometry.y, width: geometry.width})
  while (next.size > maximum) next.delete(next.keys().next().value!)
  return next
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
