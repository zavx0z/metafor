/** Типы для `@energy/weak/gpu/bytecode`. */

/** Одна инструкция проверки условия в производном bytecode. */
export interface ConditionInstruction {
  fieldType: number
  fieldIndex: number
  op: number
  valEncoded: number
}

/** Результат компиляции условий вместе с локальной heap-секцией для списков. */
export interface CompiledConditionsResult {
  instructions: ConditionInstruction[]
  heap: number[]
}

/** Уплощённая форма перехода перед компиляцией в производный bytecode. */
export interface FlattenedTransition {
  targetState: number | null
  conditions: Array<{
    fieldIndex: number
    checks: Array<{
      op: number
      val: number | boolean | (number | boolean)[]
    }>
  }>
}
