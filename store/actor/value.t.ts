/**
 * Канонические record-типы сущности `value` (и `value_item`).
 *
 * Запись `value` — атомарная единица значения. Может разделяться несколькими
 * акторами через `actor_value` — это и есть entanglement. Никаких отдельных
 * таблиц `actor_entanglement_*` нет.
 */

export type ScalarKind = "null" | "boolean" | "number" | "string" | "enum"
export type ValueKind = ScalarKind | "list"

/** Запись значения. Может разделяться несколькими акторами (entanglement). */
export interface ValueRecord {
  uuid: string
  kind: ValueKind
  boolean?: boolean
  number?: number
  text?: string
  /** UUID `field_enum_variant` из meta (для kind="enum"). */
  variant?: string
}

/** Элемент списочного значения (когда `value.kind === "list"`). */
export interface ValueItemRecord {
  value: string
  position: number
  kind: ScalarKind
  boolean?: boolean
  number?: number
  text?: string
  variant?: string
}

/** Скалярная или enum-часть значения, заполняется одна из колонок в зависимости от kind. */
export interface Scalar {
  kind: ScalarKind
  boolean?: boolean
  number?: number
  text?: string
  variant?: string
}
