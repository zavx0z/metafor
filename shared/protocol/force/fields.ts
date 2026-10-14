const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export type RuntimeFieldPatchValue = { fields: Record<string, unknown> }

/**
Одна владельческая transaction значений одного Atom. Набор с topology Field
использует Higgs, ordinary-only набор использует Gluon.
Boundary проверяет полный CAS и типы до записи и сохраняет topology в той же
transaction. Незамеченный этим closed discriminator legacy Higgs не получает
право внешней записи. [Закон](../../../quantum/boundary/DOMAIN.md#атомарный-ввод-значений-fields).
*/
export type RuntimeFieldValuesTransaction = {
  kind: "field-values/v1"
  fields: Record<string, unknown>
  expectedFields: Record<string, unknown>
}

export function resolveForceFieldValuesTransaction(value: unknown): RuntimeFieldValuesTransaction | null {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "expectedFields,fields,kind" || value.kind !== "field-values/v1" ||
      !isRecord(value.fields) || !isRecord(value.expectedFields)) return null
  const keys = Object.keys(value.fields).sort()
  if (keys.length === 0 || keys.some(key => resolveForceFieldId(key) === null) || keys.join(",") !== Object.keys(value.expectedFields).sort().join(",")) return null
  return structuredClone(value) as RuntimeFieldValuesTransaction
}

/** Canonical Boundary identity and visible value for one committed Field binding. */
export type CanonicalRuntimeFieldValue = {
  valueId: number
  value: unknown
}

export type CanonicalRuntimeFieldPatchValue = {
  fields: Record<string, CanonicalRuntimeFieldValue>
}

/**
Один подтверждённый Boundary write-set одного Atom, включая mixed Fields.
Matrix применяет весь набор до следующего такта; Energy наблюдает тот же commit.
[Закон](../../../quantum/boundary/DOMAIN.md#атомарный-ввод-значений-fields).
*/
export type CanonicalFieldValuesCommit = CanonicalRuntimeFieldPatchValue & {
  kind: "field-values-commit/v1"
}

export const resolveCanonicalFieldValuesCommit = (value: unknown): CanonicalFieldValuesCommit | null => {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "fields,kind" || value.kind !== "field-values-commit/v1") return null
  const fields = resolveCanonicalForceFieldsPayload(value)
  if (!fields || Object.keys(fields).length === 0 || Object.keys(fields).some(key => resolveForceFieldId(key) === null)) return null
  return {kind: "field-values-commit/v1", fields}
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
