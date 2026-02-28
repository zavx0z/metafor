/**
 * Типы для модуля superposition — компиляция суперпозиций в bytecode.
 *
 * @packageDocumentation
 */

/**
 * Инструкция условия для байт-кода.
 * Формат: [fieldType, fieldIndex, op, valEncoded]
 */
export interface ConditionInstruction {
  /** Тип поля для шейдера. */
  fieldType: number
  /** Индекс поля. */
  fieldIndex: number
  /** Код операции сравнения. */
  op: number
  /** Закодированное значение или указатель на кучу. */
  valEncoded: number
}

/**
 * Результат компиляции условий с кучей для списков.
 */
export interface CompiledConditionsResult {
  /** Инструкции условий. */
  instructions: ConditionInstruction[]
  /** Куча для списков (IN/NOT_IN): [count, item1, item2, ...]. */
  heap: number[]
}

/**
 * Структура байт-кода суперпозиции.
 *
 * Формат:
 * ```
 * Индексы:  [0, 1, ...]              [N, N+1, ...]                [...]
 *           [state_ptr_0, ...]       [tr_count, target, cond_ptr] [cond_count, type, ...]
 *           ↑ state table            ↑ state blocks               ↑ condition blocks
 *                                      + heap для списков IN/NOT_IN
 * ```
 */
export interface BytecodeLayout {
  /** State table: указатели на состояния. */
  stateTable: number[]
  /** State blocks: блоки состояний с переходами. */
  stateBlocks: number[]
  /** Condition blocks: блоки условий. */
  conditionBlocks: number[]
  /** Heap для списков IN/NOT_IN. */
  heap: number[]
}

/**
 * Результат компиляции одной суперпозиции.
 */
export interface FieldBytecode {
  /** Байт-код для GPU. */
  bytecode: Uint32Array
  /** Смещение в общем буфере bytecode. */
  bytecodeOffset: number
}

/**
 * Результат компиляции всех полей (ансамбля).
 */
export interface CompiledRules {
  /** Объединённый байт-код всех суперпозиций. */
  bytecode: Uint32Array
  /** Смещения начала каждой суперпозиции: [offset0, offset1, ...]. */
  bytecodeOffsets: Uint32Array
}
