import type { ParsedCheck } from "./condition.t"
import type { PreparedEntanglementProjection } from "../strong/entangled.t"
import type { BraneValue, Field } from "./schema.t"

/**
 * Уплощённые атомарные проверки одного поля.
 *
 * Слой gravity переводит вложенные условия в эту форму до канонизации.
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

/** Уплощённый вход одной браны, который strong переводит в каноническую store-форму. */
export interface FlattenedBraneInput {
  values: [number, BraneValue][]
  state: number
  transitions: FlattenedTransition[][]
  stateNames: string[]
}

/** Уплощённый matrix-вход, который передаётся в strong для сборки store. */
export interface FlattenedMatrixInput {
  fields: Field[]
  branes: FlattenedBraneInput[]
  entanglement?: PreparedEntanglementProjection
}
