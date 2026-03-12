import type { Field } from "../gravity/schema.t"
import { FieldType } from "../gravity/schema.t"

export type NormalizedScalarValue = number | boolean
export type NormalizedValue = NormalizedScalarValue | NormalizedScalarValue[]

export function normalizeFieldValue(
  value: unknown,
  field: Field | undefined,
  stringInterner: { intern(value: string): number },
): NormalizedValue {
  if (!field) {
    throw new Error("Field definition is required for normalization")
  }

  if (field.enum) {
    return normalizeEnumValue(value, field.enum)
  }

  switch (field.type) {
    case FieldType.F32:
    case FieldType.U32:
      return Number(value)
    case FieldType.BOOL:
      return Boolean(value)
    case FieldType.STRING_PTR:
      if (value === null) {
        return 0
      }
      if (typeof value !== "string") {
        throw new Error(`Expected string for STRING_PTR, got ${typeof value}`)
      }
      return stringInterner.intern(value)
    case FieldType.ARRAY_PTR:
      if (!Array.isArray(value)) {
        throw new Error(`Expected array for ARRAY_PTR, got ${typeof value}`)
      }
      return value.map((item) => normalizeArrayItem(item, field.elementType, stringInterner))
    default:
      return Number(value)
  }
}

function normalizeEnumValue(value: unknown, enumValues: unknown[]): number {
  if (value === null) {
    return 0
  }
  if (typeof value === "number") {
    return value
  }
  const index = enumValues.indexOf(value)
  if (index === -1) {
    throw new Error(`Value '${String(value)}' not found in enum: [${enumValues}]`)
  }
  return index
}

function normalizeArrayItem(
  value: unknown,
  elementType: Field["elementType"],
  stringInterner: { intern(value: string): number },
): NormalizedScalarValue {
  switch (elementType) {
    case "boolean":
      return Boolean(value)
    case "string":
      if (value === null) {
        return 0
      }
      if (typeof value !== "string") {
        throw new Error(`Expected string array item, got ${typeof value}`)
      }
      return stringInterner.intern(value)
    case "number":
    default:
      return Number(value)
  }
}
