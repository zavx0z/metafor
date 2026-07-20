const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export type RuntimeFieldPatchValue = { fields: Record<string, unknown> }

export type DarkGluonPatchPart = { op: "replace" | "remove"; path: number; value: RuntimeFieldPatchValue }

export type DarkHiggsPatchPart = { op: "replace" | "remove"; path: number | string; value: RuntimeFieldPatchValue }

export const resolveForceFieldsPayload = (value: unknown): Record<string, unknown> | null => {
  if (!isRecord(value)) return null
  const fields = value.fields
  return isRecord(fields) ? fields : null
}

export const resolveForceFieldId = (address: string): number | null => {
  if (!/^[1-9]\d*$/.test(address)) return null
  const id = Number(address)
  return Number.isSafeInteger(id) ? id : null
}
