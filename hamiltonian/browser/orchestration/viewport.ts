import type {NodeSystemViewport} from "@ui/node"

export const HAMILTONIAN_VIEWPORT_STORAGE_KEY = "hamiltonian-orchestration-viewport-v1"

type StoredViewport = Readonly<{
  kind: "hamiltonian.viewport.v1"
  x: number
  y: number
  scale: number
}>

export function parseHamiltonianViewport(raw: string | null): NodeSystemViewport | null {
  if (raw === null) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || value.kind !== "hamiltonian.viewport.v1") return null
  if (typeof value.x !== "number" || !Number.isFinite(value.x)) return null
  if (typeof value.y !== "number" || !Number.isFinite(value.y)) return null
  if (typeof value.scale !== "number" || !Number.isFinite(value.scale) || value.scale <= 0) return null
  return {x: value.x, y: value.y, scale: value.scale}
}

export function serializeHamiltonianViewport(viewport: NodeSystemViewport): string {
  if (![viewport.x, viewport.y, viewport.scale].every(Number.isFinite) || viewport.scale <= 0) {
    throw new Error("Invalid Hamiltonian viewport")
  }
  const stored: StoredViewport = {
    kind: "hamiltonian.viewport.v1",
    x: viewport.x,
    y: viewport.y,
    scale: viewport.scale,
  }
  return JSON.stringify(stored)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
