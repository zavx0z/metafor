/**
 * Типы для field.ts.
 *
 * @packageDocumentation
 */

/**
 * Определение поля на уровне Force (семантика).
 */
export interface FieldDefinition {
  type: "number" | "boolean" | "string" | "array<number>" | "array<string>" | "enum<string>" | "enum<number>"
  values?: any[]
}

/**
 * Карта определений полей для монады.
 */
export type FieldsDefinition = Record<string, FieldDefinition>
