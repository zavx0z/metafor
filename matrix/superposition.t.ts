/**
 * Типы для модуля superposition — компиляция суперпозиций в bytecode.
 * @packageDocumentation
 */

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