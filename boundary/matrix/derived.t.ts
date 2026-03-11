/**
 * Типы для @boundary/matrix/derived.
 *
 * @packageDocumentation
 */

/** Производные execution-данные Matrix, которые GPU локально выводит из канонического store. */
export interface DerivedMatrixData {
  /** Производный heap для значений и массивов. */
  heap: Uint32Array
  /** Смещения локальных блоков бран в производном heap. */
  blockPtrs: number[]
  /** Смещения shared-блоков в производном heap. */
  sharedBlockPtrs: number[]
  /** Производный bytecode переходов и условий. */
  bytecode: Uint32Array
  /** Смещения начала bytecode для каждой браны. */
  bytecodeOffsets: Uint32Array
  /** Производная копия state snapshot для GPU runtime. */
  states: Uint32Array
}
