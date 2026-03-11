/**
 * Типы для field.ts.
 *
 * @packageDocumentation
 */

/**
 * Определение поля на уровне Bulk.
 */
export interface FieldDefinition {
  type: "number" | "boolean" | "string" | "array<number>" | "array<string>" | "enum<string>" | "enum<number>"
  values?: any[]
}

/**
 * Карта определений полей для актора.
 */
export type FieldsDefinition = Record<string, FieldDefinition>
