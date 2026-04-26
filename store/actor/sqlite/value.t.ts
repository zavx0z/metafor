/**
 * Канонические record-типы сущности `value` (и `value_list_item`).
 *
 * Запись `value` — атомарная единица значения. Может разделяться несколькими
 * акторами через `actor_value` — это и есть entanglement.
 *
 * Discriminated union по `kind` — каждая ветка содержит ровно те поля,
 * которые есть в соответствующей типизированной таблице (`value_boolean`,
 * `value_number`, `value_string`, `value_enum`). Никаких optional skim-колонок
 * ради общей формы.
 */

/** Скалярные типы значений. */
export type ScalarKind = "null" | "boolean" | "number" | "string" | "enum"

/** Все типы значений (скаляры + list). */
export type ValueKind = ScalarKind | "list"

/** Скалярная (или enum) часть значения. Используется и как value, и как list-item. */
export type Scalar =
  | { kind: "null" }
  | { kind: "boolean"; boolean: boolean }
  | { kind: "number"; number: number }
  | { kind: "string"; text: string }
  /** UUID `field_enum_variant` из meta. */
  | { kind: "enum"; variant: string }

/** Полный record для одной записи `value`. List — отдельная ветка без скалярного содержимого. */
export type ValueRecord =
  | { uuid: string; kind: "null" }
  | { uuid: string; kind: "boolean"; boolean: boolean }
  | { uuid: string; kind: "number"; number: number }
  | { uuid: string; kind: "string"; text: string }
  | { uuid: string; kind: "enum"; variant: string }
  | { uuid: string; kind: "list" }

/** Один элемент списочного значения (kind в Scalar; вложенные списки не поддерживаются). */
export type ValueItemRecord = Scalar & { value: string; position: number }
