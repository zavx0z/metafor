import type {UiRuntimeViewPointSnapshot, UiRuntimeViewPointVector} from "@ui/elements"
import {numberParam, objectParamMaybe, stringParam} from "./command-params.ts"

const INTERPRETER_VIEWPOINT_STORAGE_KEY = "metafor.interpreter.viewPoint:v1"
const INTERPRETER_DISPLAY_POSITIONS_STORAGE_KEY = "metafor.interpreter.displayPositions:v1"

export function writeStoredInterpreterViewPoint(snapshot: UiRuntimeViewPointSnapshot): void {
  try {
    localStorage.setItem(INTERPRETER_VIEWPOINT_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Storage can be unavailable in private contexts.
  }
}

export function readStoredInterpreterViewPoint(): UiRuntimeViewPointSnapshot | null {
  try {
    const raw = localStorage.getItem(INTERPRETER_VIEWPOINT_STORAGE_KEY)
    if (raw === null) return null
    return normalizeStoredInterpreterViewPoint(JSON.parse(raw))
  } catch {
    return null
  }
}

function normalizeStoredInterpreterViewPoint(value: unknown): UiRuntimeViewPointSnapshot | null {
  const object = objectParamMaybe(value)
  if (object === undefined) return null
  const displayMode = object["displayMode"]
  if (displayMode !== "near" && displayMode !== "far") return null
  const position = viewPointVectorParam(object["position"])
  const target = viewPointVectorParam(object["target"])
  const up = viewPointVectorParam(object["up"])
  if (position === null || target === null || up === null) return null
  const rawActiveDisplayId = object["activeDisplayId"]
  let activeDisplayId: string | null = null
  if (rawActiveDisplayId !== null && rawActiveDisplayId !== undefined) {
    const parsedActiveDisplayId = stringParam(rawActiveDisplayId)
    if (parsedActiveDisplayId === undefined) return null
    activeDisplayId = parsedActiveDisplayId
  }
  return {displayMode, activeDisplayId, position, target, up}
}

function viewPointVectorParam(value: unknown): UiRuntimeViewPointVector | null {
  const object = objectParamMaybe(value)
  if (object === undefined) return null
  const x = numberParam(object["x"])
  const y = numberParam(object["y"])
  const z = numberParam(object["z"])
  if (x === undefined || y === undefined || z === undefined) return null
  return {x, y, z}
}

export function writeStoredInterpreterDisplayPositions(positions: Map<string, UiRuntimeViewPointVector>): void {
  try {
    localStorage.setItem(
      INTERPRETER_DISPLAY_POSITIONS_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(positions.entries())),
    )
  } catch {
    // Storage can be unavailable in private contexts.
  }
}

export function readStoredInterpreterDisplayPositions(): Map<string, UiRuntimeViewPointVector> {
  try {
    const raw = localStorage.getItem(INTERPRETER_DISPLAY_POSITIONS_STORAGE_KEY)
    if (raw === null) return new Map()
    return normalizeStoredInterpreterDisplayPositions(JSON.parse(raw))
  } catch {
    return new Map()
  }
}

function normalizeStoredInterpreterDisplayPositions(value: unknown): Map<string, UiRuntimeViewPointVector> {
  const object = objectParamMaybe(value)
  if (object === undefined) return new Map()
  const positions = new Map<string, UiRuntimeViewPointVector>()
  for (const [displayId, rawPosition] of Object.entries(object)) {
    const position = viewPointVectorParam(rawPosition)
    if (position !== null) positions.set(displayId, position)
  }
  return positions
}
