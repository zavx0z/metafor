/**
 * Типы полей для GPU.
 *
 * @packageDocumentation
 */

export const FieldType = {
  F32: 0,
  U32: 1,
  BOOL: 2,
  STRING_PTR: 3,
  ARRAY_PTR: 4,
  SHARED_PTR: 5,
} as const

export type FieldTypeValue = typeof FieldType[keyof typeof FieldType]

export interface Field {
  fieldId: number
  type: FieldTypeValue
  name?: string
  elementType?: string
  enumValues?: any[]
}
