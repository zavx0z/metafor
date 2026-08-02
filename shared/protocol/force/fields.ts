const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export type RuntimeFieldPatchValue = { fields: Record<string, unknown> }

/** Canonical Boundary identity and visible value for one committed Field binding. */
export type CanonicalRuntimeFieldValue = {
  valueId: number
  value: unknown
}

export type CanonicalRuntimeFieldPatchValue = {
  fields: Record<string, CanonicalRuntimeFieldValue>
}

export type DarkGluonPatchPart = { op: "replace" | "remove"; path: number; value: RuntimeFieldPatchValue }

export type DarkHiggsPatchPart = { op: "replace" | "remove"; path: number | string; value: RuntimeFieldPatchValue }

export const resolveForceFieldsPayload = (value: unknown): Record<string, unknown> | null => {
  if (!isRecord(value)) return null
  const fields = value.fields
  if (!isRecord(fields)) return null
  if (!Object.values(fields).some((entry) =>
    isRecord(entry) && Number.isSafeInteger(entry.valueId) && "value" in entry)) {
    return fields
  }
  return Object.fromEntries(Object.entries(fields).map(([field, entry]) => [
    field,
    isRecord(entry) && Number.isSafeInteger(entry.valueId) && "value" in entry
      ? entry.value
      : entry,
  ]))
}

/** Resolves only committed Gluon payloads carrying canonical Value identity. */
export const resolveCanonicalForceFieldsPayload = (
  value: unknown,
): Record<string, CanonicalRuntimeFieldValue> | null => {
  if (!isRecord(value) || !isRecord(value.fields)) return null
  const result: Record<string, CanonicalRuntimeFieldValue> = {}
  for (const [field, entry] of Object.entries(value.fields)) {
    if (
      !isRecord(entry) ||
      !Number.isSafeInteger(entry.valueId) ||
      Number(entry.valueId) <= 0 ||
      !("value" in entry) ||
      Object.keys(entry).length !== 2
    ) return null
    result[field] = {valueId: Number(entry.valueId), value: entry.value}
  }
  return result
}

export const resolveForceFieldId = (address: string): number | null => {
  if (!/^[1-9]\d*$/.test(address)) return null
  const id = Number(address)
  return Number.isSafeInteger(id) ? id : null
}
