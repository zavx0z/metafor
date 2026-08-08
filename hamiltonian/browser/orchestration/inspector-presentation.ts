import type {UiSurfaceRect} from "@ui/elements"

export const HAMILTONIAN_INSPECTOR_PRESENTATION_STORAGE_KEY = "hamiltonian-orchestration-inspector-v1"

export type HamiltonianInspectorPresentation = Readonly<{
  open: boolean
  frame: UiSurfaceRect | null
  stickFrame: UiSurfaceRect | null
  selectedNodeIds: readonly string[]
  selectedNodeId: string | null
}>

type StoredInspectorPresentation = Readonly<{
  kind: "hamiltonian.inspector-presentation.v1"
  open: boolean
  frame: UiSurfaceRect | null
  stickFrame: UiSurfaceRect | null
  selectedNodeIds: readonly string[]
  selectedNodeId: string | null
}>

export function parseHamiltonianInspectorPresentation(raw: string | null): HamiltonianInspectorPresentation | null {
  if (raw === null) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || value.kind !== "hamiltonian.inspector-presentation.v1") return null
  if (typeof value.open !== "boolean") return null
  const frame = parseSurfaceRect(value.frame)
  const stickFrame = parseSurfaceRect(value.stickFrame)
  if (frame === undefined || stickFrame === undefined) return null
  const selectedNodeIds = parseNodeIds(value.selectedNodeIds)
  if (selectedNodeIds === undefined) return null
  const selectedNodeId = value.selectedNodeId === undefined || value.selectedNodeId === null
    ? null
    : typeof value.selectedNodeId === "string" && value.selectedNodeId.length > 0
      ? value.selectedNodeId
      : undefined
  if (selectedNodeId === undefined || (selectedNodeId !== null && !selectedNodeIds.includes(selectedNodeId))) return null
  return {open: value.open, frame, stickFrame, selectedNodeIds, selectedNodeId}
}

export function serializeHamiltonianInspectorPresentation(
  presentation: HamiltonianInspectorPresentation,
): string {
  if (typeof presentation.open !== "boolean") throw new Error("Invalid Hamiltonian inspector state")
  assertSurfaceRect(presentation.frame)
  assertSurfaceRect(presentation.stickFrame)
  assertSelection(presentation.selectedNodeIds, presentation.selectedNodeId)
  const stored: StoredInspectorPresentation = {
    kind: "hamiltonian.inspector-presentation.v1",
    open: presentation.open,
    frame: presentation.frame,
    stickFrame: presentation.stickFrame,
    selectedNodeIds: presentation.selectedNodeIds,
    selectedNodeId: presentation.selectedNodeId,
  }
  return JSON.stringify(stored)
}

function parseNodeIds(value: unknown): readonly string[] | undefined {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 512) return undefined
  if (value.some((entry) => typeof entry !== "string" || entry.length === 0 || entry.length > 1024)) return undefined
  const nodeIds = value as string[]
  if (new Set(nodeIds).size !== nodeIds.length) return undefined
  return nodeIds
}

function assertSelection(nodeIds: readonly string[], primaryNodeId: string | null): void {
  if (parseNodeIds(nodeIds) === undefined) throw new Error("Invalid Hamiltonian inspector selection")
  if (primaryNodeId !== null && !nodeIds.includes(primaryNodeId)) {
    throw new Error("Hamiltonian inspector primary selection is not selected")
  }
}

function parseSurfaceRect(value: unknown): UiSurfaceRect | null | undefined {
  if (value === null) return null
  if (!isRecord(value)) return undefined
  if (![value.x, value.y, value.w, value.h].every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    return undefined
  }
  if ((value.w as number) <= 0 || (value.h as number) <= 0) return undefined
  return {
    x: value.x as number,
    y: value.y as number,
    w: value.w as number,
    h: value.h as number,
  }
}

function assertSurfaceRect(rect: UiSurfaceRect | null): void {
  if (rect === null) return
  if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w <= 0 || rect.h <= 0) {
    throw new Error("Invalid Hamiltonian inspector frame")
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
