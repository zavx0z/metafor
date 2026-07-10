export const FORCE_DELETE_KEYS = "$delete"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const forceValueEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((item, index) => forceValueEqual(item, right[index]))
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && forceValueEqual(left[key], right[key]))
}

/** Returns only changed properties; removed keys are explicit and null remains data. */
export const createForceDelta = (previous: unknown, next: unknown): unknown => {
  if (forceValueEqual(previous, next)) return {}
  if (!isRecord(previous) || !isRecord(next)) return structuredClone(next)
  const changed: Record<string, unknown> = {}
  const removed: string[] = []
  for (const key of Object.keys(previous)) if (!Object.hasOwn(next, key)) removed.push(key)
  if (removed.length > 0) changed[FORCE_DELETE_KEYS] = removed
  for (const [key, value] of Object.entries(next)) {
    if (!Object.hasOwn(previous, key)) changed[key] = structuredClone(value)
    else if (!forceValueEqual(previous[key], value)) changed[key] = createForceDelta(previous[key], value)
  }
  return changed
}

/** Applies a replace delta in place and preserves the addressed object identity. */
export const applyForceDelta = (target: Record<string, unknown>, delta: Record<string, unknown>): void => {
  const removed = delta[FORCE_DELETE_KEYS]
  if (Array.isArray(removed)) {
    for (const key of removed) if (typeof key === "string") delete target[key]
  }
  for (const [key, value] of Object.entries(delta)) {
    if (key === FORCE_DELETE_KEYS) continue
    if (isRecord(value) && isRecord(target[key])) applyForceDelta(target[key] as Record<string, unknown>, value)
    else target[key] = structuredClone(value)
  }
}

/** Exact add/replay reconciliation while retaining the target object itself. */
export const replaceForceRecord = (target: Record<string, unknown>, source: Record<string, unknown>): void => {
  for (const key of Object.keys(target)) if (!Object.hasOwn(source, key)) delete target[key]
  for (const [key, value] of Object.entries(source)) target[key] = structuredClone(value)
}
