import type { ParsedCheck } from "./condition.t"
import type { PreparedEntanglementProjection } from "./entangled.t"
import type { BraneValue, Field } from "./index.t"
import type { StoredStringTable } from "./string-table"

/**
 * Уплощённые атомарные проверки одного поля.
 *
 * Boundary переводит вложенные condition-объекты в эту форму до передачи в Fields.
 */
export interface FlattenedFieldChecks {
  fieldIndex: number
  checks: ParsedCheck[]
}

/** Уплощённое ребро перехода между состояниями. */
export interface FlattenedTransition {
  targetState: number | null
  conditions: FlattenedFieldChecks[]
}

/** Уплощённый вход одной браны, который Fields дедуплицирует и нормализует. */
export interface FlattenedBraneInput {
  values: [number, BraneValue][]
  state: number
  transitions: FlattenedTransition[][]
}

/** Уплощённый вход Boundary, который передаётся в Fields для сборки store. */
export interface FlattenedBoundaryInput {
  fields: Field[]
  branes: FlattenedBraneInput[]
  entanglement?: PreparedEntanglementProjection
}

export type { StoredStringTable }
