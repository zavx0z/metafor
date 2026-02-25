/**
 * Преобразование типов полей для Boundary.
 *
 * @packageDocumentation
 */

import { FieldType, type FieldDefinition, type FieldTypeValue, type RegisteredFieldConfig as RegisteredField } from "@metafor/boundary"

/**
 * Опции для зарегистрированного поля.
 */
export type FieldRegisterOptions = NonNullable<RegisteredField["options"]>

/**
 * Преобразует определение поля из строкового типа в числовой.
 *
 * @param def - Определение поля из FieldsDefinition
 * @returns Готовые данные для registry.register()
 */
export function convertField(def: FieldDefinition): RegisteredField {
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
    options: {
      ...(elementType !== undefined ? { elementType } : {}),
      ...(enumValues !== undefined ? { enumValues } : {}),
    },
  }
}

/**
 * Преобразует все поля из FieldsDefinition в зарегистрированные поля.
 *
 * @param fields - Определение полей из BoundaryConfig
 * @returns Record с готовыми данными для регистрации
 */
export function convertAllFields(fields: Record<string, FieldDefinition>): Record<string, RegisteredField> {
  const result: Record<string, RegisteredField> = {}

  for (const [name, def] of Object.entries(fields)) {
    result[name] = convertField(def)
  }

  return result
}
