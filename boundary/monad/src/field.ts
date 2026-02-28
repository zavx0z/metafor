/**
 * Преобразование типов полей для Boundary.
 *
 * @packageDocumentation
 */

import { FieldType, type FieldDefinition, type FieldTypeValue } from "@metafor/boundary"
import type { Field } from "@metafor/boundary"

/**
 * Преобразует определение поля из строкового типа в числовой.
 *
 * @param def - Определение поля из FieldsDefinition
 * @returns Готовые данные для registry.register()
 */
export function convertField(def: FieldDefinition): Field {
  const defTyped = def as { type?: string; values?: any[] } | string
  const typeStr = typeof defTyped === "string" ? defTyped : defTyped.type
  const enumValues = typeof defTyped !== "string" && "values" in defTyped ? defTyped.values : undefined

  let fieldType: FieldTypeValue
  let elementType: string | undefined

  switch (typeStr) {
    case "number":
      fieldType = FieldType.F32
      break
    case "boolean":
      fieldType = FieldType.BOOL
      break
    case "string":
      fieldType = FieldType.STRING_PTR
      break
    case "array<string>":
      fieldType = FieldType.ARRAY_PTR
      elementType = "string"
      break
    case "array<number>":
      fieldType = FieldType.ARRAY_PTR
      elementType = "number"
      break
    case "enum<string>":
    case "enum<number>":
      fieldType = FieldType.U32
      break
    default:
      throw new Error(`Unknown field type: '${typeStr}'`)
  }

  return {
    type: fieldType,
    ...(elementType !== undefined ? { elementType } : {}),
    ...(enumValues !== undefined ? { enumValues } : {}),
  }
}
